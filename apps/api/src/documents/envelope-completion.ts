import { sha256Hex } from '@devscribed/validation';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PdfStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PdfRenderer } from '../pdf/pdf-renderer';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import type { Job } from '../queue/job-queue';
import { SignatureProvider } from '../signature/signature-provider';
import type {
  FinalizeSigner,
  FinalizeSignerField,
  SignatureMethod,
} from '../signature/signature-provider';
import { FileStorage, PRESIGNED_URL_TTL_SECONDS } from '../storage/file-storage';
import { EnvelopeEventsService } from './envelope-events.service';
import { readFieldValues, readFields, readSignerRoles } from './envelopes.service';

/** Requirement 25 — the download link stays usable for 30 days after completion. */
export const DOWNLOAD_WINDOW_DAYS = 30;

/**
 * The final-document job: render, hash, store, notify (requirements 27–31).
 *
 * It runs off the request path — `JobQueue.afterCommit` holds it until the signing
 * transaction commits — and it never touches the envelope's *status*. That separation is
 * the whole of requirement 31: by the time this class runs, the signatures are legally
 * captured, so a renderer that crashes or a bucket that refuses a write may only ever
 * move `PdfStatus` to `failed`. There is no code path here that can undo a completion.
 */
@Injectable()
export class EnvelopeCompletionService implements OnModuleInit {
  private readonly log = new Logger(EnvelopeCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EnvelopeEventsService,
    private readonly mail: MailService,
    private readonly renderer: PdfRenderer,
    private readonly storage: FileStorage,
    private readonly signature: SignatureProvider,
    private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler('pdf-render', (job) => this.run(job));
  }

  async run(job: Job): Promise<void> {
    const envelope = await this.prisma.envelope.findUnique({
      where: { id: job.envelopeId },
      include: {
        signers: { orderBy: { order: 'asc' } },
        templateVersion: { include: { template: true } },
        organization: true,
      },
    });
    if (!envelope) {
      this.log.warn(`Render job for unknown envelope ${job.envelopeId}; dropping it`);
      return;
    }

    // Invariant 6 / requirement 29 — write-once. An SQS redelivery, a manual retry, or a
    // duplicated enqueue all land here, and a completed document is never re-rendered.
    if (envelope.signedPdfKey) {
      this.log.debug(`Envelope ${envelope.id} already has a signed PDF; nothing to do`);
      return;
    }

    if (!envelope.renderedHtml || !envelope.documentHash) {
      this.log.error(`Envelope ${envelope.id} completed without a frozen document`);
      await this.markFailed(envelope.id, envelope.documentHash, 'missing_document');
      return;
    }

    const roles = readSignerRoles(envelope.templateVersion.signerRoles);
    const values = readFieldValues(envelope.fieldValues);

    // The values a signer typed on the signing page: they were not in the document when
    // it was frozen, so the provider needs them both to fill the placeholders the freeze
    // left standing and to attribute them on the certificate.
    const signerEnteredFields: FinalizeSignerField[] = readFields(
      envelope.templateVersion.fieldsSnapshot,
    ).flatMap((field) => {
      const signer = envelope.signers.find((s) => field.filledBy === `signer:${s.roleKey}`);
      if (!signer || (values[field.key] ?? '').trim().length === 0) return [];
      return [
        {
          key: field.key,
          label: field.label,
          signerName: signer.name,
          roleLabel: roles.find((r) => r.key === signer.roleKey)?.label ?? signer.roleKey,
        },
      ];
    });

    try {
      const finalized = await this.signature.finalize({
        envelopeId: envelope.id,
        title: envelope.title,
        renderedHtml: envelope.renderedHtml,
        fieldValues: values,
        signerEnteredFields,
        documentHash: envelope.documentHash,
        templateName: envelope.templateVersion.template.name,
        templateVersion: envelope.templateVersion.versionNumber,
        completedAt: envelope.completedAt ?? new Date(),
        // The organization has no timezone column; the creator's is the closest honest
        // answer, and the certificate's UTC row is the authoritative one either way.
        organizationTimeZone: await this.timeZoneOf(envelope.createdByAccountId),
        signers: envelope.signers.map<FinalizeSigner>((signer) => ({
          name: signer.name,
          email: signer.email,
          roleLabel: roles.find((r) => r.key === signer.roleKey)?.label ?? signer.roleKey,
          order: signer.order,
          signatureImage: signer.signatureImage ?? '',
          method: (signer.signatureType ?? 'drawn') as SignatureMethod,
          signedAt: signer.signedAt ?? new Date(),
          consentAcceptedAt: signer.consentAcceptedAt ?? signer.signedAt ?? new Date(),
          ipAddress: '',
          userAgent: '',
        })),
      });

      const pdf = await this.renderer.render(finalized.html);
      const hash = sha256Hex(new Uint8Array(pdf));
      // Content-addressed, per the S3 key layout the spec fixes. A key derived from the
      // bytes cannot be reused for different content, which is what makes write-once
      // structural rather than a convention.
      const key = `signed/${envelope.organizationId}/${envelope.id}/${hash}.pdf`;

      if (!(await this.storage.exists(key))) {
        await this.storage.put(key, pdf, 'application/pdf');
      }

      // The guard in the WHERE clause, not just in the read above: two deliveries that
      // raced past the early return still produce exactly one winner, and the loser
      // leaves the stored key alone.
      const written = await this.prisma.envelope.updateMany({
        where: { id: envelope.id, signedPdfKey: null },
        data: { signedPdfKey: key, signedPdfHash: hash, pdfStatus: PdfStatus.ready },
      });
      if (written.count === 0) {
        this.log.debug(`Envelope ${envelope.id} was finalized by a concurrent render`);
        return;
      }

      await this.notifyCompletion(envelope, key);
    } catch (error) {
      // Requirement 31. The envelope stays `completed`; only the PDF is marked failed.
      const reason = error instanceof Error ? error.stack || error.message : String(error);
      this.log.error(`Rendering the signed PDF for envelope ${envelope.id} failed: ${reason}`);
      await this.markFailed(envelope.id, envelope.documentHash, 'render_failed');
    }
  }

  /** Requirement 30 — both parties, with a download link. */
  private async notifyCompletion(
    envelope: {
      id: string;
      title: string;
      completedAt: Date | null;
      organization: { name: string };
      signers: { name: string; email: string }[];
    },
    key: string,
  ): Promise<void> {
    const completedAt = envelope.completedAt ?? new Date();
    const downloadExpiresAt = new Date(
      completedAt.getTime() + DOWNLOAD_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    for (const signer of envelope.signers) {
      if (!signer.email) continue;
      try {
        // A fresh presigned URL per recipient: the grant is short-lived by design, and
        // re-issuing it is cheaper than one shared link nobody can revoke.
        const url = await this.storage.presignedUrl(key, PRESIGNED_URL_TTL_SECONDS);
        await this.mail.sendEnvelopeCompleted({
          to: signer.email,
          recipientName: signer.name,
          envelopeTitle: envelope.title,
          organizationName: envelope.organization.name,
          downloadUrl: url,
          downloadExpiresAt,
          completedAt,
        });
      } catch (error) {
        // The PDF is stored and the envelope is complete; a failed notice is a
        // deliverability problem, not a reason to mark the render failed.
        this.log.error(
          `Completion notice to ${signer.email} failed: ${
            error instanceof Error ? error.message : error
          }`,
        );
      }
    }
  }

  private async markFailed(
    envelopeId: string,
    documentHash: string | null,
    reason: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.envelope.update({
        where: { id: envelopeId },
        data: { pdfStatus: PdfStatus.failed },
      });
      await this.events.record(tx, {
        envelopeId,
        type: 'pdf_failed',
        documentHash,
        metadata: { reason },
      });
    });
  }

  private async timeZoneOf(accountId: string): Promise<string> {
    const account = await this.prisma.account.findUnique({
      where: { id: accountId },
      select: { timezone: true },
    });
    return account?.timezone || 'UTC';
  }
}

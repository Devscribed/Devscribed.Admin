import { sha256Hex } from '@devscribed/validation';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EnvelopeStatus, PdfStatus } from '@prisma/client';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import type { Job } from '../queue/job-queue';
import { SigningProviderRegistry } from '../signature/provider-registry';
import type {
  AssemblySigner,
  AssemblySignerField,
  DocumentAssembly,
  SignatureMethod,
} from '../signature/signing-provider';
import { FileStorage, PRESIGNED_URL_TTL_SECONDS } from '../storage/file-storage';
import { EnvelopeEventsService } from './envelope-events.service';
import { readFieldValues, readFields, readSignerRoles } from './envelopes.service';

/** Requirement 25 — the download link stays usable for 30 days after completion. */
export const DOWNLOAD_WINDOW_DAYS = 30;

/**
 * The final-document job: produce the bytes, hash, store, notify (spec 02 requirements
 * 27–31), and — under a provider that supplies its own completed document — flip the
 * envelope to `completed` once the bytes are ours (spec 04 requirement 27).
 *
 * **The ordering is inverted between the two providers, deliberately.** Under the
 * in-house engine the signatures are the asset and the PDF is derived, so the envelope
 * completes first and the render follows: a renderer that crashes may only ever move
 * `PdfStatus` to `failed`, and there is no code path that can undo a completion. Under a
 * provider that produced the artefact itself, their PDF *with its audit page* is the
 * irreplaceable thing — we did not produce it and cannot reproduce it — so the order is
 * download → put → transactional status update, and invariant 10 says the bytes are in S3
 * before `status = completed` commits. A failure between them leaves `pdfStatus = pending`
 * with `providerError` set and retries on the sweep; it never leaves an envelope claiming
 * to be complete with no document behind it.
 *
 * What is identical under both, and is reused rather than re-derived: the content-addressed
 * key `signed/{orgId}/{envelopeId}/{sha256}.pdf`, the `storage.exists()` check, and the
 * `updateMany({ where: { signedPdfKey: null } })` guard that makes exactly one racer win
 * and leaves the loser's stored object alone.
 */
@Injectable()
export class EnvelopeCompletionService implements OnModuleInit {
  private readonly log = new Logger(EnvelopeCompletionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EnvelopeEventsService,
    private readonly mail: MailService,
    private readonly storage: FileStorage,
    private readonly providers: SigningProviderRegistry,
    private readonly queue: JobQueue,
  ) {}

  onModuleInit(): void {
    this.queue.registerHandler('pdf-render', (job) => this.run(job));
    // Spec 04 requirement 27 — the remote half. A separate job name rather than a branch
    // inside `pdf-render`, because the two do opposite things to the envelope's status.
    this.queue.registerHandler('provider-complete', (job) =>
      this.completeFromProvider(job.envelopeId).then(() => undefined),
    );
  }

  async run(job: Job): Promise<void> {
    const envelope = await this.load(job.envelopeId);
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

    try {
      const provider = this.providers.require(envelope.providerKey);
      const produced = await provider.completedDocument({
        envelopeId: envelope.id,
        providerRef: envelope.providerRef,
        // Only a provider that assembles the document itself is handed the certificate's
        // inputs. Requirement 28: under a provider that supplies its own completed
        // document our Certificate of Completion is not generated at all — their audit
        // page is the certificate, and issuing both would put two documents in the record
        // with different timestamps for the same act.
        assembly:
          provider.capabilities.completedDocument === 'ours'
            ? await this.assemblyFor(envelope)
            : undefined,
      });

      const key = await this.store(envelope, produced.bytes);
      if (!key) return;

      await this.notifyCompletion(envelope, key.key);
    } catch (error) {
      // Spec 02 requirement 31. The envelope stays `completed`; only the PDF is marked
      // failed. By the time this runs the signatures are legally captured.
      const reason = error instanceof Error ? error.stack || error.message : String(error);
      this.log.error(`Rendering the signed PDF for envelope ${envelope.id} failed: ${reason}`);
      await this.markFailed(envelope.id, envelope.documentHash, 'render_failed');
    }
  }

  /**
   * Spec 04 requirement 27 — the remote path. Download, store, and only then complete.
   *
   * Called by the reconciler once `fetchState` has said the document is `Completed`, and
   * again by the sweep for anything left with `pdfStatus = pending`. Both are safe to
   * repeat: the content-addressed key and the `signedPdfKey IS NULL` guard make the second
   * attempt a no-op rather than a second completion.
   */
  async completeFromProvider(envelopeId: string): Promise<{ completed: boolean; error?: string }> {
    const envelope = await this.load(envelopeId);
    if (!envelope) return { completed: false, error: 'unknown_envelope' };
    if (envelope.status === EnvelopeStatus.completed && envelope.signedPdfKey) {
      return { completed: true };
    }

    try {
      const provider = this.providers.require(envelope.providerKey);
      const produced = await provider.completedDocument({
        envelopeId: envelope.id,
        providerRef: envelope.providerRef,
      });

      const stored = await this.store(envelope, produced.bytes, { markCompleted: true });
      if (!stored) {
        // A concurrent delivery won the race and has already completed the envelope; its
        // stored object is left exactly as it is (TC-04-INT-13).
        return { completed: true };
      }

      await this.prisma.envelope.updateMany({
        where: { id: envelope.id },
        data: { providerError: null },
      });
      await this.notifyCompletion(envelope, stored.key);
      return { completed: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.log.warn(`Completing envelope ${envelope.id} from its provider failed: ${reason}`);
      // Never terminal, and never a status change: the envelope is not marked completed
      // until the bytes are ours (invariant 10), and the sweep retries.
      await this.prisma.envelope.updateMany({
        where: { id: envelope.id, status: { not: EnvelopeStatus.completed } },
        data: { pdfStatus: PdfStatus.pending, providerError: reason },
      });
      return { completed: false, error: reason };
    }
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  private load(envelopeId: string) {
    return this.prisma.envelope.findUnique({
      where: { id: envelopeId },
      include: {
        signers: { orderBy: { order: 'asc' } },
        templateVersion: { include: { template: true } },
        organization: true,
      },
    });
  }

  /**
   * Hash, store content-addressed, and claim the envelope. Returns `null` when a
   * concurrent writer claimed it first, which is the only way this can lose.
   */
  private async store(
    envelope: { id: string; organizationId: string; documentHash: string | null },
    bytes: Buffer,
    options: { markCompleted?: boolean } = {},
  ): Promise<{ key: string; hash: string } | null> {
    assertLooksLikePdf(bytes);

    const hash = sha256Hex(new Uint8Array(bytes));
    // Content-addressed, per the S3 key layout the spec fixes. A key derived from the
    // bytes cannot be reused for different content, which is what makes write-once
    // structural rather than a convention.
    const key = `signed/${envelope.organizationId}/${envelope.id}/${hash}.pdf`;

    if (!(await this.storage.exists(key))) {
      await this.storage.put(key, bytes, 'application/pdf');
    }

    const completedAt = new Date();

    return this.prisma.$transaction(async (tx) => {
      // The guard in the WHERE clause, not just in a read above: two deliveries that raced
      // still produce exactly one winner, and the loser leaves the stored key alone.
      const written = await tx.envelope.updateMany({
        where: { id: envelope.id, signedPdfKey: null },
        data: {
          signedPdfKey: key,
          signedPdfHash: hash,
          pdfStatus: PdfStatus.ready,
          ...(options.markCompleted
            ? { status: EnvelopeStatus.completed, completedAt }
            : {}),
        },
      });
      if (written.count === 0) {
        this.log.debug(`Envelope ${envelope.id} was finalized by a concurrent writer`);
        return null;
      }

      if (options.markCompleted) {
        await tx.signingToken.updateMany({
          where: { signer: { envelopeId: envelope.id }, isInvalidated: false, usedAt: null },
          data: { isInvalidated: true },
        });
        await this.events.record(tx, {
          envelopeId: envelope.id,
          type: 'completed',
          documentHash: envelope.documentHash,
          metadata: { source: 'provider' },
        });
      }

      return { key, hash };
    });
  }

  /**
   * Everything the in-house engine needs to assemble the completed document: the frozen
   * HTML, every value, and the attribution the Certificate of Completion prints.
   */
  private async assemblyFor(envelope: LoadedForCompletion): Promise<DocumentAssembly> {
    const roles = readSignerRoles(envelope.templateVersion.signerRoles);
    const values = readFieldValues(envelope.fieldValues);

    // The values a signer typed on the signing page: they were not in the document when
    // it was frozen, so the assembly needs them both to fill the placeholders the freeze
    // left standing and to attribute them on the certificate.
    const signerEnteredFields: AssemblySignerField[] = readFields(
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

    return {
      envelopeId: envelope.id,
      title: envelope.title,
      renderedHtml: envelope.renderedHtml ?? '',
      fieldValues: values,
      signerEnteredFields,
      documentHash: envelope.documentHash ?? '',
      templateName: envelope.templateVersion.template.name,
      templateVersion: envelope.templateVersion.versionNumber,
      completedAt: envelope.completedAt ?? new Date(),
      // The organization has no timezone column; the creator's is the closest honest
      // answer, and the certificate's UTC row is the authoritative one either way.
      organizationTimeZone: await this.timeZoneOf(envelope.createdByAccountId),
      signers: envelope.signers.map<AssemblySigner>((signer) => ({
        name: signer.name,
        email: signer.email,
        roleKey: signer.roleKey,
        roleLabel: roles.find((r) => r.key === signer.roleKey)?.label ?? signer.roleKey,
        order: signer.order,
        signatureImage: signer.signatureImage ?? '',
        method: (signer.signatureType ?? 'drawn') as SignatureMethod,
        signedAt: signer.signedAt ?? new Date(),
        consentAcceptedAt: signer.consentAcceptedAt ?? signer.signedAt ?? new Date(),
        ipAddress: '',
        userAgent: '',
      })),
    };
  }

  /** Requirement 30 — both parties, with a download link. */
  private async notifyCompletion(
    envelope: {
      id: string;
      title: string;
      completedAt: Date | null;
      organizationId: string;
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
          organizationId: envelope.organizationId,
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

type LoadedForCompletion = NonNullable<
  Awaited<ReturnType<EnvelopeCompletionService['load']>>
>;

/**
 * Edge cases 11 and 12 — bytes that are not a PDF are rejected rather than stored. A ZIP
 * is the same case, since `file_format=pdf` is always sent, so anything else is a provider
 * fault. Storing it would put a file nobody can open behind a contract that claims to be
 * executed.
 */
export function assertLooksLikePdf(bytes: Buffer): void {
  if (bytes.length < 5 || bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    throw new Error('not_a_pdf');
  }
}

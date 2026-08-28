import {
  ENVELOPE_MESSAGES,
  SIGNING_PROVIDER_MESSAGES,
  effectiveStatus,
  signingProviderName,
  signingSurfaceOf,
  filterSubmittedValues,
  isTerminal,
  validateReason,
  validateSignature,
} from '@devscribed/validation';
import type { EnvelopeStatus as EnvelopeStatusName } from '@devscribed/validation';
import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EnvelopeStatus,
  PdfStatus,
  Prisma,
  SignatureType,
  SignerStatus,
} from '@prisma/client';
import type { Request } from 'express';
import { EnvelopeEventsService } from '../documents/envelope-events.service';
import { capturedSignatures, presentDocument } from '../documents/envelope-renderer';
import type { DeclineDto, SignDto } from '../documents/envelopes.dto';
import {
  clientIp,
  currentSignerOf,
  documentIsIntact,
  readFieldValues,
  readFields,
  readSignerRoles,
  userAgentOf,
  validateFieldValue,
} from '../documents/envelopes.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import { ProviderReconcilerService } from '../documents/provider-reconciler.service';
import { SigningProviderRegistry } from '../signature/provider-registry';
import { isLocallySigned } from '../signature/signing-provider';
import type { LocallySigned, SigningProvider } from '../signature/signing-provider';
import {
  generateSigningToken,
  hashSigningToken,
  signingPageUrl,
  signingTokenTtlDays,
} from '../signature/signing-token';
import { FileStorage, PRESIGNED_URL_TTL_SECONDS } from '../storage/file-storage';

/** The `state` values the signing page renders, from the `GET /api/sign/{token}` contract. */
export type SigningState =
  | 'ready_to_sign'
  | 'already_signed'
  | 'declined'
  | 'voided'
  | 'expired'
  | 'not_your_turn'
  | 'completed';

type ResolvedToken = Prisma.SigningTokenGetPayload<{
  include: {
    signer: {
      include: {
        envelope: {
          include: {
            signers: true;
            organization: true;
            createdBy: true;
            templateVersion: { include: { template: true } };
          };
        };
      };
    };
  };
}>;

interface Resolution {
  token: ResolvedToken;
  state: SigningState;
}

/** Raised when the frozen document no longer hashes to the frozen hash (requirement 23). */
class DocumentTampered extends Error {}

/** Just enough of an envelope to answer "may this link offer a download?" */
interface DownloadableEnvelope {
  status: EnvelopeStatus;
  pdfStatus: PdfStatus;
  signedPdfKey: string | null;
  completedAt: Date | null;
}

@Injectable()
export class SigningService {
  private readonly log = new Logger(SigningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EnvelopeEventsService,
    private readonly mail: MailService,
    private readonly providers: SigningProviderRegistry,
    private readonly reconciler: ProviderReconcilerService,
    private readonly storage: FileStorage,
    private readonly queue: JobQueue,
  ) {}

  /* ---------------------------------------------------------------- *
   * Reads
   * ---------------------------------------------------------------- */

  async view(rawToken: string, req: Request) {
    let resolution = await this.resolve(rawToken);

    // Requirement 24a — lazily, on read. Only once the link has been accepted **and** the
    // turn is open: a terminal envelope and a wrong-turn visitor are both decided from our
    // own rows above and cost no provider call at all (requirement 16, edge case 18).
    if (
      resolution.state === 'ready_to_sign' &&
      (await this.reconciler.convergeIfStale(resolution.token.signer.envelopeId))
    ) {
      resolution = await this.resolve(rawToken);
    }

    const { token, state } = resolution;
    const signer = token.signer;
    const envelope = signer.envelope;

    // Requirement 17 — opening a valid link records a `viewed` event once per signer.
    if (state === 'ready_to_sign') await this.recordViewed(token, req);

    /* ------------------------------------------------------------------ *
     * Spec 04 requirements 6, 15 and 16 — our shell, our token, our access rules.
     *
     * `surface: "ours"` returns spec 02's payload **unchanged**, so nothing about an
     * internal envelope moves. Only when the provider hosts the widget does the payload
     * grow, and only after `resolve()` has already decided from **our own rows** that
     * this signer's turn is open.
     *
     * That ordering is requirement 16 and it is a security rule, not an optimization:
     * observed, the embedded URL for recipient 2 is handed out at creation and is
     * byte-identical before and after recipient 1's turn, with only `recipients[].status`
     * distinguishing them. Possession of the URL is therefore not proof that a signer's
     * turn is open, and a wrong-turn visitor is refused above, before any call is even
     * considered.
     * ------------------------------------------------------------------ */
    const embedded = await this.embeddedSurface(token, state);

    const roles = readSignerRoles(envelope.templateVersion.signerRoles);
    const fields = readFields(envelope.templateVersion.fieldsSnapshot);
    const values = readFieldValues(envelope.fieldValues);
    const owned = fields.filter((f) => f.filledBy === `signer:${signer.roleKey}`);

    return {
      state,
      surface: embedded.surface,
      // The name the attribution line prints ("Signed through SignWell on behalf of …").
      // From the envelope's own `providerKey`, so it is the provider that executed *this*
      // document rather than whatever the organization uses today.
      providerName: signingProviderName(envelope.providerKey),
      // Present only under an embedded surface. Fetched per request and never persisted,
      // never cached: storing a live signing URL would create a second credential for the
      // document, one our own access control does not gate and our token expiry does not
      // reach (requirement 6).
      ...(embedded.embeddedSigningUrl ? { embeddedSigningUrl: embedded.embeddedSigningUrl } : {}),
      // From the envelope's own column, written at send — never from configuration at
      // display time, so a document signed in test mode stays marked as a test forever.
      testMode: envelope.providerTestMode,
      envelope: {
        title: envelope.title,
        senderOrganizationName: envelope.organization.name,
        // Always the frozen HTML. Re-rendering it from the template here would quietly
        // undo the guarantee the freeze exists to give — so this is the stored document
        // with only its signer-owned placeholders filled in and the signatures captured
        // so far drawn onto their lines, for display. Sequential signing exists so that
        // the second party receives a document already signed by the first, and this is
        // where they see it; their own block stays empty until they sign. `documentHash`
        // below still describes the untouched stored bytes.
        renderedHtml: envelope.renderedHtml
          ? presentDocument(envelope.renderedHtml, values, capturedSignatures(envelope.signers))
          : null,
        documentHash: envelope.documentHash,
        expiresAt: envelope.expiresAt?.toISOString() ?? null,
        status: effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt),
      },
      signer: {
        name: signer.name,
        roleLabel: roles.find((r) => r.key === signer.roleKey)?.label ?? signer.roleKey,
        status: signer.status,
        signedAt: signer.signedAt?.toISOString() ?? null,
        declinedAt: signer.declinedAt?.toISOString() ?? null,
      },
      // Requirement 19/20 — only the fields this signer owns are offered as a form; the
      // sender's values are part of the document and are never editable here.
      fields: owned.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        maxLength: field.maxLength,
        value: values[field.key] ?? '',
      })),
      consentText: ENVELOPE_MESSAGES.signing.consentText,
      downloadAvailable: this.downloadAvailable(envelope),
    };
  }

  /** Requirement 17 as its own endpoint, so opening the page is a plain GET. */
  async markViewed(rawToken: string, req: Request): Promise<void> {
    const { token, state } = await this.resolve(rawToken);
    if (state !== 'ready_to_sign') return;
    await this.recordViewed(token, req);
  }

  async document(rawToken: string, req: Request) {
    const { token } = await this.resolve(rawToken);
    const envelope = token.signer.envelope;

    if (!this.downloadAvailable(envelope)) {
      throw new ConflictException({
        error: envelope.pdfStatus === PdfStatus.failed ? 'pdf_failed' : 'pdf_not_ready',
        pdfStatus: envelope.pdfStatus,
        message:
          envelope.pdfStatus === PdfStatus.failed
            ? ENVELOPE_MESSAGES.pdf.failed
            : ENVELOPE_MESSAGES.pdf.notReady,
      });
    }

    const url = await this.storage.presignedUrl(envelope.signedPdfKey!, PRESIGNED_URL_TTL_SECONDS);

    await this.prisma.$transaction((tx) =>
      this.events.record(tx, {
        envelopeId: envelope.id,
        type: 'downloaded',
        signerId: token.signer.id,
        documentHash: envelope.documentHash,
        actor: {
          email: token.signer.email,
          ipAddress: clientIp(req),
          userAgent: userAgentOf(req),
        },
      }),
    );

    return { url, expiresInSeconds: PRESIGNED_URL_TTL_SECONDS };
  }

  /**
   * Requirement 35 — the expiry page's "Request a new link" action. It notifies nobody
   * by minting anything: it records the request so the sender sees it on the Activity
   * tab and can resend deliberately. Issuing a token from an expired link would make the
   * expiry advisory.
   */
  async requestNewLink(rawToken: string, req: Request): Promise<void> {
    const token = await this.lookup(rawToken);
    if (!token) throw this.invalidLink();

    await this.prisma.$transaction((tx) =>
      this.events.record(tx, {
        envelopeId: token.signer.envelopeId,
        type: 'reminded',
        signerId: token.signer.id,
        documentHash: token.signer.envelope.documentHash,
        actor: {
          email: token.signer.email,
          ipAddress: clientIp(req),
          userAgent: userAgentOf(req),
        },
        metadata: { reason: 'new_link_requested' },
      }),
    );
  }

  /* ---------------------------------------------------------------- *
   * Signing
   * ---------------------------------------------------------------- */

  async sign(rawToken: string, dto: SignDto, req: Request) {
    const resolved = await this.resolve(rawToken);

    // Requirement 24 — a duplicate submission returns the completed state, not an error.
    if (resolved.state === 'already_signed' || resolved.state === 'completed') {
      return this.signedPayload(resolved.token);
    }
    if (resolved.state !== 'ready_to_sign') throw this.stateRefusal(resolved);

    if (dto?.consentAccepted !== true) {
      throw new BadRequestException({
        error: 'consent_required',
        message: ENVELOPE_MESSAGES.signing.consentRequired,
      });
    }

    const signature = validateSignature(dto?.signature);
    if (!signature.valid) throw this.signatureError(signature.error);

    const ipAddress = clientIp(req);
    const userAgent = userAgentOf(req);

    // Set inside the transaction, awaited after it commits. See the note at the
    // assignment for why the second invitation is not inside the failure boundary.
    let notify: (() => Promise<void>) | null = null;

    try {
      // `afterCommit` holds the render job until the signature is durably committed —
      // the renderer must never be able to read an envelope that is not yet visible.
      const outcome = await this.queue.afterCommit(() =>
        this.prisma.$transaction(async (tx) => {
          // The row lock is what makes signing idempotent under concurrency
          // (requirement 24, TC-02-INT-09): the second request blocks here and then
          // sees `usedAt` already set instead of applying a second signature.
          await tx.$queryRaw`SELECT id FROM "SigningToken" WHERE id = ${resolved.token.id} FOR UPDATE`;

          const token = await tx.signingToken.findUniqueOrThrow({
            where: { id: resolved.token.id },
            include: {
              signer: {
                include: {
                  envelope: {
                    include: {
                      signers: { orderBy: { order: 'asc' } },
                      organization: true,
                      createdBy: true,
                      templateVersion: { include: { template: true } },
                    },
                  },
                },
              },
            },
          });
          const signer = token.signer;
          const envelope = signer.envelope;

          if (signer.status === SignerStatus.signed) return this.signedPayload(token);

          const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
          if (isTerminal(status)) {
            throw this.stateRefusal({ token, state: this.terminalState(status) });
          }
          const current = currentSignerOf(envelope.signers);
          if (!current || current.id !== signer.id) throw this.notYourTurn();

          // Requirement 23 — recompute before applying anything.
          if (!documentIsIntact(envelope.renderedHtml, envelope.documentHash)) {
            throw new DocumentTampered(envelope.id);
          }

          const fields = readFields(envelope.templateVersion.fieldsSnapshot);
          const stored = readFieldValues(envelope.fieldValues);
          // Requirement 19 — values for fields this signer does not own are dropped
          // before the merge, never rejected and never stored.
          const submitted = filterSubmittedValues(
            (dto?.fieldValues ?? {}) as Record<string, unknown>,
            fields,
            signer.roleKey,
          );

          const errors: Record<string, string> = {};
          const merged = { ...stored };
          for (const [key, value] of Object.entries(submitted)) {
            const field = fields.find((f) => f.key === key)!;
            const error = validateFieldValue(field, value);
            if (error) errors[key] = error;
            else merged[key] = value;
          }
          for (const field of fields.filter(
            (f) => f.required && f.filledBy === `signer:${signer.roleKey}`,
          )) {
            if ((merged[field.key] ?? '').trim().length === 0) {
              errors[field.key] = ENVELOPE_MESSAGES.field.required(field.label);
            }
          }
          if (Object.keys(errors).length > 0) {
            throw new BadRequestException({ message: errors[Object.keys(errors)[0]], errors });
          }

          const signedAt = new Date();
          // `LocallySigned` narrows the port to providers that declared
          // `signingSurface: 'ours'` — a provider cannot be asked to turn ink into an
          // artefact when the ink never reached us.
          //
          // It stays **inside** the transaction, deliberately. Invariant 11's stated
          // reason is a five-attempt backoff holding a row lock for a minute, and a
          // provider whose surface is ours never touches the network, so the reason
          // cannot apply; moving it out would also reorder error precedence against
          // spec 02's suite, which requirement 10 forbids.
          const locally = this.localProviderFor(envelope.providerKey);
          const applied = await locally.applySignature({
            envelopeId: envelope.id,
            signerId: signer.id,
            signerName: signer.name,
            method: signature.value.type,
            drawnImage: signature.value.type === 'drawn' ? signature.value.image : undefined,
            typedName: signature.value.type === 'typed' ? signature.value.name : undefined,
            signedAt,
            consentAcceptedAt: signedAt,
            ipAddress,
            userAgent,
          });

          await tx.envelopeSigner.update({
            where: { id: signer.id },
            data: {
              status: SignerStatus.signed,
              signedAt,
              signatureImage: applied.signatureImage,
              signatureType:
                signature.value.type === 'typed' ? SignatureType.typed : SignatureType.drawn,
              signatureTypedName:
                signature.value.type === 'typed' ? signature.value.name : null,
              // Requirement 21 — the ESIGN/UETA consent record.
              consentAcceptedAt: signedAt,
            },
          });

          // Requirement 24 — `UsedAt` is set inside the same transaction as the signature.
          await tx.signingToken.update({ where: { id: token.id }, data: { usedAt: signedAt } });

          await tx.envelope.update({
            where: { id: envelope.id },
            data: { fieldValues: merged as Prisma.InputJsonValue },
          });

          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'signed',
            signerId: signer.id,
            documentHash: envelope.documentHash,
            actor: { email: signer.email, ipAddress, userAgent },
            // Requirement 40 — the method and the consent, never the values.
            metadata: { method: signature.value.type, order: signer.order, consent: true },
          });

          const remaining = envelope.signers
            .filter((s) => s.id !== signer.id)
            .filter((s) => s.status !== SignerStatus.signed && s.status !== SignerStatus.declined)
            .sort((a, b) => a.order - b.order);

          if (remaining.length > 0) {
            // Requirement 14 — the next signer's link comes into existence now, and not
            // one moment earlier.
            const next = remaining[0];
            // Token minting was always ours and stayed ours when the port lost
            // `issueInvitation`: a third-party provider mints nothing of ours.
            const { token, tokenHash } = generateSigningToken();
            const ttl = new Date(Date.now() + signingTokenTtlDays() * 24 * 60 * 60 * 1000);
            const expiresAt =
              envelope.expiresAt && envelope.expiresAt < ttl ? envelope.expiresAt : ttl;

            await tx.signingToken.create({
              data: {
                envelopeSignerId: next.id,
                tokenHash,
                expiresAt,
              },
            });
            await tx.envelopeSigner.update({
              where: { id: next.id },
              data: { status: SignerStatus.notified },
            });
            await tx.envelope.update({
              where: { id: envelope.id },
              data: { status: EnvelopeStatus.partially_signed },
            });

            // Deliberately *not* inside the transaction's failure boundary, unlike the
            // first invitation. Requirement 11 is about never marking an envelope sent
            // for a message nobody accepted; here the signature is already captured, and
            // rolling it back because a mailbox was down would lose evidence to fix a
            // deliverability problem. The resend action covers the failure.
            notify = async () => {
              await this.mail.sendSigningInvitation({
                to: next.email,
                recipientName: next.name,
                envelopeTitle: envelope.title,
                organizationName: envelope.organization.name,
                organizationId: envelope.organizationId,
                senderName: `${envelope.createdBy.firstName} ${envelope.createdBy.lastName}`.trim(),
                signingUrl: signingPageUrl(token),
                expiresAt,
              });
            };

            return {
              state: 'already_signed' as const,
              signedAt: signedAt.toISOString(),
              envelopeStatus: 'partially_signed',
              downloadAvailable: false,
            };
          }

          // Requirement 27 — the last signature completes the envelope.
          await tx.envelope.update({
            where: { id: envelope.id },
            data: {
              status: EnvelopeStatus.completed,
              completedAt: signedAt,
              pdfStatus: PdfStatus.pending,
            },
          });
          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'completed',
            documentHash: envelope.documentHash,
            metadata: { signerCount: envelope.signers.length },
          });

          await this.queue.enqueue({ name: 'pdf-render', envelopeId: envelope.id });

          return {
            state: 'already_signed' as const,
            signedAt: signedAt.toISOString(),
            envelopeStatus: 'completed',
            downloadAvailable: false,
          };
        }),
      );

      if (notify) await this.safeMail(notify);
      return outcome;
    } catch (error) {
      if (error instanceof DocumentTampered) {
        await this.recordTamper(resolved.token, ipAddress, userAgent);
        throw new InternalServerErrorException({
          error: 'document_integrity_failure',
          message: ENVELOPE_MESSAGES.signing.integrityFailure,
        });
      }
      throw error;
    }
  }

  /** Requirement 26 — decline, invalidate everything, tell the sender. */
  async decline(rawToken: string, dto: DeclineDto, req: Request) {
    const resolved = await this.resolve(rawToken);
    if (resolved.state === 'declined') {
      return {
        state: 'declined',
        declinedAt: resolved.token.signer.declinedAt?.toISOString() ?? null,
      };
    }
    if (resolved.state !== 'ready_to_sign') throw this.stateRefusal(resolved);

    const reason = validateReason(dto?.reason, false);
    if (!reason.valid) {
      throw new BadRequestException({ message: reason.error, errors: { reason: reason.error } });
    }

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "SigningToken" WHERE id = ${resolved.token.id} FOR UPDATE`;

      const signer = await tx.envelopeSigner.findUniqueOrThrow({
        where: { id: resolved.token.signer.id },
        include: { envelope: { include: { organization: true, createdBy: true } } },
      });
      const envelope = signer.envelope;
      const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
      if (isTerminal(status)) {
        throw this.stateRefusal({ token: resolved.token, state: this.terminalState(status) });
      }

      const declinedAt = new Date();
      await tx.envelopeSigner.update({
        where: { id: signer.id },
        data: {
          status: SignerStatus.declined,
          declinedAt,
          declineReason: reason.value || null,
        },
      });
      await tx.signingToken.updateMany({
        where: { signer: { envelopeId: envelope.id }, isInvalidated: false },
        data: { isInvalidated: true },
      });
      await tx.envelope.update({
        where: { id: envelope.id },
        data: { status: EnvelopeStatus.declined },
      });
      await this.events.record(tx, {
        envelopeId: envelope.id,
        type: 'declined',
        signerId: signer.id,
        documentHash: envelope.documentHash,
        actor: {
          email: signer.email,
          ipAddress: clientIp(req),
          userAgent: userAgentOf(req),
        },
        metadata: { reason: reason.value },
      });

      return { declinedAt, signer, envelope };
    });

    // The sender is told after the commit: the decline is a fact whether or not the
    // notice lands, and requirement 26 is about the state, not about the mailbox.
    await this.safeMail(async () => {
      await this.mail.sendEnvelopeDeclined({
        to: outcome.envelope.createdBy.email,
        recipientName: outcome.envelope.createdBy.firstName,
        envelopeTitle: outcome.envelope.title,
        organizationName: outcome.envelope.organization.name,
        organizationId: outcome.envelope.organizationId,
        declinedByName: outcome.signer.name,
        declineReason: reason.value,
        declinedAt: outcome.declinedAt,
      });
    });

    return { state: 'declined', declinedAt: outcome.declinedAt.toISOString() };
  }

  /* ---------------------------------------------------------------- *
   * Token resolution
   * ---------------------------------------------------------------- */

  private async lookup(rawToken: string): Promise<ResolvedToken | null> {
    const raw = (rawToken ?? '').trim();
    // Only the hash is ever stored, so an unknown token costs exactly one indexed
    // lookup — the same work a real one costs, which is what keeps the timing flat.
    if (!raw) return null;

    return this.prisma.signingToken.findUnique({
      where: { tokenHash: hashSigningToken(raw) },
      include: {
        signer: {
          include: {
            envelope: {
              include: {
                signers: { orderBy: { order: 'asc' } },
                organization: true,
                createdBy: true,
                templateVersion: { include: { template: true } },
              },
            },
          },
        },
      },
    });
  }

  /**
   * The single gate in front of every signing route.
   *
   * The order of the checks is the contract. The **envelope's** terminal state is
   * reported before the token's own validity, because voiding and declining invalidate
   * every outstanding token (requirements 26 and 32) and a signer following their link
   * afterwards must be told the document was withdrawn — not handed the generic
   * "not valid" page, which would be both unhelpful and untrue. Invalidation therefore
   * only produces `invalid_link` while the envelope is still live, which is exactly the
   * superseded-by-resend case where a caller must not be able to tell a stale token from
   * one that never existed.
   */
  private async resolve(rawToken: string): Promise<Resolution> {
    const token = await this.lookup(rawToken);
    if (!token) throw this.invalidLink();

    const envelope = token.signer.envelope;
    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);

    // Requirement 34 — lazy expiry is authoritative, so this is checked before the
    // stored status and before the token's own dates.
    if (status === 'expired') {
      throw new HttpException(
        {
          error: 'expired',
          expiredAt: envelope.expiresAt?.toISOString() ?? null,
          message: ENVELOPE_MESSAGES.signing.expired(
            envelope.expiresAt?.toISOString().slice(0, 10) ?? '',
          ),
        },
        410,
      );
    }
    if (status === 'voided') {
      throw new ConflictException({
        error: 'voided',
        voidedAt: envelope.voidedAt?.toISOString() ?? null,
        reason: envelope.voidReason,
        message: ENVELOPE_MESSAGES.signing.voided(
          envelope.voidedAt?.toISOString().slice(0, 10) ?? '',
        ),
      });
    }
    if (status === 'declined') return { token, state: 'declined' };
    if (status === 'completed') {
      return {
        token,
        state: token.signer.status === SignerStatus.signed ? 'already_signed' : 'completed',
      };
    }

    // Live envelope from here on: a superseded or spent token is indistinguishable from
    // one that never existed (TC-02-INT-24, TC-02-INT-26).
    if (token.isInvalidated) throw this.invalidLink();
    if (token.expiresAt.getTime() < Date.now()) {
      throw new HttpException(
        {
          error: 'expired',
          expiredAt: token.expiresAt.toISOString(),
          message: ENVELOPE_MESSAGES.signing.expired(token.expiresAt.toISOString().slice(0, 10)),
        },
        410,
      );
    }

    if (token.signer.status === SignerStatus.signed) return { token, state: 'already_signed' };
    if (token.signer.status === SignerStatus.declined) return { token, state: 'declined' };

    // Requirement 15 — under normal operation such a token does not exist; this defends
    // against a leaked or guessed one.
    const current = currentSignerOf(envelope.signers);
    if (!current || current.id !== token.signer.id) throw this.notYourTurn();

    return { token, state: 'ready_to_sign' };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /**
   * The surface this token's envelope is signed on, and the provider's URL when there is
   * one.
   *
   * Every decision here is made from the capability rather than from the provider key, so
   * a third provider that embeds a widget needs no change to this method — and a terminal
   * envelope makes **no provider call at all** (edge case 18: spec 02 requirement 25's
   * read-only view applies unchanged).
   */
  private async embeddedSurface(
    token: ResolvedToken,
    state: SigningState,
  ): Promise<{ surface: 'ours' | 'embedded'; embeddedSigningUrl: string | null }> {
    const envelope = token.signer.envelope;
    const provider = this.providers.find(envelope.providerKey);

    if (!provider) {
      // Edge case 16 — the adapter unregistered while this envelope was in flight. The
      // signer is told the service is unavailable rather than shown an empty frame, and
      // their token is not consumed.
      if (envelope.providerKey === 'internal') return { surface: 'ours', embeddedSigningUrl: null };
      throw this.providerUnavailable();
    }

    const surface = signingSurfaceOf(provider.capabilities);
    if (surface === 'ours') return { surface, embeddedSigningUrl: null };
    // A signer who cannot sign right now needs no widget: a terminal envelope, an
    // already-signed link, or a turn that has not started.
    if (state !== 'ready_to_sign') return { surface, embeddedSigningUrl: null };

    try {
      const access = await provider.signerAccess({
        providerRef: envelope.providerRef,
        signerProviderRef: token.signer.providerRef,
        signerEmail: token.signer.email,
        signerOrder: token.signer.order,
      });
      if (!access.embeddedSigningUrl) throw this.providerUnavailable();
      return { surface, embeddedSigningUrl: access.embeddedSigningUrl };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.log.warn(
        `Fetching a signing URL for envelope ${envelope.id} failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
      throw this.providerUnavailable();
    }
  }

  /**
   * Deliberately distinct from an invalid token, and deliberately not a 404: the signer's
   * link is still good, the token was not consumed, and telling them otherwise would be
   * wrong.
   */
  private providerUnavailable(): HttpException {
    return new HttpException(
      {
        error: 'provider_unavailable',
        message: SIGNING_PROVIDER_MESSAGES.signing.providerUnavailableApi,
      },
      503,
    );
  }

  /**
   * The provider that can turn this signer's ink into an artefact. A provider whose
   * signing surface is not ours never reaches here — `sign()` is only reachable when the
   * page offered a canvas — so a missing narrowing is a wiring bug, not a signer error.
   */
  private localProviderFor(providerKey: string): SigningProvider & LocallySigned {
    const provider = this.providers.find(providerKey);
    if (!provider || !isLocallySigned(provider)) {
      throw new InternalServerErrorException({
        error: 'provider_cannot_apply_signature',
        message: ENVELOPE_MESSAGES.signing.integrityFailure,
      });
    }
    return provider;
  }

  private async recordViewed(token: ResolvedToken, req: Request): Promise<void> {
    // Idempotent by the trail itself rather than by the signer's status: a signer who
    // was resent a link is back at `notified`, and counting that as a second view would
    // multiply events for one pair of eyes.
    const seen = await this.prisma.envelopeEvent.count({
      where: { envelopeSignerId: token.signer.id, type: 'viewed' },
    });
    if (seen > 0) return;

    await this.prisma.$transaction(async (tx) => {
      await tx.envelopeSigner.update({
        where: { id: token.signer.id },
        data: { status: SignerStatus.viewed },
      });
      await this.events.record(tx, {
        envelopeId: token.signer.envelopeId,
        type: 'viewed',
        signerId: token.signer.id,
        documentHash: token.signer.envelope.documentHash,
        actor: {
          email: token.signer.email,
          ipAddress: clientIp(req),
          userAgent: userAgentOf(req),
        },
      });
    });
  }

  /**
   * Requirement 23 — the mismatch aborts the signature, writes `tamper_detected`, and
   * logs at error level so the operational alarm has something to fire on. Its own
   * transaction, because the one that found the problem is being rolled back.
   */
  private async recordTamper(
    token: ResolvedToken,
    ipAddress: string,
    userAgent: string,
  ): Promise<void> {
    this.log.error(
      `Document integrity failure on envelope ${token.signer.envelopeId}: the frozen HTML ` +
        'no longer matches its recorded hash. Signing was refused.',
    );
    await this.prisma.$transaction((tx) =>
      this.events.record(tx, {
        envelopeId: token.signer.envelopeId,
        type: 'tamper_detected',
        signerId: token.signer.id,
        documentHash: token.signer.envelope.documentHash,
        actor: { email: token.signer.email, ipAddress, userAgent },
        metadata: { stage: 'sign' },
      }),
    );
  }

  private signedPayload(token: {
    signer: { signedAt: Date | null; envelope: DownloadableEnvelope & { expiresAt: Date | null } };
  }) {
    const envelope = token.signer.envelope;
    return {
      state: 'already_signed' as const,
      signedAt: token.signer.signedAt?.toISOString() ?? null,
      envelopeStatus: effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt),
      downloadAvailable: this.downloadAvailable(envelope),
    };
  }

  private downloadAvailable(envelope: DownloadableEnvelope): boolean {
    if (envelope.status !== EnvelopeStatus.completed) return false;
    if (envelope.pdfStatus !== PdfStatus.ready || !envelope.signedPdfKey) return false;
    // Requirement 25 — 30 days after completion, then the link stops being offered.
    if (!envelope.completedAt) return true;
    return Date.now() - envelope.completedAt.getTime() < 30 * 24 * 60 * 60 * 1000;
  }

  private terminalState(status: EnvelopeStatusName): SigningState {
    if (status === 'voided') return 'voided';
    if (status === 'declined') return 'declined';
    if (status === 'expired') return 'expired';
    return 'completed';
  }

  private stateRefusal(resolution: Resolution): HttpException {
    const envelope = resolution.token.signer.envelope;
    switch (resolution.state) {
      case 'voided':
        return new ConflictException({
          error: 'voided',
          voidedAt: envelope.voidedAt?.toISOString() ?? null,
          reason: envelope.voidReason,
        });
      case 'declined':
        return new ConflictException({ error: 'declined', message: ENVELOPE_MESSAGES.signing.declined });
      case 'expired':
        return new HttpException({ error: 'expired' }, 410);
      case 'not_your_turn':
        return this.notYourTurn();
      default:
        return new ConflictException({ error: 'invalid_state' });
    }
  }

  /**
   * The generic refusal, byte-identical for an unknown token, a malformed one, and one
   * that was superseded — a caller must not be able to tell them apart.
   */
  private invalidLink(): NotFoundException {
    return new NotFoundException({
      error: 'invalid_link',
      message: ENVELOPE_MESSAGES.signing.invalidLink,
    });
  }

  private notYourTurn(): HttpException {
    return new HttpException(
      { error: 'not_your_turn', message: ENVELOPE_MESSAGES.signing.notYourTurn },
      403,
    );
  }

  private signatureError(message: string): BadRequestException {
    if (message === ENVELOPE_MESSAGES.signing.signatureTooLarge) {
      return new BadRequestException({ error: 'signature_too_large', message });
    }
    if (message === ENVELOPE_MESSAGES.signing.typedSignatureEmpty) {
      return new BadRequestException({ error: 'invalid_typed_signature', message });
    }
    return new BadRequestException({ error: 'empty_signature', message });
  }

  /**
   * A notification that follows a committed transition. Awaited, so a test never has to
   * guess when the mail sink is populated, but never allowed to throw: the transition it
   * follows is already a fact and the caller can do nothing useful with the error.
   */
  private async safeMail(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.log.error(`Notification failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

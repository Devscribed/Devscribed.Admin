import {
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  PROFILE_MESSAGES,
  SIGNING_PROVIDER_MESSAGES,
  issuesCertificateOfCompletion,
  sendsOurOwnInvitation,
  signingProviderName,
  canEditOrDelete,
  canReadProfilePii,
  findAutofillSource,
  resolveAutofill,
  canVoid,
  effectiveStatus,
  hasCapability,
  isTerminal,
  sha256HexOfString,
  validateEmail,
  validateEnvelopeTitle,
  validateExpiryDays,
  validateReason,
  validateSignerEmail,
  validateSignerName,
  verifyChain,
} from '@devscribed/validation';
import type {
  AutofillContext,
  ChainLink,
  EnvelopeStatus as EnvelopeStatusName,
  SignerRole,
} from '@devscribed/validation';
import {
  BadGatewayException,
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  EnvelopeStatus,
  PdfStatus,
  Prisma,
  SignerStatus,
  TemplateStatus,
} from '@prisma/client';
import type { Request } from 'express';
import type { SessionPayload } from '../auth/session.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { JobQueue } from '../queue/job-queue';
import { SigningProviderRegistry, ProviderUnconfiguredError, UnknownProviderError } from '../signature/provider-registry';
import {
  ProviderDocumentGoneError,
  ProviderFieldsNotMaterializedError,
  ProviderUnavailableError,
} from '../signature/signing-provider';
import type { ExpectedProviderField, SigningProvider } from '../signature/signing-provider';
import { generateSigningToken, signingPageUrl, signingTokenTtlDays } from '../signature/signing-token';
import { FileStorage, PRESIGNED_URL_TTL_SECONDS } from '../storage/file-storage';
import { EnvelopeEventsService } from './envelope-events.service';
import { ProviderReconcilerService } from './provider-reconciler.service';
import { UnresolvedPlaceholdersError, translateToTextTags } from './signwell-text-tags';
import {
  capturedSignatures,
  presentDocument,
  renderEnvelopeDocument,
  signerOwnedFieldKeys,
} from './envelope-renderer';
import type {
  CreateEnvelopeDto,
  EnvelopeField,
  UpdateEnvelopeDto,
  VoidEnvelopeDto,
} from './envelopes.dto';

/* ------------------------------------------------------------------ *
 * Shared readers and helpers.
 *
 * Exported because the public signing surface and the sweep need exactly the same
 * answers, and two implementations of "which fields does this version have" would be two
 * implementations of the document.
 * ------------------------------------------------------------------ */

/**
 * A draft has to remember the expiry the author chose, but `Envelope.ExpiresAt` is "set
 * at send" by the data model and `effectiveStatus` would read a stored one as a live
 * deadline — a draft left open for 40 days would report itself expired.
 *
 * So the chosen day count lives in `FieldValues` under a key no template field can ever
 * have: `FIELD_KEY_PATTERN` requires a lowercase letter first, so `$` is unreachable from
 * the template side and a collision is impossible rather than unlikely. Every read of the
 * map goes through `readFieldValues`, which strips it.
 */
const EXPIRY_META_KEY = '$expiresInDays';

/**
 * Spec 03 needs two more facts to survive in the same map, for the same reason and by the
 * same trick: which keys autofill populated (requirement 11) and which it had to shorten
 * (requirement 10).
 *
 * They are stored rather than recomputed, and that is the whole point of requirement 8.
 * Recomputing "was this autofilled" on read would mean resolving the sources again against
 * the *current* profile — a live binding, which is exactly what snapshotting forbids. It
 * would also be wrong the moment a sender corrects a value by hand: TC-03-INT-05 says an
 * overwritten field still carries the marker, because the marker records what happened at
 * creation, not what the value is now.
 *
 * `$` again, because `FIELD_KEY_PATTERN` requires a lowercase letter first — a template
 * field can never collide with these, and `readFieldValues` already strips them.
 */
const AUTOFILLED_META_KEY = '$autofilled';
const AUTOFILL_TRUNCATED_META_KEY = '$autofillTruncated';

/** Both meta lists, read defensively: a JSON column is a claim about shape, not a proof. */
export function readMetaKeyList(value: unknown, metaKey: string): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const stored = (value as Record<string, unknown>)[metaKey];
  if (!Array.isArray(stored)) return [];
  return stored.filter((entry): entry is string => typeof entry === 'string');
}

export function readAutofilledKeys(value: unknown): string[] {
  return readMetaKeyList(value, AUTOFILLED_META_KEY);
}

export function readAutofillTruncatedKeys(value: unknown): string[] {
  return readMetaKeyList(value, AUTOFILL_TRUNCATED_META_KEY);
}

export function readFieldValues(value: unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const key of Object.keys(source)) {
    if (key.startsWith('$')) continue;
    const entry = source[key];
    if (entry === null || entry === undefined) out[key] = '';
    else if (typeof entry === 'object') continue;
    else out[key] = String(entry);
  }
  return out;
}

export function readExpiryDays(value: unknown): number {
  if (typeof value !== 'object' || value === null) return ENVELOPE_LIMITS.expiryDaysDefault;
  const stored = (value as Record<string, unknown>)[EXPIRY_META_KEY];
  const parsed = validateExpiryDays(stored);
  return parsed.valid ? parsed.value : ENVELOPE_LIMITS.expiryDaysDefault;
}

/** JSON columns are a claim about shape, so every read is defensive. */
export function readSignerRoles(value: unknown): SignerRole[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const role = entry as Partial<SignerRole>;
    if (typeof role.key !== 'string' || typeof role.label !== 'string') return [];
    return [{ key: role.key, label: role.label, order: Number(role.order) || 1 }];
  });
}

/**
 * The pinned version's fields, from the snapshot frozen at publish. The live
 * `TemplateField` rows are deliberately not consulted: they belong to the template's
 * next draft, and reading them would let template maintenance change the shape of a
 * document already in flight.
 */
export function readFields(value: unknown): EnvelopeField[] {
  if (!Array.isArray(value)) return [];
  return value
    .flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const field = entry as Partial<EnvelopeField>;
      if (typeof field.key !== 'string' || typeof field.label !== 'string') return [];
      return [
        {
          key: field.key,
          label: field.label,
          type: (field.type ?? 'text') as EnvelopeField['type'],
          required: field.required === true,
          options: Array.isArray(field.options) ? (field.options as string[]) : null,
          maxLength: typeof field.maxLength === 'number' ? field.maxLength : null,
          filledBy: typeof field.filledBy === 'string' ? field.filledBy : 'sender',
          autofillSource:
            typeof field.autofillSource === 'string' ? field.autofillSource : null,
          order: Number(field.order) || 0,
        },
      ];
    })
    .sort((a, b) => a.order - b.order);
}

/**
 * Requirement 41 — the IP is taken from the trusted proxy header chain, and only the
 * first hop the platform vouches for. The load balancer prepends the real client, so the first
 * entry is the one with provenance; everything after it is whatever the client chose to
 * claim and is discarded.
 */
export function clientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  const chain = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const first = (chain ?? '').split(',')[0]?.trim();
  if (first) return first.slice(0, 45);
  return (req.ip ?? req.socket?.remoteAddress ?? '').slice(0, 45);
}

export function userAgentOf(req: Request): string {
  const header = req.headers['user-agent'];
  return (Array.isArray(header) ? header[0] : (header ?? '')).slice(0, 400);
}

/**
 * The signer whose turn it is: strictly sequential (requirement 14), so it is the
 * lowest-ordered signer who has neither signed nor declined.
 */
export function currentSignerOf<T extends { order: number; status: SignerStatus }>(
  signers: readonly T[],
): T | null {
  return (
    [...signers]
      .sort((a, b) => a.order - b.order)
      .find((s) => s.status !== SignerStatus.signed && s.status !== SignerStatus.declined) ?? null
  );
}

/**
 * Validation rule 5, server side. Returns the spec's message for the first rule the
 * value breaks, or null when it is acceptable. Emptiness is *not* checked here —
 * required-ness is a separate question asked at different moments by the fill form and
 * by the signing page.
 */
export function validateFieldValue(field: EnvelopeField, value: string): string | null {
  const trimmed = (value ?? '').trim();
  if (trimmed.length === 0) return null;

  const max = field.maxLength;
  if (typeof max === 'number' && max > 0 && value.length > max) {
    return ENVELOPE_MESSAGES.field.tooLong(field.label, max);
  }

  switch (field.type) {
    case 'date':
      // ISO calendar dates only — the same shape `<input type="date">` submits, so a
      // value that round-trips through the form is always accepted.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || Number.isNaN(Date.parse(trimmed))) {
        return ENVELOPE_MESSAGES.field.invalidDate;
      }
      return null;
    case 'number':
      return Number.isFinite(Number(trimmed)) ? null : ENVELOPE_MESSAGES.field.invalidNumber;
    case 'email':
      return validateEmail(trimmed).valid ? null : ENVELOPE_MESSAGES.field.invalidEmail;
    case 'select':
      // An unknown option is a client bug, not a user error; there is no message for it
      // in the spec, so it is accepted and the stored value speaks for itself.
      return null;
    default:
      return null;
  }
}

/** Requirement 23 — the frozen document must still hash to the frozen hash. */
export function documentIsIntact(renderedHtml: string | null, documentHash: string | null): boolean {
  if (!renderedHtml || !documentHash) return false;
  return sha256HexOfString(renderedHtml) === documentHash;
}

/**
 * Raised when the mail transport rejects a message inside the send transaction, so the
 * rollback happens for a reason the caller can be told about (requirement 11) rather
 * than as an opaque 500.
 */
export class MailDeliveryFailure extends Error {}

/**
 * Edge case 4's marker, and the only durable trace a send can leave of a session it
 * created but could not pin.
 *
 * `createSession` runs outside the transaction on purpose (invariant 11), so a rollback
 * after it — a mail transport that rejected the invitation, a lost double-click race —
 * leaves a document open on the provider's side with the real counterparties on it. The
 * send compensates by deleting that document; when the deletion *also* fails it writes
 * this on the still-`draft` envelope instead, and the next send adopts the leftover by
 * `metadata.envelope_id` rather than creating a second contract (requirement 26).
 *
 * It lives in `providerError` — "last provider-side error, cleared on the next successful
 * sync" — because that is exactly what it is, and the send transaction clears it.
 */
export const ORPHANED_SESSION = 'orphaned_provider_session';

/**
 * Everything the send has decided before it touches the database or the provider: the
 * document it will freeze, the hash of it, and the signers it will create a session for.
 */
export interface PreparedSend {
  title: string;
  renderedHtml: string;
  documentHash: string;
  expiryDays: number;
  signers: { id: string; name: string; email: string; order: number; roleKey: string }[];
  signerOwnedFields: { key: string; roleKey: string; required: boolean }[];
}

export type LoadedEnvelope = Prisma.EnvelopeGetPayload<{
  include: {
    signers: true;
    templateVersion: { include: { template: true } };
    createdBy: true;
    organization: true;
  };
}>;

@Injectable()
export class EnvelopesService {
  private readonly log = new Logger(EnvelopesService.name);

  /**
   * One resend per signer per minute (requirement 13). Kept in memory rather than
   * derived from the newest `SigningToken.createdAt`, because that clock would start at
   * *send* — the first resend after a send would be refused, which is not what the rule
   * says. A process restart forgets it; the cost of that is one extra email.
   */
  private readonly lastResendAt = new Map<string, number>();

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

  async list(session: SessionPayload, query: Record<string, string | undefined>) {
    const pageSize = Math.min(Math.max(Number(query.pageSize) || 25, 1), 100);
    const page = Math.max(Number(query.page) || 1, 1);
    const status = query.status?.trim();
    const where: Prisma.EnvelopeWhereInput = {
      organizationId: session.organizationId,
      ...(query.templateId ? { templateVersion: { templateId: query.templateId } } : {}),
      ...(query.q?.trim() ? { title: { contains: query.q.trim(), mode: 'insensitive' } } : {}),
    };

    const rows = await this.prisma.envelope.findMany({
      where,
      include: { signers: { orderBy: { order: 'asc' } }, templateVersion: { include: { template: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // Requirement 34: expiry is applied on read, so filtering by status has to happen
    // after the effective status is known. A `WHERE status = 'expired'` would miss every
    // envelope the sweep has not caught up with yet, which is exactly the class of bug
    // lazy expiry exists to rule out.
    const projected = rows.map((row) => ({
      row,
      status: effectiveStatus(row.status as EnvelopeStatusName, row.expiresAt),
    }));
    const filtered = status ? projected.filter((e) => e.status === status) : projected;

    return {
      envelopes: filtered.slice((page - 1) * pageSize, page * pageSize).map(({ row, status: s }) => ({
        id: row.id,
        title: row.title,
        templateName: row.templateVersion.template.name,
        templateVersionNumber: row.templateVersion.versionNumber,
        status: s,
        pdfStatus: row.pdfStatus,
        sentAt: row.sentAt?.toISOString() ?? null,
        expiresAt: row.expiresAt?.toISOString() ?? null,
        signers: row.signers.map((signer) => ({
          id: signer.id,
          roleKey: signer.roleKey,
          name: signer.name,
          order: signer.order,
          status: signer.status,
        })),
      })),
      total: filtered.length,
      canManage: await this.can(session, 'ManageEnvelopes'),
    };
  }

  async get(session: SessionPayload, id: string) {
    // Requirement 24a — **lazily, on read.** A non-terminal envelope on a remote provider
    // whose last sync is stale is re-fetched synchronously, before the response is
    // composed and outside any transaction, so a dropped notification costs timeliness
    // and never correctness. A freshly-sent envelope is fresh (`providerSyncedAt` is
    // written at send), so the ordinary read costs no provider call at all.
    const envelope = await this.load(session, id);
    // Scoped first, so a foreign id is a 404 that costs no provider call.
    const changed = await this.reconciler.convergeIfStale(envelope.id);
    return this.present(session, changed ? await this.load(session, id) : envelope);
  }

  /**
   * The draft preview (flow step 6). Spec 01's template preview substitutes *synthetic*
   * values and knows nothing about an envelope, so it cannot answer this — and this one
   * must not become that one, because what it renders is what `send` will freeze. It is
   * therefore the same `renderEnvelopeDocument` the send path uses, given the values as
   * they stand right now.
   *
   * A POST rather than a GET for the same reason the template preview is: a rendered
   * contract has no business in a browser history or a proxy log.
   */
  async preview(session: SessionPayload, id: string) {
    const envelope = await this.load(session, id);

    // Once sent, the frozen copy *is* the document; re-rendering it would show something
    // that is not what anybody signed. The signer-owned placeholders and the empty
    // signature slots it still carries are filled in for display only — the stored bytes
    // are the ones that were hashed.
    if (envelope.renderedHtml) {
      return {
        html: presentDocument(
          envelope.renderedHtml,
          readFieldValues(envelope.fieldValues),
          capturedSignatures(envelope.signers),
        ),
      };
    }

    const roles = readSignerRoles(envelope.templateVersion.signerRoles);
    return {
      html: renderEnvelopeDocument({
        title: envelope.title,
        bodyHtml: envelope.templateVersion.bodyHtml,
        values: readFieldValues(envelope.fieldValues),
        signerOwnedKeys: signerOwnedFieldKeys(readFields(envelope.templateVersion.fieldsSnapshot)),
        signers: envelope.signers.map((s) => ({
          roleKey: s.roleKey,
          roleLabel: roles.find((r) => r.key === s.roleKey)?.label ?? s.roleKey,
          name: s.name,
          order: s.order,
        })),
      }),
    };
  }

  async audit(session: SessionPayload, id: string) {
    const envelope = await this.load(session, id);
    const events = await this.chainOf(envelope.id);
    const signers = new Map(envelope.signers.map((s) => [s.id, s]));

    return {
      events: events.map((event) => ({
        id: event.id,
        type: event.type,
        occurredAt: event.occurredAt.toISOString(),
        actor: this.presentActor(event, signers),
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        documentHash: event.documentHash,
        metadata: event.metadata ?? null,
      })),
      chain: this.verify(events),
    };
  }

  async auditVerify(session: SessionPayload, id: string) {
    const envelope = await this.load(session, id);
    return this.verify(await this.chainOf(envelope.id));
  }

  /** Every successful call records a `downloaded` event. */
  async document(session: SessionPayload, id: string, req: Request) {
    const envelope = await this.load(session, id);
    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
    if (status !== 'completed') throw new NotFoundException();

    if (envelope.pdfStatus === PdfStatus.failed) {
      throw new ConflictException({ error: 'pdf_failed', message: ENVELOPE_MESSAGES.pdf.failed });
    }
    if (envelope.pdfStatus !== PdfStatus.ready || !envelope.signedPdfKey) {
      throw new ConflictException({
        error: 'pdf_not_ready',
        pdfStatus: envelope.pdfStatus,
        message: ENVELOPE_MESSAGES.pdf.notReady,
      });
    }

    const url = await this.storage.presignedUrl(envelope.signedPdfKey, PRESIGNED_URL_TTL_SECONDS);

    await this.prisma.$transaction((tx) =>
      this.events.record(tx, {
        envelopeId: envelope.id,
        type: 'downloaded',
        documentHash: envelope.documentHash,
        actor: {
          accountId: session.accountId,
          ipAddress: clientIp(req),
          userAgent: userAgentOf(req),
        },
      }),
    );

    return {
      url,
      expiresInSeconds: PRESIGNED_URL_TTL_SECONDS,
      sha256: envelope.signedPdfHash,
    };
  }

  /* ---------------------------------------------------------------- *
   * Writes
   * ---------------------------------------------------------------- */

  async create(session: SessionPayload, dto: CreateEnvelopeDto) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id: dto?.templateId ?? '', organizationId: session.organizationId },
      include: { currentVersion: true },
    });
    if (!template) throw new NotFoundException();

    if (template.status === TemplateStatus.archived) {
      throw new BadRequestException({
        error: 'template_archived',
        message: ENVELOPE_MESSAGES.template.archived,
      });
    }
    if (template.status !== TemplateStatus.published || !template.currentVersion) {
      throw new BadRequestException({
        error: 'template_not_published',
        message: ENVELOPE_MESSAGES.template.notPublished,
      });
    }

    const expiry =
      dto?.expiresInDays === undefined || dto.expiresInDays === null
        ? { valid: true as const, value: ENVELOPE_LIMITS.expiryDaysDefault }
        : validateExpiryDays(dto.expiresInDays);
    if (!expiry.valid) {
      throw new BadRequestException({ message: expiry.error, errors: { expiresInDays: expiry.error } });
    }

    const version = template.currentVersion;
    const roles = readSignerRoles(version.signerRoles);
    const fields = readFields(version.fieldsSnapshot);

    // Requirement 2 — the title defaults to the template name and is editable.
    const titleInput = (dto?.title ?? '').trim() || template.name;
    const title = validateEnvelopeTitle(titleInput);
    if (!title.valid) {
      throw new BadRequestException({ message: title.error, errors: { title: title.error } });
    }

    const subject = await this.resolveSubject(session, dto?.subjectMembershipId);
    const subjectMembershipId = subject?.id ?? null;

    /* ------------------------------------------------------------------ *
     * Spec 03 — autofill resolves **once**, here, and nowhere else.
     *
     * Requirement 6 puts resolution at envelope creation for every bound field
     * regardless of `filledBy`, and requirement 8 snapshots the result into
     * `Envelope.fieldValues`. There is deliberately no read-time counterpart: a later
     * profile edit must not reach an existing envelope, draft or sent, so the *only*
     * write of an autofilled value in this codebase is the `tx.envelope.create` below.
     *
     * Requirement 7 is why nothing here can throw. `resolveAutofill` returns a string for
     * every bound field and the empty one for anything it cannot fill, so a null profile,
     * an absent subject, and a removed subject all land in the same place: a draft with
     * gaps, which the sender fills by hand.
     * ------------------------------------------------------------------ */
    // Read once, here, so the draft records the setting as it stood at creation.
    const organizationProviderKey = await this.organizationProviderKey(session.organizationId);

    const autofillContext = await this.autofillContext(session, subject);
    const resolved = resolveAutofill(fields, autofillContext);
    const fieldValues = resolved.values;
    const autofilled = resolved.autofilled;

    // Requirement 7 / the "Incomplete profile" alt flow: a bound field that resolved to
    // nothing is a *gap*, and the fill form names it. Only when a subject was chosen —
    // requirement 12 makes a subject-less envelope a deliberate choice, not an incomplete
    // one, so reporting gaps there would nag about something nobody asked for.
    const autofillGaps =
      subject === null
        ? []
        : fields
            .filter(
              (field) =>
                field.autofillSource !== null &&
                findAutofillSource(field.autofillSource) !== undefined &&
                (fieldValues[field.key] ?? '') === '',
            )
            .map((field) => ({
              key: field.key,
              label: field.label,
              source: field.autofillSource,
            }));

    const envelope = await this.prisma.$transaction(async (tx) => {
      const created = await tx.envelope.create({
        data: {
          organizationId: session.organizationId,
          templateVersionId: version.id,
          title: title.value,
          status: EnvelopeStatus.draft,
          fieldValues: {
            ...fieldValues,
            [EXPIRY_META_KEY]: expiry.value,
            [AUTOFILLED_META_KEY]: autofilled,
            [AUTOFILL_TRUNCATED_META_KEY]: resolved.truncated,
          } as Prisma.InputJsonValue,
          subjectMembershipId,
          // Requirement 1 — a display default while the envelope is a draft, so the
          // draft's detail screen can say which provider it *would* use. Nothing reads it
          // as authority before send, and the send overwrites it: a draft created before a
          // switch goes out on the new provider (edge case 14, TC-04-INT-17).
          providerKey: organizationProviderKey,
          createdByAccountId: session.accountId,
        },
      });

      // Requirement 3 — one signer per signer role of the pinned version, in the role's
      // order, with an empty name and email.
      for (const role of [...roles].sort((a, b) => a.order - b.order)) {
        await tx.envelopeSigner.create({
          data: { envelopeId: created.id, roleKey: role.key, order: role.order },
        });
      }

      // Requirement 5 — **nothing provider-side exists for a draft**: no remote document
      // and no `providerRef`. It is written at send, from what `createSession` returned,
      // which for the in-house engine is the envelope id and for a third party is theirs.
      return created;
    });

    const signers = await this.prisma.envelopeSigner.findMany({
      where: { envelopeId: envelope.id },
      orderBy: { order: 'asc' },
    });

    return {
      id: envelope.id,
      templateVersionId: version.id,
      templateVersionNumber: version.versionNumber,
      title: envelope.title,
      status: envelope.status,
      fieldValues: readFieldValues(envelope.fieldValues),
      subjectMembershipId,
      // Requirement 13: resolution is unaffected by a removed subject, but the client is
      // told, so the picker can show the advisory note the spec's "Subject removed" state
      // describes rather than treating it as an error.
      subjectRemoved: subject?.status === 'removed',
      // Requirement 11 — the keys the fill form marks with ⟲.
      autofilled,
      autofillGaps,
      // Requirement 10 — shortened to fit, and said so. Silently truncating a contract
      // clause is the outcome this flag exists to prevent.
      autofillTruncated: resolved.truncated,
      signers: signers.map((signer) => ({
        id: signer.id,
        roleKey: signer.roleKey,
        label: roles.find((r) => r.key === signer.roleKey)?.label ?? signer.roleKey,
        order: signer.order,
        name: signer.name,
        email: signer.email,
      })),
      fields,
    };
  }

  async update(session: SessionPayload, id: string, dto: UpdateEnvelopeDto) {
    const envelope = await this.load(session, id);
    this.assertDraft(envelope);

    const fields = readFields(envelope.templateVersion.fieldsSnapshot);
    const errors: Record<string, string> = {};
    const data: Prisma.EnvelopeUpdateInput = {};

    if (dto?.title !== undefined) {
      const title = validateEnvelopeTitle(dto.title ?? '');
      if (!title.valid) errors.title = title.error;
      else data.title = title.value;
    }

    let expiresInDays = readExpiryDays(envelope.fieldValues);
    if (dto?.expiresInDays !== undefined && dto.expiresInDays !== null) {
      const expiry = validateExpiryDays(dto.expiresInDays);
      if (!expiry.valid) errors.expiresInDays = expiry.error;
      else expiresInDays = expiry.value;
    }

    const values = readFieldValues(envelope.fieldValues);
    if (dto?.fieldValues !== undefined) {
      const submitted = dto.fieldValues ?? {};
      const unknown = Object.keys(submitted).filter(
        (key) => !fields.some((field) => field.key === key),
      );
      if (unknown.length > 0) {
        throw new BadRequestException({
          error: 'unknown_field',
          keys: unknown,
          message: `Unknown field: ${unknown[0]}`,
        });
      }

      for (const field of fields) {
        if (!(field.key in submitted)) continue;
        const raw = submitted[field.key];
        const value = raw === null || raw === undefined ? '' : String(raw);
        const error = validateFieldValue(field, value);
        if (error) errors[`fieldValues.${field.key}`] = error;
        else values[field.key] = value;
      }
    }

    const signerUpdates: { id: string; name: string; email: string; order: number }[] = [];
    if (dto?.signers !== undefined) {
      const list = Array.isArray(dto.signers) ? dto.signers : [];
      list.forEach((raw, index) => {
        const signer = envelope.signers.find((s) => s.id === raw?.id);
        if (!signer) {
          errors[`signers[${index}].id`] = 'Unknown signer';
          return;
        }
        // A half-filled draft is legal — requirement 8 makes the name and the email
        // required *before sending*, not on every save, so an empty pair passes here and
        // is refused by `send`.
        const name = (raw?.name ?? '').trim();
        const email = (raw?.email ?? '').trim();
        if (name.length > 0) {
          const checked = validateSignerName(name);
          if (!checked.valid) errors[`signers[${index}].name`] = checked.error;
        }
        let normalizedEmail = '';
        if (email.length > 0) {
          const checked = validateSignerEmail(email);
          if (!checked.valid) errors[`signers[${index}].email`] = checked.error;
          else normalizedEmail = checked.value;
        }
        signerUpdates.push({
          id: signer.id,
          name,
          email: normalizedEmail,
          order: Number.isInteger(raw?.order) ? Number(raw!.order) : signer.order,
        });
      });
    }

    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: errors[Object.keys(errors)[0]], errors });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.envelope.update({
        where: { id: envelope.id },
        data: {
          ...data,
          fieldValues: {
            ...values,
            [EXPIRY_META_KEY]: expiresInDays,
            // Carried through unchanged. `readFieldValues` strips every `$` key, so an
            // edit that did not re-attach these would erase the autofill markers — and
            // TC-03-INT-05 is explicit that overwriting an autofilled value by hand
            // leaves the key marked, because the marker records what happened at
            // creation. There is no path that recomputes them: that would be the live
            // binding requirement 8 forbids.
            [AUTOFILLED_META_KEY]: readAutofilledKeys(envelope.fieldValues),
            [AUTOFILL_TRUNCATED_META_KEY]: readAutofillTruncatedKeys(envelope.fieldValues),
          } as Prisma.InputJsonValue,
        },
      });

      // Order is part of the same edit as the names, and `@@unique([envelopeId, order])`
      // makes a straight swap collide half-way through. Parking every row on a negative
      // order first keeps the constraint satisfiable at every step.
      if (signerUpdates.length > 0) {
        for (const update of signerUpdates) {
          await tx.envelopeSigner.update({
            where: { id: update.id },
            data: { order: -update.order },
          });
        }
        for (const update of signerUpdates) {
          await tx.envelopeSigner.update({
            where: { id: update.id },
            data: { name: update.name, email: update.email, order: update.order },
          });
        }
      }
    });

    return this.present(session, await this.load(session, envelope.id));
  }

  /**
   * Requirement 10 — one transaction, and requirement 11 — the mail transport is inside
   * its failure boundary. An envelope is never marked `sent` for a message that was
   * never accepted, which is only true if the send that hands the message over is the
   * same send that can still roll the row back.
   */
  /**
   * Requirement 5 fixes the ordering, and TC-04-INT-22 checks it:
   *
   *   1. read the organization's provider **once**, at the start, so a switch landing
   *      mid-send cannot divert an envelope already being created on the other side
   *      (edge case 13);
   *   2. validate and freeze the document in memory — `renderedHtml` and `documentHash`
   *      are computed exactly as spec 02 computes them, unchanged;
   *   3. call `createSession` **outside and before** the transaction (invariant 11), so a
   *      five-attempt backoff can never hold a row lock;
   *   4. only then open the transaction that flips the envelope to `sent`.
   *
   * A provider failure at step 3 therefore leaves the envelope in `draft` with **nothing
   * partially applied** — no frozen HTML, no hash, no token, no event (TC-04-INT-02).
   */
  async send(session: SessionPayload, id: string, req: Request) {
    const envelope = await this.load(session, id);
    this.assertDraft(envelope);

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
      select: { firstName: true, lastName: true },
    });

    // (1) Once, at the start.
    const providerKey = await this.organizationProviderKey(session.organizationId);
    const provider = this.resolveProviderForSend(providerKey);

    // (2) Everything spec 02's send validated and froze, in memory.
    const prepared = this.prepareSend(envelope);

    // (3) The provider call, outside every transaction.
    //
    // Edge case 4 — an earlier send of this envelope may have left a session behind that
    // it could neither pin nor delete. The marker is the evidence, and it turns this call
    // into an adopt-if-present instead of a second document on the provider's side.
    const created = await this.openSession(provider, envelope, prepared, {
      adoptExisting: envelope.providerError === ORPHANED_SESSION,
    });

    const now = new Date();
    const expiresAt = new Date(now.getTime() + prepared.expiryDays * 24 * 60 * 60 * 1000);
    const first = prepared.signers[0];

    // Requirement 14 (spec 02) — only the first signer gets a link. The second signer's
    // token does not exist yet, so a leak of the mailbox cannot produce one. Minted here
    // rather than by the provider: token minting was always ours, and stayed ours.
    const invitation = this.mintInvitation();

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Requirement 12 — concurrent sends resolve to exactly one winner. Prisma has no
        // lock helper, so the lock is raw SQL on the same connection the transaction
        // holds; every other send blocks here and then loses the status check below.
        await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${envelope.id} FOR UPDATE`;

        const fresh = await tx.envelope.findUniqueOrThrow({
          where: { id: envelope.id },
          select: { status: true },
        });
        if (fresh.status !== EnvelopeStatus.draft) throw this.notDraft();

        await tx.signingToken.create({
          data: {
            envelopeSignerId: first.id,
            tokenHash: invitation.tokenHash,
            // The link must not outlive the envelope; a token whose own TTL is longer
            // would still be refused on read, but issuing one says something untrue.
            expiresAt: invitation.expiresAt < expiresAt ? invitation.expiresAt : expiresAt,
          },
        });

        await tx.envelopeSigner.update({
          where: { id: first.id },
          data: { status: SignerStatus.notified },
        });

        // Requirement 6 (spec 04) — the provider's recipient ids land here, so the
        // reconciler can match a recipient to a signer without guessing from an address.
        for (const signer of prepared.signers) {
          const ref = created.signerRefs[signer.id];
          if (ref) {
            await tx.envelopeSigner.update({ where: { id: signer.id }, data: { providerRef: ref } });
          }
        }

        await tx.envelope.update({
          where: { id: envelope.id },
          data: {
            status: EnvelopeStatus.sent,
            renderedHtml: prepared.renderedHtml,
            documentHash: prepared.documentHash,
            sentAt: now,
            expiresAt,
            // Invariant 7 — written here, in the transaction that sets `status = sent`,
            // and never changed afterwards. No code path updates these on a sent,
            // completed, declined, voided or expired envelope.
            providerKey: provider.key,
            providerRef: created.providerRef,
            providerTestMode: created.testMode,
            providerStatus: created.providerStatus,
            // Requirement 24a — a freshly-sent envelope is *fresh*, so its first reads
            // cost no provider call at all (TC-04-INT-12).
            providerSyncedAt: now,
            providerError: null,
          },
        });

        // Requirement 10 writes both events here. `created` carries the envelope's real
        // creation time rather than now, so the trail does not claim the document sprang
        // into existence at the moment it was sent.
        await this.events.record(tx, {
          envelopeId: envelope.id,
          type: 'created',
          occurredAt: envelope.createdAt,
          actor: { accountId: envelope.createdByAccountId },
          metadata: {
            templateVersionId: envelope.templateVersionId,
            versionNumber: envelope.templateVersion.versionNumber,
          },
        });
        await this.events.record(tx, {
          envelopeId: envelope.id,
          type: 'sent',
          documentHash: prepared.documentHash,
          signerId: first.id,
          actor: {
            accountId: session.accountId,
            ipAddress: clientIp(req),
            userAgent: userAgentOf(req),
          },
          metadata: { notifiedSignerOrder: first.order },
        });

        // Inside the transaction on purpose (spec 02 requirement 11). A rejection here
        // throws, and everything above — the freeze, the token, the events — goes with it.
        //
        // Requirement 12 (spec 04): the invitation is **ours** under every provider that
        // says so, sent from our SES identity with a link to our own `/sign/{token}` and
        // never a provider link, so the counterparty never receives mail from a vendor
        // they have no relationship with.
        if (sendsOurOwnInvitation(provider.capabilities)) {
          try {
            await this.mail.sendSigningInvitation({
              to: first.email,
              recipientName: first.name,
              envelopeTitle: prepared.title,
              organizationName: envelope.organization.name,
              organizationId: envelope.organizationId,
              senderName: `${account.firstName} ${account.lastName}`.trim(),
              signingUrl: invitation.signingUrl,
              expiresAt,
            });
          } catch (error) {
            this.log.warn(`Invitation for envelope ${envelope.id} was rejected by the transport`);
            throw new MailDeliveryFailure(String(error));
          }

          await this.events.record(tx, {
            envelopeId: envelope.id,
            type: 'email_accepted',
            signerId: first.id,
            documentHash: prepared.documentHash,
            actor: { email: first.email },
          });
        }

        return {
          status: 'sent' as const,
          sentAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          documentHash: prepared.documentHash,
          notifiedSignerId: first.id,
        };
      });

      return result;
    } catch (error) {
      // The transaction rolled back and the session it would have pinned is still open on
      // the provider's side — the mail transport rejected the invitation, or this send
      // lost the race at the lock above and threw `not_draft`. Either way the envelope is
      // back to `draft` and nothing in our rows refers to that document, so it is removed
      // here rather than left open with the counterparties' live signing links on it.
      // Compensation, not rollback: it runs outside the transaction because the provider
      // call it undoes ran outside the transaction too.
      await this.abandonSession(provider, envelope.id, created.providerRef);

      if (error instanceof MailDeliveryFailure) {
        throw new BadGatewayException({
          error: 'mail_delivery_failed',
          message: ENVELOPE_MESSAGES.send.mailFailure,
        });
      }
      throw error;
    }
  }

  /**
   * Undoes a `createSession` whose send did not survive to pin it (edge case 4).
   *
   * Best effort by construction, and every branch of it is silent to the caller: the send
   * has already failed and the error it failed with is the one worth reporting. What must
   * not happen is the leftover going unrecorded — so when the removal fails, the marker
   * goes on the envelope and the next send adopts rather than creates.
   */
  private async abandonSession(
    provider: SigningProvider,
    envelopeId: string,
    providerRef: string,
  ): Promise<void> {
    if (!providerRef) return;

    // The one document that must never be deleted here: the one a *winning* send pinned.
    // Two concurrent sends of an envelope that already carries the marker both adopt the
    // same leftover, so the loser's compensation would otherwise delete the document the
    // envelope is now sent on. Anything else — a document this send created on its own —
    // is referenced by nothing and is safe to remove.
    const pinnedByTheWinner = await this.prisma.envelope.count({
      where: { id: envelopeId, providerRef, status: { not: EnvelopeStatus.draft } },
    });
    if (pinnedByTheWinner > 0) return;

    try {
      await provider.cancel({ envelopeId, providerRef, reason: 'send_rolled_back' });
      return;
    } catch (error) {
      // Already gone on their side is the outcome we wanted, reached by another route.
      if (error instanceof ProviderDocumentGoneError) return;
      this.log.error(
        `Envelope ${envelopeId}: the send rolled back and its provider document ` +
          `${providerRef} could not be removed (${error instanceof Error ? error.message : error})`,
      );
    }

    try {
      // `updateMany` with the status in the filter: if this send lost a race, the winner
      // owns the envelope now and its `providerError` is not ours to overwrite.
      await this.prisma.envelope.updateMany({
        where: { id: envelopeId, status: EnvelopeStatus.draft },
        data: { providerError: ORPHANED_SESSION },
      });
    } catch (error) {
      this.log.error(
        `Envelope ${envelopeId}: could not record the orphaned provider document ` +
          `${providerRef} (${error instanceof Error ? error.message : error})`,
      );
    }
  }

  /**
   * Everything spec 02's send did before it wrote anything: the required-field check, the
   * signer check, the freeze, and the hash. Unchanged in rule, in order, and in message —
   * only its position moved, so the document exists before the provider is called.
   */
  private prepareSend(envelope: LoadedEnvelope): PreparedSend {
    const version = envelope.templateVersion;
    const fields = readFields(version.fieldsSnapshot);
    const roles = readSignerRoles(version.signerRoles);
    const values = readFieldValues(envelope.fieldValues);

    // Requirement 7 — every required sender-owned field. Signer-owned ones are left for
    // the signing page and are not checked here.
    const missing = fields
      .filter((f) => f.filledBy === 'sender' && f.required)
      .filter((f) => (values[f.key] ?? '').trim().length === 0)
      .map((f) => f.key);
    if (missing.length > 0) {
      throw new BadRequestException({
        error: 'missing_required_fields',
        keys: missing,
        message: ENVELOPE_MESSAGES.send.missingFields,
      });
    }

    // Requirement 8 — both signers need a name and a valid email. Spec 04 validation rule
    // 5 restates the same rule for a different reason: SignWell rejects the document
    // outright rather than accepting a blank recipient.
    const incomplete = envelope.signers.some(
      (s) => !validateSignerName(s.name).valid || !validateSignerEmail(s.email).valid,
    );
    if (incomplete || envelope.signers.length === 0) {
      throw new BadRequestException({
        error: 'incomplete_signers',
        message: ENVELOPE_MESSAGES.send.incompleteSigners,
      });
    }

    const renderedHtml = renderEnvelopeDocument({
      title: envelope.title,
      bodyHtml: version.bodyHtml,
      values,
      signers: envelope.signers.map((s) => ({
        roleKey: s.roleKey,
        roleLabel: roles.find((r) => r.key === s.roleKey)?.label ?? s.roleKey,
        name: s.name,
        order: s.order,
      })),
      signerOwnedKeys: signerOwnedFieldKeys(fields),
    });

    return {
      title: envelope.title,
      renderedHtml,
      documentHash: sha256HexOfString(renderedHtml),
      expiryDays: readExpiryDays(envelope.fieldValues),
      signers: envelope.signers.map((s) => ({
        id: s.id,
        name: s.name,
        email: s.email,
        order: s.order,
        roleKey: s.roleKey,
      })),
      // Only the fields a signer fills in, and only for roles that actually have a signer.
      // The translation refuses anything else, which is the gate that matters.
      signerOwnedFields: fields
        .filter((field) => (field.filledBy ?? '').startsWith('signer:'))
        .map((field) => ({
          key: field.key,
          roleKey: field.filledBy.slice('signer:'.length),
          required: field.required,
        })),
    };
  }

  /**
   * `createSession`, and the translation that has to happen first for a provider that
   * hosts the signing surface itself.
   *
   * The translated document is a **copy**. `Envelope.renderedHtml` and `documentHash` keep
   * describing exactly the bytes spec 02 froze — requirement 29 says outright that our
   * hash and theirs describe two different documents rather than pretending one verifies
   * the other.
   */
  private async openSession(
    provider: SigningProvider,
    envelope: LoadedEnvelope,
    prepared: PreparedSend,
    options: { adoptExisting: boolean },
  ) {
    const embedded = provider.capabilities.signingSurface === 'embedded';

    let documentHtml = prepared.renderedHtml;
    let expectedFields: ExpectedProviderField[] = [];

    if (embedded) {
      const signerOf = new Map(prepared.signers.map((s) => [s.order, s.id]));
      try {
        const translated = translateToTextTags(
          prepared.renderedHtml,
          prepared.signers,
          prepared.signerOwnedFields,
        );
        documentHtml = translated.html;
        expectedFields = translated.expectedFields.map((field) => ({
          type: field.type,
          required: field.required,
          fieldKey: field.fieldKey,
          signerId: signerOf.get(field.recipientNumber) ?? '',
        }));
      } catch (error) {
        if (error instanceof UnresolvedPlaceholdersError) {
          // Before a document is created and before a webhook can exist. Sending anyway
          // would let a contract be signed with a stray, invisible field on it.
          throw new BadRequestException({
            error: 'document_tags_unresolved',
            keys: error.keys,
            message: SIGNING_PROVIDER_MESSAGES.send.unresolvedPlaceholders(error.keys),
          });
        }
        throw error;
      }
    }

    try {
      return await provider.createSession({
        envelopeId: envelope.id,
        organizationId: envelope.organizationId,
        title: prepared.title,
        documentHtml,
        signers: prepared.signers,
        expiresInDays: prepared.expiryDays,
        expectedFields,
        adoptExisting: options.adoptExisting,
      });
    } catch (error) {
      throw this.providerSendFailure(error);
    }
  }

  private mintInvitation() {
    const { token, tokenHash } = generateSigningToken();
    const expiresAt = new Date(Date.now() + signingTokenTtlDays() * 24 * 60 * 60 * 1000);
    return { token, tokenHash, expiresAt, signingUrl: signingPageUrl(token) };
  }

  /** The organization's setting, read once per operation that needs it (requirement 1). */
  private async organizationProviderKey(organizationId: string): Promise<string> {
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { signatureProviderKey: true },
    });
    return organization.signatureProviderKey;
  }

  /**
   * Requirement 40's first half. Returns the `providerError` to record, or `null` when
   * there is nothing to say — which is the normal case for the in-house engine, whose
   * `cancel` has nothing remote to stop.
   */
  private async cancelRemoteSession(
    envelope: LoadedEnvelope,
  ): Promise<{ error: string | null }> {
    if (!envelope.providerRef) return { error: null };

    let provider: SigningProvider;
    try {
      provider = this.providers.require(envelope.providerKey);
    } catch {
      // Edge case 16 — the adapter unregistered while this envelope was in flight. Our
      // void is ours and is not blocked by their configuration.
      return { error: 'provider_unconfigured' };
    }

    try {
      await provider.cancel({ envelopeId: envelope.id, providerRef: envelope.providerRef });
      return { error: null };
    } catch (error) {
      if (error instanceof ProviderDocumentGoneError) {
        // Already gone — someone deleted it in their UI, or it never committed.
        return { error: 'provider_document_already_gone' };
      }
      this.log.warn(
        `Cancelling the remote session for envelope ${envelope.id} failed: ${
          error instanceof Error ? error.message : error
        }`,
      );
      return { error: error instanceof Error ? error.message : String(error) };
    }
  }

  private resolveProviderForSend(providerKey: string): SigningProvider {
    try {
      return this.providers.require(providerKey);
    } catch (error) {
      throw this.providerSendFailure(error);
    }
  }

  /**
   * Every provider-side reason a send can fail, turned into a refusal that leaves the
   * envelope in `draft`. A failed send is recoverable; a half-created one is not.
   */
  private providerSendFailure(error: unknown): HttpException {
    if (error instanceof ProviderFieldsNotMaterializedError) {
      return new HttpException(
        {
          error: 'document_fields_not_materialized',
          expected: error.expected,
          received: error.received,
          message: SIGNING_PROVIDER_MESSAGES.send.providerUnavailable,
        },
        502,
      );
    }
    if (
      error instanceof ProviderUnavailableError ||
      error instanceof ProviderUnconfiguredError ||
      error instanceof UnknownProviderError
    ) {
      return new HttpException(
        {
          error:
            error instanceof ProviderUnavailableError
              ? 'provider_unavailable'
              : 'provider_unconfigured',
          message: SIGNING_PROVIDER_MESSAGES.send.providerUnavailable,
        },
        503,
      );
    }
    if (error instanceof HttpException) return error;
    return new HttpException(
      { error: 'provider_unavailable', message: SIGNING_PROVIDER_MESSAGES.send.providerUnavailable },
      503,
    );
  }
  /** Requirement 32 — captured signatures stay; every outstanding token dies. */
  async voidEnvelope(session: SessionPayload, id: string, dto: VoidEnvelopeDto, req: Request) {
    const envelope = await this.load(session, id);

    const reason = validateReason(dto?.reason, true);
    if (!reason.valid) {
      throw new BadRequestException({ message: reason.error, errors: { reason: reason.error } });
    }

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
      select: { firstName: true, lastName: true },
    });

    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
    if (!canVoid(status)) {
      throw new ConflictException({
        error: 'invalid_status',
        message: ENVELOPE_MESSAGES.void.wrongStatus,
      });
    }

    /* ------------------------------------------------------------------ *
     * Requirement 40 — **voiding is delete-then-settle**. The order is: call `DELETE`,
     * then mark the envelope voided. There is no re-read: `204` is the confirmation, and
     * requirements 41 and 42 are why asking again would be wrong — the document is gone,
     * so a read can only produce the `404` we already expect, and the reconciler is
     * required to stop calling rather than to read that `404` as a provider fault.
     *
     * SignWell exposes no cancel or void route at all, so `cancel` is a hard `DELETE`.
     * It runs here, outside the transaction (invariant 11), and *before* the local void:
     * if the last signer signs between our decision and the delete landing, the delete
     * still succeeds and the completed document is destroyed on their side. That is a
     * real and accepted loss — a void is an instruction to stop, the window is
     * milliseconds wide, and reading first would widen it rather than close it. The
     * captured signatures remain in our own trail, which spec 02 requirement 26 already
     * guarantees (edge case 25).
     *
     * A `404` from the delete means the document was already gone. The envelope still
     * voids, with `providerError` set, because our void must not be blocked by their
     * state (edge case 26).
     * ------------------------------------------------------------------ */
    const providerOutcome = await this.cancelRemoteSession(envelope);

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${envelope.id} FOR UPDATE`;
      const fresh = await tx.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: true },
      });

      // Re-checked inside the transaction: a signature or a second void may have landed
      // between the read above and here.
      if (!canVoid(effectiveStatus(fresh.status as EnvelopeStatusName, fresh.expiresAt))) {
        throw new ConflictException({
          error: 'invalid_status',
          message: ENVELOPE_MESSAGES.void.wrongStatus,
        });
      }

      const invalidated = await tx.signingToken.updateMany({
        where: {
          signer: { envelopeId: fresh.id },
          isInvalidated: false,
          usedAt: null,
        },
        data: { isInvalidated: true },
      });

      const voidedAt = new Date();
      await tx.envelope.update({
        where: { id: fresh.id },
        data: {
          status: EnvelopeStatus.voided,
          voidedAt,
          voidedByAccountId: session.accountId,
          voidReason: reason.value,
          ...(providerOutcome.error === null ? {} : { providerError: providerOutcome.error }),
        },
      });

      await this.events.record(tx, {
        envelopeId: fresh.id,
        type: 'voided',
        documentHash: fresh.documentHash,
        actor: {
          accountId: session.accountId,
          ipAddress: clientIp(req),
          userAgent: userAgentOf(req),
        },
        // The reason is the sender's own words about the document, not a field value, so
        // it belongs in the trail — requirement 32 requires it to be recorded.
        metadata: { reason: reason.value, invalidatedTokens: invalidated.count },
      });

      return { voidedAt, invalidated: invalidated.count, signers: fresh.signers, title: fresh.title };
    });

    // Requirement 32 — every signer who had been notified. After the commit: a mailbox
    // that is down must not be able to un-void a document whose links are already dead.
    for (const signer of outcome.signers) {
      if (signer.status === SignerStatus.pending || !signer.email) continue;
      await this.safeMail(() =>
        this.mail.sendEnvelopeVoided({
          to: signer.email,
          recipientName: signer.name,
          envelopeTitle: outcome.title,
          organizationName: envelope.organization.name,
          organizationId: envelope.organizationId,
          voidedByName: `${account.firstName} ${account.lastName}`.trim(),
          voidReason: reason.value,
          voidedAt: outcome.voidedAt,
        }),
      );
    }

    return {
      status: 'voided',
      voidedAt: outcome.voidedAt.toISOString(),
      invalidatedTokens: outcome.invalidated,
    };
  }

  /** Requirement 13 — a fresh token for the current signer, the old one invalidated. */
  async resend(session: SessionPayload, id: string, signerId: string, req: Request) {
    const envelope = await this.load(session, id);
    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
    if (isTerminal(status) || status === 'draft') {
      throw new ConflictException({
        error: 'invalid_status',
        message: ENVELOPE_MESSAGES.resend.wrongSigner,
      });
    }

    const signer = envelope.signers.find((s) => s.id === signerId);
    if (!signer) throw new NotFoundException();

    const current = currentSignerOf(envelope.signers);
    if (!current || current.id !== signer.id) {
      throw new ConflictException({
        error: 'not_current_signer',
        message: ENVELOPE_MESSAGES.resend.wrongSigner,
      });
    }

    const last = this.lastResendAt.get(signer.id) ?? 0;
    const elapsed = Date.now() - last;
    if (elapsed < 60_000) {
      throw new HttpException(
        {
          error: 'rate_limited',
          retryAfterSeconds: Math.max(1, Math.ceil((60_000 - elapsed) / 1000)),
          message: ENVELOPE_MESSAGES.resend.tooSoon,
        },
        429,
      );
    }

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
      select: { firstName: true, lastName: true },
    });

    // Ours under every provider: reminders and resends are one policy, not two
    // (requirement 18), and the token they carry is minted by us either way.
    const invitation = this.mintInvitation();
    const expiresAt =
      envelope.expiresAt && envelope.expiresAt < invitation.expiresAt
        ? envelope.expiresAt
        : invitation.expiresAt;

    const sentAt = new Date();
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.signingToken.updateMany({
          where: { envelopeSignerId: signer.id, isInvalidated: false, usedAt: null },
          data: { isInvalidated: true },
        });
        await tx.signingToken.create({
          data: { envelopeSignerId: signer.id, tokenHash: invitation.tokenHash, expiresAt },
        });
        await tx.envelopeSigner.update({
          where: { id: signer.id },
          data: {
            // A resent link puts the signer back at "notified"; they have not seen this
            // document yet as far as the new link is concerned.
            status: signer.status === SignerStatus.pending ? SignerStatus.notified : signer.status,
          },
        });
        await this.events.record(tx, {
          envelopeId: envelope.id,
          type: 'reminded',
          signerId: signer.id,
          documentHash: envelope.documentHash,
          actor: {
            accountId: session.accountId,
            ipAddress: clientIp(req),
            userAgent: userAgentOf(req),
          },
          metadata: { reason: 'resend' },
        });

        try {
          await this.mail.sendSigningInvitation({
            to: signer.email,
            recipientName: signer.name,
            envelopeTitle: envelope.title,
            organizationName: envelope.organization.name,
            organizationId: envelope.organizationId,
            senderName: `${account.firstName} ${account.lastName}`.trim(),
            signingUrl: invitation.signingUrl,
            expiresAt,
          });
        } catch (error) {
          throw new MailDeliveryFailure(String(error));
        }
      });
    } catch (error) {
      if (error instanceof MailDeliveryFailure) {
        throw new BadGatewayException({
          error: 'mail_delivery_failed',
          message: ENVELOPE_MESSAGES.send.mailFailure,
        });
      }
      throw error;
    }

    this.lastResendAt.set(signer.id, Date.now());
    return { sentAt: sentAt.toISOString() };
  }

  /** Invariant 1 — only a draft may be deleted. */
  async remove(session: SessionPayload, id: string): Promise<void> {
    const envelope = await this.load(session, id);
    if (!canEditOrDelete(effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt))) {
      throw this.notDraft();
    }
    await this.prisma.envelope.delete({ where: { id: envelope.id } });
  }

  /**
   * Requirement 31's retry action. Re-enqueues the render; the job itself is what
   * refuses to touch an envelope that already has a PDF.
   */
  async retryPdf(session: SessionPayload, id: string) {
    const envelope = await this.load(session, id);
    if (envelope.status !== EnvelopeStatus.completed) {
      throw new ConflictException({
        error: 'invalid_status',
        message: ENVELOPE_MESSAGES.void.wrongStatus,
      });
    }
    if (envelope.pdfStatus === PdfStatus.ready) {
      return { pdfStatus: envelope.pdfStatus };
    }

    await this.prisma.envelope.update({
      where: { id: envelope.id },
      data: { pdfStatus: PdfStatus.pending },
    });
    await this.queue.enqueue({ name: 'pdf-render', envelopeId: envelope.id });
    return { pdfStatus: PdfStatus.pending };
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /**
   * The single scoped read. Scoping by `session.organizationId` rather than by id alone
   * is what makes a cross-organization envelope a 404 (TC-02-INT-27).
   */
  private async load(session: SessionPayload, id: string): Promise<LoadedEnvelope> {
    const envelope = await this.prisma.envelope.findFirst({
      where: { id, organizationId: session.organizationId },
      include: {
        signers: { orderBy: { order: 'asc' } },
        templateVersion: { include: { template: true } },
        createdBy: true,
        organization: true,
      },
    });
    if (!envelope) throw new NotFoundException();
    return envelope;
  }

  private async present(session: SessionPayload, envelope: LoadedEnvelope) {
    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
    const fields = readFields(envelope.templateVersion.fieldsSnapshot);
    const roles = readSignerRoles(envelope.templateVersion.signerRoles);
    const values = readFieldValues(envelope.fieldValues);
    const canManage = await this.can(session, 'ManageEnvelopes');

    // Read back from the snapshot, never re-resolved — see the note on the meta keys.
    const autofilled = new Set(readAutofilledKeys(envelope.fieldValues));
    const truncated = new Set(readAutofillTruncatedKeys(envelope.fieldValues));

    /* ------------------------------------------------------------------ *
     * Requirement 23, and the flag that is *not* a mask.
     *
     * `masked` below tells the fill form to render an input read-only with the note
     * "Hidden — will be filled automatically" (the spec's manager alt flow). It does not
     * change `value`, and that is the point of requirement 23: once resolved, the value
     * is part of the contract and is shown in full to anyone who may view the envelope.
     * A manager who cannot read a member's tax id can still create, read, send, and
     * download the contract that carries it — masking the document would mean a contract
     * that hides its own terms.
     *
     * So this is a *presentation* hint about where the value came from, computed from the
     * source's `sensitive` flag and the caller's capability, and never from the value.
     * ------------------------------------------------------------------ */
    const canSeePii = await this.callerCanReadProfilePii(session, envelope.subjectMembershipId);

    // The subject's *name*, resolved here rather than by the reader.
    //
    // The envelope screens name the subject, and a screen that only reads one envelope has
    // no business fetching the organization's whole member roster to turn one id into one
    // name — that would put every member's name on a screen that needs exactly one, and it
    // is a roster read a viewer of this envelope may not otherwise be entitled to. The
    // name itself is not PII-gated (it is already on the roster, in the signature block,
    // and on the certificate); the *profile* behind it still is, and nothing here reads it.
    const subject = await this.subjectSummary(envelope.subjectMembershipId);

    const lastEmail = await this.prisma.envelopeEvent.findMany({
      where: {
        envelopeId: envelope.id,
        type: { in: ['email_accepted', 'email_delivered', 'email_bounced'] },
      },
      orderBy: { occurredAt: 'asc' },
      select: { envelopeSignerId: true, type: true },
    });
    const emailStatus = new Map<string, string>();
    for (const event of lastEmail) {
      if (event.envelopeSignerId) emailStatus.set(event.envelopeSignerId, event.type);
    }

    return {
      id: envelope.id,
      title: envelope.title,
      status,
      template: {
        id: envelope.templateVersion.templateId,
        name: envelope.templateVersion.template.name,
        versionNumber: envelope.templateVersion.versionNumber,
      },
      expiresInDays: readExpiryDays(envelope.fieldValues),
      subjectMembershipId: envelope.subjectMembershipId,
      // `null` when the envelope has no subject, and also when the membership has since
      // been deleted outright — the id column is `SetNull` on delete, so that case cannot
      // normally arise, but the reader must not have to care.
      subject,
      autofilled: [...autofilled],
      autofillTruncated: [...truncated],
      fields: fields.map((field) => {
        const source =
          field.autofillSource === null ? undefined : findAutofillSource(field.autofillSource);
        return {
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          options: field.options,
          maxLength: field.maxLength,
          filledBy: field.filledBy,
          // Requirement 23: the real, snapshotted value, for every caller who may read
          // this envelope. Never masked — see the note above.
          value: values[field.key] ?? '',
          autofilled: autofilled.has(field.key),
          autofillSource: field.autofillSource,
          autofillTruncated: truncated.has(field.key),
          masked: (source?.sensitive ?? false) && autofilled.has(field.key) && !canSeePii,
        };
      }),
      signers: envelope.signers.map((signer) => ({
        id: signer.id,
        roleKey: signer.roleKey,
        label: roles.find((r) => r.key === signer.roleKey)?.label ?? signer.roleKey,
        name: signer.name,
        email: signer.email,
        order: signer.order,
        status: signer.status,
        signedAt: signer.signedAt?.toISOString() ?? null,
        declinedAt: signer.declinedAt?.toISOString() ?? null,
        declineReason: signer.declineReason,
        lastEmailStatus: emailStatus.get(signer.id) ?? null,
      })),
      // Requirement: present only once the envelope has been sent. Before that the
      // client renders a live preview from the template and the current values.
      //
      // Presentation copy: the frozen HTML keeps every signer-owned placeholder literal
      // and every signature slot empty, and a reader must see the value the signer typed
      // and the signatures collected so far rather than template syntax and blank lines.
      // `documentHash` below still belongs to the stored bytes, which are unchanged.
      renderedHtml: envelope.renderedHtml
        ? presentDocument(envelope.renderedHtml, values, capturedSignatures(envelope.signers))
        : null,
      documentHash: envelope.documentHash,
      pdfStatus: envelope.pdfStatus,
      expiresAt: envelope.expiresAt?.toISOString() ?? null,
      sentAt: envelope.sentAt?.toISOString() ?? null,
      completedAt: envelope.completedAt?.toISOString() ?? null,
      voidedAt: envelope.voidedAt?.toISOString() ?? null,
      voidReason: envelope.voidReason,
      canEdit: canManage && canEditOrDelete(status),
      canSend: canManage && canEditOrDelete(status),
      canVoid: (await this.can(session, 'VoidEnvelope')) && canVoid(status),
      canDownload:
        (await this.can(session, 'DownloadSignedDocument')) &&
        status === 'completed' &&
        envelope.pdfStatus === PdfStatus.ready,
      /* ------------------------------------------------------------------ *
       * Spec 04 requirement 34 — which provider executed this document.
       *
       * Both values come from the envelope's **own columns**, written at send, and never
       * from configuration at display time: switching test mode off must not relabel a
       * document signed while it was on, and switching provider must not relabel history
       * (edge case 17). A test-mode document has no legal weight and must never be
       * mistaken for one that does.
       * ------------------------------------------------------------------ */
      provider: {
        key: envelope.providerKey,
        name: signingProviderName(envelope.providerKey),
        testMode: envelope.providerTestMode,
        // Requirement 28 — a provider that produces its own completed document produces
        // its own certificate with it, so ours is never offered beside it.
        certificateIssued: this.issuesOwnCertificate(envelope.providerKey),
        // Edge case 16 — a provider that is no longer configured is said so on the
        // screen rather than leaving the envelope silently stalled.
        unconfigured: !this.providers.isConfigured(envelope.providerKey),
      },
      providerStatus: envelope.providerStatus,
      providerError: envelope.providerError,
    };
  }

  /**
   * Branching on the capability rather than on the key: a third provider that assembles
   * its own document needs no change here.
   */
  private issuesOwnCertificate(providerKey: string): boolean {
    const provider = this.providers.find(providerKey);
    return provider ? issuesCertificateOfCompletion(provider.capabilities) : false;
  }

  private presentActor(
    event: { actorAccountId: string | null; actorEmail: string | null; envelopeSignerId: string | null },
    signers: Map<string, { name: string; email: string }>,
  ) {
    if (event.envelopeSignerId && signers.has(event.envelopeSignerId)) {
      const signer = signers.get(event.envelopeSignerId)!;
      if (event.actorEmail) {
        return { kind: 'signer' as const, name: signer.name, email: signer.email };
      }
    }
    if (event.actorAccountId) {
      return { kind: 'member' as const, accountId: event.actorAccountId };
    }
    if (event.actorEmail) {
      return { kind: 'signer' as const, name: null, email: event.actorEmail };
    }
    return { kind: 'system' as const };
  }

  private async chainOf(envelopeId: string) {
    return this.prisma.envelopeEvent.findMany({
      where: { envelopeId },
      // The same total order `EnvelopeEventsService` writes against. Verification that
      // sorted differently would report a healthy chain as broken.
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
    });
  }

  /** Requirement 39 — recompute and report the first divergence, by event id. */
  private verify(
    events: {
      id: string;
      envelopeId: string;
      type: string;
      occurredAt: Date;
      actorAccountId: string | null;
      actorEmail: string | null;
      metadata: Prisma.JsonValue | null;
      previousEventHash: string | null;
      eventHash: string;
    }[],
  ) {
    const links: ChainLink[] = events.map((event) => ({
      previousEventHash: event.previousEventHash,
      envelopeId: event.envelopeId,
      type: event.type,
      occurredAt: event.occurredAt.toISOString(),
      actor: event.actorAccountId ?? event.actorEmail ?? '',
      metadata: event.metadata ?? null,
      eventHash: event.eventHash,
    }));

    const result = verifyChain(links);
    return result.valid
      ? { valid: true, firstInvalidEventId: null }
      : { valid: false, firstInvalidEventId: events[result.brokenAtIndex]?.id ?? null };
  }

  private assertDraft(envelope: LoadedEnvelope): void {
    const status = effectiveStatus(envelope.status as EnvelopeStatusName, envelope.expiresAt);
    if (!canEditOrDelete(status)) throw this.notDraft();
  }

  private notDraft(): ConflictException {
    return new ConflictException({
      error: 'not_draft',
      message: ENVELOPE_MESSAGES.edit.afterSend,
    });
  }

  /**
   * The subject membership, with everything autofill needs to read off it.
   *
   * **No status filter** — requirement 13: a contract may legitimately be issued for
   * someone who has just left, so a `removed` membership resolves normally. Refusing it
   * here would make the "Former members" group in the subject picker unusable.
   *
   * A supplied-but-unknown id is the spec's `400 subject_not_found` rather than a 404,
   * because the request itself is well-formed and the client can act on the distinction:
   * the member the picker offered has since been deleted. It is scoped by
   * `session.organizationId`, so a foreign id is indistinguishable from a deleted one and
   * the caller still learns nothing about another organization. Requirement 12's case —
   * *no* subject at all — is not an error and never reaches the lookup.
   */
  private async resolveSubject(session: SessionPayload, membershipId: string | null | undefined) {
    if (!membershipId) return null;
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: session.organizationId },
      include: { account: true, profile: true },
    });
    if (!membership) {
      throw new BadRequestException({
        error: 'subject_not_found',
        message: PROFILE_MESSAGES.subject.missing,
      });
    }
    return membership;
  }

  /**
   * Flattens the subject across `Account`, `Membership`, and `MemberProfile` into the
   * shape the resolver wants.
   *
   * **Requirement 23 lives here, as an absence.** Nothing on this path masks anything —
   * not `taxId`, not `dateOfBirth` — and the caller's own capabilities are never consulted
   * when building the values. That is the counterpart to the profile screen's masking, and
   * it is easy to get backwards: a value snapshotted into an envelope is part of the
   * contract, so a manager who cannot read a member's passport number can still create a
   * contract that carries it, and the document they are authorized to send renders the
   * real value. Calling `maskProfileValue` here would put `***4567` into a signed
   * agreement.
   *
   * `member.jobTitle` reads `Membership.jobTitle`. It passed `null` while that column did
   * not exist — the source stayed in the catalogue and resolved to the empty string, which
   * requirement 7 makes legal — and the promise made here was that a template bound to it
   * would start working the day the column shipped, with no template migration. Spec 05
   * shipped it; this is that day, and nothing about the templates changed.
   *
   * The timezone is the *creating account's*, not the organization's, and that is a
   * documented approximation: requirement 2 says `today` is the server date in the
   * **organization** timezone, and `Organization` has no timezone column in this schema.
   * The account's IANA zone (captured at signup) is the closest true thing available and
   * is right for the overwhelmingly common case of a sender in the org's own zone; it
   * falls back to UTC when absent. Adding `Organization.timezone` is a schema change this
   * spec is explicitly not making.
   */
  private async autofillContext(
    session: SessionPayload,
    subject: Awaited<ReturnType<EnvelopesService['resolveSubject']>>,
  ): Promise<AutofillContext> {
    const [organization, creator] = await Promise.all([
      this.prisma.organization.findUnique({
        where: { id: session.organizationId },
        select: { name: true },
      }),
      this.prisma.account.findUnique({
        where: { id: session.accountId },
        select: { timezone: true },
      }),
    ]);

    return {
      subject:
        subject === null
          ? null
          : {
              firstName: subject.account.firstName,
              lastName: subject.account.lastName,
              email: subject.account.email,
              jobTitle: subject.jobTitle,
              joinedAt: subject.joinedAt,
              addressLine: subject.profile?.addressLine ?? null,
              city: subject.profile?.city ?? null,
              postalCode: subject.profile?.postalCode ?? null,
              country: subject.profile?.country ?? null,
              taxId: subject.profile?.taxId ?? null,
              dateOfBirth: subject.profile?.dateOfBirth ?? null,
              idDocumentNumber: subject.profile?.idDocumentNumber ?? null,
              bankDetails: subject.profile?.bankDetails ?? null,
            },
      organizationName: organization?.name ?? '',
      timezone: creator?.timezone ?? null,
    };
  }

  /**
   * The subject as the envelope screens need to name them: id, display name, and whether
   * they have since left. Deliberately nothing else — no profile row is touched here, so
   * the PII rules that govern the profile screen have nothing to govern.
   *
   * `isRemoved` is carried for the same reason the subject picker carries it (spec 03
   * requirement 13): a contract may legitimately be about someone who has left, and the
   * screen says so as an advisory note rather than an error.
   */
  private async subjectSummary(
    subjectMembershipId: string | null,
  ): Promise<{ id: string; name: string; isRemoved: boolean } | null> {
    if (subjectMembershipId === null) return null;

    const membership = await this.prisma.membership.findUnique({
      where: { id: subjectMembershipId },
      select: { id: true, status: true, account: { select: { firstName: true, lastName: true } } },
    });
    if (!membership) return null;

    return {
      id: membership.id,
      // Same composition as the members list, so one member reads identically on the
      // picker and on the envelope that was created from it.
      name: `${membership.account.firstName} ${membership.account.lastName}`,
      isRemoved: membership.status === 'removed',
    };
  }

  /**
   * Whether this caller could have read the subject's sensitive profile values *on the
   * profile screen*. Used only to decide the `masked` presentation hint above — never to
   * decide what `value` contains, which requirement 23 settles for everyone alike.
   *
   * Runs through `canReadProfilePii(role, isSelf)` rather than `hasCapability` so a member
   * looking at an envelope drawn from their own profile is not told their own date of
   * birth is hidden from them.
   */
  private async callerCanReadProfilePii(
    session: SessionPayload,
    subjectMembershipId: string | null,
  ): Promise<boolean> {
    const [caller, subject] = await Promise.all([
      this.prisma.membership.findFirst({
        where: {
          accountId: session.accountId,
          organizationId: session.organizationId,
          status: 'active',
        },
        select: { role: true },
      }),
      subjectMembershipId === null
        ? Promise.resolve(null)
        : this.prisma.membership.findUnique({
            where: { id: subjectMembershipId },
            select: { accountId: true },
          }),
    ]);

    return canReadProfilePii(caller?.role ?? null, subject?.accountId === session.accountId);
  }

  private async can(
    session: SessionPayload,
    capability: Parameters<typeof hasCapability>[1],
  ): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        accountId: session.accountId,
        organizationId: session.organizationId,
        status: 'active',
      },
      select: { role: true },
    });
    return hasCapability(membership?.role, capability);
  }

  /**
   * Notifications that follow a committed transition. A failure here is an operational
   * problem — the transition is already a fact — so it is logged, never thrown back at a
   * caller who can do nothing about it.
   */
  private async safeMail(send: () => Promise<void>): Promise<void> {
    try {
      await send();
    } catch (error) {
      this.log.error(`Notification failed: ${error instanceof Error ? error.message : error}`);
    }
  }
}

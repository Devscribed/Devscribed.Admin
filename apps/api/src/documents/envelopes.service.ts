import {
  ENVELOPE_LIMITS,
  ENVELOPE_MESSAGES,
  canEditOrDelete,
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
import { SignatureProvider } from '../signature/signature-provider';
import { FileStorage, PRESIGNED_URL_TTL_SECONDS } from '../storage/file-storage';
import { EnvelopeEventsService } from './envelope-events.service';
import { renderEnvelopeDocument } from './envelope-renderer';
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
 * first hop the platform vouches for. Vercel prepends the real client, so the first
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
    private readonly signature: SignatureProvider,
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
    const envelope = await this.load(session, id);
    return this.present(session, envelope);
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
    // that is not what anybody signed.
    if (envelope.renderedHtml) return { html: envelope.renderedHtml };

    const roles = readSignerRoles(envelope.templateVersion.signerRoles);
    return {
      html: renderEnvelopeDocument({
        title: envelope.title,
        bodyHtml: envelope.templateVersion.bodyHtml,
        values: readFieldValues(envelope.fieldValues),
        signers: envelope.signers.map((s) => ({
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

    const subjectMembershipId = await this.resolveSubject(session, dto?.subjectMembershipId);

    // Requirement 4 — autofill is spec 03. The plumbing is here and empty: an envelope
    // created today simply has nothing autofilled, and spec 03 fills this in without a
    // change to the contract the client already reads.
    const autofilled: string[] = [];
    const fieldValues: Record<string, string> = {};

    const envelope = await this.prisma.$transaction(async (tx) => {
      const created = await tx.envelope.create({
        data: {
          organizationId: session.organizationId,
          templateVersionId: version.id,
          title: title.value,
          status: EnvelopeStatus.draft,
          fieldValues: { ...fieldValues, [EXPIRY_META_KEY]: expiry.value } as Prisma.InputJsonValue,
          subjectMembershipId,
          providerKey: this.signature.key,
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

      // `providerRef` equals the envelope id for the internal provider, and cannot be
      // known until the row exists.
      return tx.envelope.update({ where: { id: created.id }, data: { providerRef: created.id } });
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
      autofilled,
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
          fieldValues: { ...values, [EXPIRY_META_KEY]: expiresInDays } as Prisma.InputJsonValue,
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
  async send(session: SessionPayload, id: string, req: Request) {
    const envelope = await this.load(session, id);
    this.assertDraft(envelope);

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
      select: { firstName: true, lastName: true },
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Requirement 12 — concurrent sends resolve to exactly one winner. Prisma has no
        // lock helper, so the lock is raw SQL on the same connection the transaction
        // holds; every other send blocks here and then loses the status check below.
        await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${envelope.id} FOR UPDATE`;

        const fresh = await tx.envelope.findUniqueOrThrow({
          where: { id: envelope.id },
          include: { signers: { orderBy: { order: 'asc' } } },
        });
        if (fresh.status !== EnvelopeStatus.draft) throw this.notDraft();

        const version = envelope.templateVersion;
        const fields = readFields(version.fieldsSnapshot);
        const roles = readSignerRoles(version.signerRoles);
        const values = readFieldValues(fresh.fieldValues);

        // Requirement 7 — every required sender-owned field. Signer-owned ones are left
        // for the signing page and are not checked here.
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

        // Requirement 8 — both signers need a name and a valid email.
        const incomplete = fresh.signers.some(
          (s) => !validateSignerName(s.name).valid || !validateSignerEmail(s.email).valid,
        );
        if (incomplete || fresh.signers.length === 0) {
          throw new BadRequestException({
            error: 'incomplete_signers',
            message: ENVELOPE_MESSAGES.send.incompleteSigners,
          });
        }

        const renderedHtml = renderEnvelopeDocument({
          title: fresh.title,
          bodyHtml: version.bodyHtml,
          values,
          signers: fresh.signers.map((s) => ({
            roleLabel: roles.find((r) => r.key === s.roleKey)?.label ?? s.roleKey,
            name: s.name,
            order: s.order,
          })),
        });
        const documentHash = sha256HexOfString(renderedHtml);

        const now = new Date();
        const expiresAt = new Date(
          now.getTime() + readExpiryDays(fresh.fieldValues) * 24 * 60 * 60 * 1000,
        );

        // Requirement 14 — only the first signer gets a link. The second signer's token
        // does not exist yet, so a leak of the mailbox cannot produce one.
        const first = fresh.signers[0];
        const invitation = await this.signature.issueInvitation({
          envelopeId: fresh.id,
          signerId: first.id,
          signerName: first.name,
          signerEmail: first.email,
        });

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

        await tx.envelope.update({
          where: { id: fresh.id },
          data: {
            status: EnvelopeStatus.sent,
            renderedHtml,
            documentHash,
            sentAt: now,
            expiresAt,
          },
        });

        // Requirement 10 writes both events here. `created` carries the envelope's real
        // creation time rather than now, so the trail does not claim the document sprang
        // into existence at the moment it was sent.
        await this.events.record(tx, {
          envelopeId: fresh.id,
          type: 'created',
          occurredAt: fresh.createdAt,
          actor: { accountId: fresh.createdByAccountId },
          metadata: { templateVersionId: version.id, versionNumber: version.versionNumber },
        });
        await this.events.record(tx, {
          envelopeId: fresh.id,
          type: 'sent',
          documentHash,
          signerId: first.id,
          actor: {
            accountId: session.accountId,
            ipAddress: clientIp(req),
            userAgent: userAgentOf(req),
          },
          metadata: { notifiedSignerOrder: first.order },
        });

        // Inside the transaction on purpose (requirement 11). A rejection here throws,
        // and everything above — the freeze, the token, the events — goes with it.
        try {
          await this.mail.sendSigningInvitation({
            to: first.email,
            recipientName: first.name,
            envelopeTitle: fresh.title,
            organizationName: envelope.organization.name,
            senderName: `${account.firstName} ${account.lastName}`.trim(),
            signingUrl: invitation.signingUrl,
            expiresAt,
          });
        } catch (error) {
          this.log.warn(`Invitation for envelope ${fresh.id} was rejected by the transport`);
          throw new MailDeliveryFailure(String(error));
        }

        await this.events.record(tx, {
          envelopeId: fresh.id,
          type: 'email_accepted',
          signerId: first.id,
          documentHash,
          actor: { email: first.email },
        });

        return {
          status: 'sent' as const,
          sentAt: now.toISOString(),
          expiresAt: expiresAt.toISOString(),
          documentHash,
          notifiedSignerId: first.id,
        };
      });

      return result;
    } catch (error) {
      if (error instanceof MailDeliveryFailure) {
        throw new BadGatewayException({
          error: 'mail_delivery_failed',
          message: ENVELOPE_MESSAGES.send.mailFailure,
        });
      }
      throw error;
    }
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

    const outcome = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Envelope" WHERE id = ${envelope.id} FOR UPDATE`;
      const fresh = await tx.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: true },
      });

      const status = effectiveStatus(fresh.status as EnvelopeStatusName, fresh.expiresAt);
      if (!canVoid(status)) {
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

    const invitation = await this.signature.issueInvitation({
      envelopeId: envelope.id,
      signerId: signer.id,
      signerName: signer.name,
      signerEmail: signer.email,
    });
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
      fields: fields.map((field) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
        options: field.options,
        maxLength: field.maxLength,
        filledBy: field.filledBy,
        value: values[field.key] ?? '',
        // Spec 03 owns the flag; today nothing is autofilled, so it is honestly false.
        autofilled: false,
      })),
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
      renderedHtml: envelope.renderedHtml,
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
    };
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

  private async resolveSubject(
    session: SessionPayload,
    membershipId: string | null | undefined,
  ): Promise<string | null> {
    if (!membershipId) return null;
    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, organizationId: session.organizationId },
      select: { id: true },
    });
    // A foreign membership id is a 404 for the same reason a foreign template is: the
    // caller may not learn that it exists elsewhere.
    if (!membership) throw new NotFoundException();
    return membership.id;
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

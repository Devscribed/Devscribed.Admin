import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  TEMPLATE_FIELD_TYPES,
  TEMPLATE_LIMITS,
  TEMPLATE_MESSAGES,
  clampMaxLength,
  hasCapability,
  parsePlaceholders,
  sanitizeTemplateHtml,
  validateAutofillSource,
  validateFieldKey,
  validateFieldLabel,
  validateFilledBy,
  validateSelectOptions,
  validateSignerRoles,
  validateTemplateDescription,
  validateTemplateName,
} from '@devscribed/validation';
import type { SignerRole, TemplateFieldType } from '@devscribed/validation';
import { Prisma, TemplateStatus } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import type {
  CreateTemplateDto,
  PreviewDto,
  SaveDraftDto,
  TemplateFieldDto,
} from './document-templates.dto';
import { renderPreview } from './template-preview.renderer';

/** A field as it is stored and as it is handed back — one shape, no drift. */
interface NormalizedField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  options: string[] | null;
  maxLength: number | null;
  filledBy: string;
  autofillSource: string | null;
  order: number;
}

@Injectable()
export class DocumentTemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- *
   * Reads
   * ---------------------------------------------------------------- */

  async list(session: SessionPayload, q?: string, status?: string) {
    const templates = await this.prisma.documentTemplate.findMany({
      where: {
        // Scoped by the session, never by the path parameter — `OrgScopeGuard` has
        // only established that the two agree.
        organizationId: session.organizationId,
        ...(q?.trim() ? { name: { contains: q.trim(), mode: 'insensitive' } } : {}),
        ...(this.asStatus(status) ? { status: this.asStatus(status)! } : {}),
      },
      include: { versions: { select: { versionNumber: true, publishedAt: true, updatedAt: true } } },
      orderBy: { createdAt: 'desc' },
    });

    return {
      templates: await Promise.all(
        templates.map(async (template) => {
          const current = template.versions.find((v) => v.publishedAt !== null && v.publishedAt);
          const currentNumber = template.currentVersionId
            ? (
                await this.prisma.documentTemplateVersion.findUnique({
                  where: { id: template.currentVersionId },
                  select: { versionNumber: true },
                })
              )?.versionNumber ?? null
            : null;

          return {
            id: template.id,
            name: template.name,
            description: template.description,
            status: template.status,
            currentVersionNumber: currentNumber ?? (current ? current.versionNumber : null),
            hasOpenDraft: template.versions.some((v) => v.publishedAt === null),
            updatedAt: this.lastTouched(template.updatedAt, template.versions).toISOString(),
            envelopeCount: await this.countEnvelopesFor(template.id),
          };
        }),
      ),
      canManage: await this.canManage(session),
    };
  }

  async get(session: SessionPayload, id: string) {
    const template = await this.load(session, id);

    const draft = template.versions.find((v) => v.publishedAt === null) ?? null;
    const current = template.versions.find((v) => v.id === template.currentVersionId) ?? null;
    // Validation is advisory on read, so it describes whatever the author is looking
    // at: the open draft when there is one, otherwise the frozen current version.
    const inspected = draft ?? current;

    return {
      id: template.id,
      name: template.name,
      description: template.description,
      status: template.status,
      // The spec's example shows only id/versionNumber/publishedAt here, but a
      // published template with no open draft has nothing else to render — the editor
      // would show an empty read-only body. The content is additive and frozen, so
      // sending it costs nothing and no client that ignores it can break.
      currentVersion: current
        ? {
            id: current.id,
            versionNumber: current.versionNumber,
            publishedAt: current.publishedAt?.toISOString() ?? null,
            bodyHtml: current.bodyHtml,
            signerRoles: this.readSignerRoles(current.signerRoles),
            fields: current.fields.map((f) => this.presentField(f)),
          }
        : null,
      draftVersion: draft
        ? {
            id: draft.id,
            versionNumber: draft.versionNumber,
            rowVersion: draft.rowVersion,
            bodyHtml: draft.bodyHtml,
            signerRoles: this.readSignerRoles(draft.signerRoles),
            fields: draft.fields.map((f) => this.presentField(f)),
          }
        : null,
      validation: inspected
        ? this.advisoryValidation(
            inspected.bodyHtml,
            inspected.fields.map((f) => f.key),
          )
        : { unknownPlaceholders: [], unusedFields: [] },
      canManage: await this.canManage(session),
      canDelete: (await this.countEnvelopesFor(template.id)) === 0,
    };
  }

  async preview(session: SessionPayload, id: string, dto: PreviewDto) {
    const template = await this.load(session, id);

    const version = dto?.versionId
      ? template.versions.find((v) => v.id === dto.versionId)
      : (template.versions.find((v) => v.publishedAt === null) ??
        template.versions.find((v) => v.id === template.currentVersionId));

    // An unknown or foreign version id is a 404 for the same reason a foreign template
    // is: the caller may not learn that it exists elsewhere.
    if (!version) throw new NotFoundException();

    return {
      html: renderPreview(
        version.bodyHtml,
        version.fields.map((f) => ({ key: f.key, label: f.label })),
        this.readSignerRoles(version.signerRoles),
      ),
    };
  }

  /* ---------------------------------------------------------------- *
   * Writes
   * ---------------------------------------------------------------- */

  async create(session: SessionPayload, dto: CreateTemplateDto) {
    // Server-side re-validation: the client's checks are a convenience, not a gate.
    const errors: Record<string, string> = {};
    const name = validateTemplateName(dto?.name ?? '');
    if (!name.valid) errors.name = name.error;
    const description = validateTemplateDescription(dto?.description);
    if (!description.valid) errors.description = description.error;
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: errors[Object.keys(errors)[0]], errors });
    }

    const trimmedName = name.valid ? name.value : '';
    const trimmedDescription = description.valid && description.value ? description.value : null;

    const duplicate = await this.prisma.documentTemplate.findFirst({
      where: {
        organizationId: session.organizationId,
        name: { equals: trimmedName, mode: 'insensitive' },
      },
      select: { id: true },
    });
    if (duplicate) throw this.duplicateName();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const template = await tx.documentTemplate.create({
          data: {
            organizationId: session.organizationId,
            name: trimmedName,
            description: trimmedDescription,
            status: TemplateStatus.draft,
            createdByAccountId: session.accountId,
          },
        });

        // Requirement 1: version 1 exists from the start, in draft, with an empty body.
        const version = await tx.documentTemplateVersion.create({
          data: {
            templateId: template.id,
            versionNumber: 1,
            bodyHtml: '',
            signerRoles: [],
            createdByAccountId: session.accountId,
          },
        });

        return { id: template.id, versionId: version.id, versionNumber: version.versionNumber };
      });
    } catch (error) {
      // Lost the race between the check above and the insert — the `lower(name)` unique
      // index is the real guard, exactly as the email index is in signup.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.duplicateName();
      }
      throw error;
    }
  }

  async saveDraft(session: SessionPayload, id: string, dto: SaveDraftDto) {
    const template = await this.load(session, id);
    if (template.status === TemplateStatus.archived) {
      throw new ConflictException({
        error: 'template_archived',
        message: TEMPLATE_MESSAGES.generic.archived,
      });
    }

    const existingDraft = template.versions.find((v) => v.publishedAt === null) ?? null;
    // The base for a clone is the current version when there is one, otherwise the
    // highest-numbered version — a template can only reach here with at least one.
    const base =
      template.versions.find((v) => v.id === template.currentVersionId) ??
      [...template.versions].sort((a, b) => b.versionNumber - a.versionNumber)[0];

    const bodyProvided = typeof dto?.bodyHtml === 'string';
    const rawBody = bodyProvided ? (dto.bodyHtml as string) : (existingDraft ?? base).bodyHtml;

    // Measured on the RAW body, before sanitization: the limit protects the request and
    // the store, and sanitizing 50 MB first to discover it was too large is the work the
    // limit exists to avoid.
    if (Buffer.byteLength(rawBody, 'utf8') > TEMPLATE_LIMITS.bodyMaxBytes) {
      throw new BadRequestException({
        error: 'body_too_large',
        message: TEMPLATE_MESSAGES.body.tooLarge,
      });
    }

    const parsed = parsePlaceholders(rawBody);
    if (!parsed.ok) {
      throw new BadRequestException({
        error: 'malformed_placeholder',
        offset: parsed.offset,
        message: parsed.message,
      });
    }

    // Signer roles are validated leniently on save and strictly on publish: an author
    // half-way through the Signers tab legitimately has one role, and refusing to save
    // that would lose their work (the strict count is FR-29, enforced at publish).
    const signerRoles =
      dto?.signerRoles === undefined
        ? this.readSignerRoles((existingDraft ?? base).signerRoles)
        : this.readSignerRoles(dto.signerRoles);
    const roleKeys = signerRoles.map((role) => role.key);

    const fields =
      dto?.fields === undefined
        ? (existingDraft ?? base).fields.map((f) => this.presentField(f))
        : this.normalizeFields(dto.fields, roleKeys);

    const sanitized = sanitizeTemplateHtml(rawBody);

    const applied = {
      bodyHtml: sanitized.html,
      signerRoles: signerRoles as unknown as Prisma.InputJsonValue,
    };

    const saved = await this.prisma.$transaction(async (tx) => {
      if (existingDraft) {
        // Prisma reads `undefined` in a WHERE clause as "no filter", so an omitted
        // rowVersion would silently disable the lock rather than fail it. A save
        // against an existing draft must carry one.
        if (!Number.isInteger(dto?.rowVersion)) throw this.staleVersion();

        // Conditional update rather than read-then-write: the `rowVersion` predicate
        // travels in the WHERE clause, so two concurrent saves cannot both match and
        // the loser's row is left untouched (TC-01-INT-06). `publishedAt: null` is the
        // second lock — a published row can never be the target of a draft save, even
        // if one were published between the read above and this statement.
        const result = await tx.documentTemplateVersion.updateMany({
          where: { id: existingDraft.id, publishedAt: null, rowVersion: dto?.rowVersion },
          data: { ...applied, rowVersion: { increment: 1 } },
        });
        if (result.count === 0) throw this.staleVersion();

        await this.writeFields(tx, existingDraft.id, fields);
        return tx.documentTemplateVersion.findUniqueOrThrow({ where: { id: existingDraft.id } });
      }

      // No open draft: clone the published version into version max+1 and apply the
      // payload to *that* row (FR-7). The published row is not read for update and not
      // written at all, which is what makes TC-01-INT-05 hold whatever `versionId` the
      // caller crafted into the request.
      const highest = await tx.documentTemplateVersion.aggregate({
        where: { templateId: template.id },
        _max: { versionNumber: true },
      });

      const draft = await tx.documentTemplateVersion.create({
        data: {
          templateId: template.id,
          versionNumber: (highest._max.versionNumber ?? 0) + 1,
          createdByAccountId: session.accountId,
          ...applied,
        },
      });

      await this.writeFields(tx, draft.id, fields);
      return draft;
    }).catch((error) => {
      // Two first-edits raced; the (templateId, versionNumber) unique index picked a
      // winner. The loser is told what is true — their view of the template is stale.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.staleVersion();
      }
      throw error;
    });

    return {
      versionId: saved.id,
      versionNumber: saved.versionNumber,
      rowVersion: saved.rowVersion,
      bodyHtml: saved.bodyHtml,
      sanitized: true,
      removedElements: sanitized.removedElements,
      validation: this.advisoryValidation(
        saved.bodyHtml,
        fields.map((f) => f.key),
      ),
    };
  }

  async publish(session: SessionPayload, id: string) {
    const template = await this.load(session, id);
    if (template.status === TemplateStatus.archived) {
      throw new ConflictException({
        error: 'template_archived',
        message: TEMPLATE_MESSAGES.generic.archived,
      });
    }

    const draft = template.versions.find((v) => v.publishedAt === null);
    if (!draft) {
      throw new ConflictException({
        error: 'no_draft',
        message: TEMPLATE_MESSAGES.publish.nothingToPublish,
      });
    }

    if (draft.bodyHtml.trim().length === 0) {
      throw new BadRequestException({ error: 'empty_body', message: TEMPLATE_MESSAGES.body.empty });
    }

    const parsed = parsePlaceholders(draft.bodyHtml);
    if (!parsed.ok) {
      throw new BadRequestException({
        error: 'malformed_placeholder',
        offset: parsed.offset,
        message: parsed.message,
      });
    }

    const keys = draft.fields.map((f) => f.key);
    const unknown = parsed.keys.filter((key) => !keys.includes(key));
    if (unknown.length > 0) {
      throw new BadRequestException({
        error: 'unknown_placeholders',
        keys: unknown,
        message: TEMPLATE_MESSAGES.body.unknownPlaceholders(unknown),
      });
    }

    const roles = validateSignerRoles(draft.signerRoles);
    if (!roles.valid) {
      throw new BadRequestException({
        error: 'invalid_signer_roles',
        message: TEMPLATE_MESSAGES.signer.invalidCount,
      });
    }

    // FR-30: a role rename can strand a field that was pointing at the old key. The
    // draft save could not have caught it — the rename happened afterwards.
    const roleKeys = roles.value.map((role) => role.key);
    const stranded = draft.fields
      .map((f) => validateFilledBy(f.filledBy, roleKeys))
      .flatMap((result) => (!result.valid && result.unknownRoleKey ? [result.unknownRoleKey] : []));
    if (stranded.length > 0) {
      throw new BadRequestException({
        error: 'unknown_signer_role',
        keys: [...new Set(stranded)],
        message: TEMPLATE_MESSAGES.signer.unknownRole(stranded[0]),
      });
    }

    const ordered = [...draft.fields]
      .sort((a, b) => a.order - b.order)
      .map((f) => this.presentField(f));

    // Freezing the version and moving the pointer are one fact, so they are one
    // transaction: a template can never be `published` while pointing at nothing.
    const published = await this.prisma.$transaction(async (tx) => {
      const result = await tx.documentTemplateVersion.updateMany({
        where: { id: draft.id, publishedAt: null },
        data: {
          publishedAt: new Date(),
          fieldsSnapshot: ordered as unknown as Prisma.InputJsonValue,
        },
      });
      // Someone published this same draft while we were validating it.
      if (result.count === 0) throw this.staleVersion();

      await tx.documentTemplate.update({
        where: { id: template.id },
        data: { currentVersionId: draft.id, status: TemplateStatus.published },
      });

      return tx.documentTemplateVersion.findUniqueOrThrow({ where: { id: draft.id } });
    });

    return {
      versionId: published.id,
      versionNumber: published.versionNumber,
      publishedAt: published.publishedAt!.toISOString(),
    };
  }

  async archive(session: SessionPayload, id: string) {
    const template = await this.load(session, id);
    if (template.status === TemplateStatus.archived) {
      throw new ConflictException({
        error: 'already_archived',
        message: TEMPLATE_MESSAGES.generic.archived,
      });
    }

    // One-way in this release (FR-5): there is no unarchive endpoint to pair with it.
    await this.prisma.documentTemplate.update({
      where: { id: template.id },
      data: {
        status: TemplateStatus.archived,
        archivedAt: new Date(),
        archivedByAccountId: session.accountId,
      },
    });

    return { status: 'archived' };
  }

  async remove(session: SessionPayload, id: string): Promise<void> {
    const template = await this.load(session, id);

    const envelopeCount = await this.countEnvelopesFor(template.id);
    if (envelopeCount > 0) {
      throw new ConflictException({
        error: 'template_in_use',
        envelopeCount,
        message: TEMPLATE_MESSAGES.generic.deleteBlocked(envelopeCount),
      });
    }

    // `currentVersionId` is a real foreign key, so it must let go before the versions
    // it points at can cascade away.
    await this.prisma.$transaction(async (tx) => {
      await tx.documentTemplate.update({
        where: { id: template.id },
        data: { currentVersionId: null },
      });
      await tx.documentTemplate.delete({ where: { id: template.id } });
    });
  }

  /* ---------------------------------------------------------------- *
   * Internals
   * ---------------------------------------------------------------- */

  /**
   * How many documents any version of this template has ever backed — the whole basis
   * of requirement 6, which permits a hard delete only for a template nobody has used.
   *
   * It counts across every version, not just the current one: an envelope pins the
   * version it was created from, so deleting the template would orphan a document bound
   * to a version published two edits ago just as surely as one bound to today's.
   * `Envelope.templateVersionId` is `Restrict` in the schema, so this check is the
   * friendly half of a guarantee the database enforces regardless.
   */
  private async countEnvelopesFor(templateId: string): Promise<number> {
    return this.prisma.envelope.count({
      where: { templateVersion: { templateId } },
    });
  }

  /**
   * The single scoped read. Scoping by `session.organizationId` here — not by the path
   * parameter, and not by id alone — is what makes a foreign template a 404 rather than
   * a 403 even when `:orgId` is the caller's own (TC-01-INT-12).
   */
  private async load(session: SessionPayload, id: string) {
    const template = await this.prisma.documentTemplate.findFirst({
      where: { id, organizationId: session.organizationId },
      include: { versions: { include: { fields: { orderBy: { order: 'asc' } } } } },
    });
    if (!template) throw new NotFoundException();
    return template;
  }

  /** The caller's live role, re-read for the same reason `CapabilityGuard` re-reads it. */
  private async canManage(session: SessionPayload): Promise<boolean> {
    const membership = await this.prisma.membership.findFirst({
      where: {
        accountId: session.accountId,
        organizationId: session.organizationId,
        status: 'active',
      },
      select: { role: true },
    });
    return hasCapability(membership?.role, 'ManageDocumentTemplates');
  }

  /**
   * Turns the wire's field list into the stored shape, rejecting with the spec's error
   * for the first rule that fails. The grouped errors (`reserved_key`,
   * `duplicate_field_key`, `unknown_signer_role`) are collected across every field
   * before throwing, because the editor lists them all at once.
   */
  private normalizeFields(input: TemplateFieldDto[], roleKeys: string[]): NormalizedField[] {
    if (!Array.isArray(input)) return [];

    const errors: Record<string, string> = {};
    const reserved: string[] = [];
    const duplicates: string[] = [];
    const unknownRoles: string[] = [];
    const seen = new Set<string>();
    const fields: NormalizedField[] = [];

    input.forEach((raw, index) => {
      const at = (property: string) => `fields[${index}].${property}`;

      const key = validateFieldKey(raw?.key ?? '');
      if (!key.valid) {
        // A reserved key is well-formed, so the two cases never collide.
        if (key.error === TEMPLATE_MESSAGES.fieldKey.reserved) reserved.push((raw?.key ?? '').trim());
        else errors[at('key')] = key.error;
      } else if (seen.has(key.value)) {
        duplicates.push(key.value);
      } else {
        seen.add(key.value);
      }

      const label = validateFieldLabel(raw?.label ?? '');
      if (!label.valid) errors[at('label')] = label.error;

      const type = raw?.type as TemplateFieldType;
      if (!TEMPLATE_FIELD_TYPES.includes(type)) errors[at('type')] = TEMPLATE_MESSAGES.fieldType.required;

      let options: string[] | null = null;
      if (type === 'select') {
        const parsed = validateSelectOptions(raw?.options);
        if (!parsed.valid) errors[at('options')] = parsed.error;
        else options = parsed.value;
      }

      const filledBy = validateFilledBy(raw?.filledBy ?? 'sender', roleKeys);
      if (!filledBy.valid) {
        if (filledBy.unknownRoleKey) unknownRoles.push(filledBy.unknownRoleKey);
        else errors[at('filledBy')] = filledBy.error;
      }

      /* ------------------------------------------------------------------ *
       * Spec 03, validation rule 9: an autofill binding must name a catalogue key and
       * be type-compatible with the field.
       *
       * Checked at *save* time and nowhere else. By the time an envelope resolves the
       * binding it is stored data, and requirement 7 forbids failing a creation over it
       * — `resolveAutofill` skips a stale binding silently. This is the one moment at
       * which a mistake can still be corrected, so it is the one moment that refuses.
       *
       * Only when the type is known: a field whose type is already invalid would
       * otherwise be told its perfectly good source "cannot fill an undefined field".
       * ------------------------------------------------------------------ */
      if (TEMPLATE_FIELD_TYPES.includes(type)) {
        const source = validateAutofillSource(raw?.autofillSource, type);
        if (!source.valid) errors[at('autofillSource')] = source.error;
      }

      if (key.valid && label.valid && TEMPLATE_FIELD_TYPES.includes(type)) {
        fields.push({
          key: key.value,
          label: label.value,
          type,
          required: raw?.required === true,
          options,
          maxLength: clampMaxLength(type, raw?.maxLength),
          filledBy: filledBy.valid ? filledBy.value : 'sender',
          autofillSource:
            typeof raw?.autofillSource === 'string' && raw.autofillSource.trim()
              ? raw.autofillSource.trim()
              : null,
          order: Number.isFinite(raw?.order) ? Number(raw!.order) : index + 1,
        });
      }
    });

    if (reserved.length > 0) {
      throw new BadRequestException({
        error: 'reserved_key',
        keys: [...new Set(reserved)],
        message: TEMPLATE_MESSAGES.fieldKey.reserved,
      });
    }
    if (duplicates.length > 0) {
      throw new BadRequestException({
        error: 'duplicate_field_key',
        keys: [...new Set(duplicates)],
        message: TEMPLATE_MESSAGES.fieldKey.duplicate,
      });
    }
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ message: errors[Object.keys(errors)[0]], errors });
    }
    if (unknownRoles.length > 0) {
      throw new BadRequestException({
        error: 'unknown_signer_role',
        keys: [...new Set(unknownRoles)],
        message: TEMPLATE_MESSAGES.signer.unknownRole(unknownRoles[0]),
      });
    }

    return fields;
  }

  /**
   * Fields are a value collection owned by their version, not entities with a life of
   * their own, so a save replaces the set wholesale. Reconciling row by row would buy
   * stable ids at the cost of a merge nobody has asked for — reordering alone would
   * make it the harder half of this service.
   */
  private async writeFields(
    tx: Prisma.TransactionClient,
    versionId: string,
    fields: NormalizedField[],
  ): Promise<void> {
    await tx.templateField.deleteMany({ where: { templateVersionId: versionId } });
    for (const field of fields) {
      await tx.templateField.create({
        data: {
          templateVersionId: versionId,
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          options: (field.options ?? Prisma.JsonNull) as Prisma.InputJsonValue,
          maxLength: field.maxLength,
          filledBy: field.filledBy,
          autofillSource: field.autofillSource,
          order: field.order,
        },
      });
    }
  }

  /** FR-15 and FR-16 as advice rather than as a gate; publish is where they bite. */
  private advisoryValidation(bodyHtml: string, fieldKeys: string[]) {
    const parsed = parsePlaceholders(bodyHtml);
    const used = parsed.ok ? parsed.keys : [];
    return {
      unknownPlaceholders: used.filter((key) => !fieldKeys.includes(key)),
      unusedFields: fieldKeys.filter((key) => !used.includes(key)),
    };
  }

  private presentField(field: {
    id?: string;
    key: string;
    label: string;
    type: TemplateFieldType;
    required: boolean;
    options: unknown;
    maxLength: number | null;
    filledBy: string;
    autofillSource: string | null;
    order: number;
  }): NormalizedField & { id?: string } {
    return {
      ...(field.id ? { id: field.id } : {}),
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      options: Array.isArray(field.options) ? (field.options as string[]) : null,
      maxLength: field.maxLength,
      filledBy: field.filledBy,
      autofillSource: field.autofillSource,
      order: field.order,
    };
  }

  /** JSON columns are a claim about shape, so every read goes through this. */
  private readSignerRoles(value: unknown): SignerRole[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
      if (typeof entry !== 'object' || entry === null) return [];
      const role = entry as Partial<SignerRole>;
      if (typeof role.key !== 'string' || typeof role.label !== 'string') return [];
      return [{ key: role.key, label: role.label, order: Number(role.order) || 1 }];
    });
  }

  private asStatus(status?: string): TemplateStatus | null {
    return status && status in TemplateStatus ? (status as TemplateStatus) : null;
  }

  /**
   * The list column reads "Updated", and an author who edits a draft has updated the
   * template as far as they are concerned — even though the write landed on a version
   * row and left `DocumentTemplate.updatedAt` alone.
   */
  private lastTouched(templateUpdatedAt: Date, versions: { updatedAt: Date }[]): Date {
    return versions.reduce(
      (latest, version) => (version.updatedAt > latest ? version.updatedAt : latest),
      templateUpdatedAt,
    );
  }

  private duplicateName(): ConflictException {
    return new ConflictException({
      error: 'duplicate_name',
      message: TEMPLATE_MESSAGES.name.duplicate,
    });
  }

  private staleVersion(): ConflictException {
    return new ConflictException({
      error: 'stale_version',
      message: TEMPLATE_MESSAGES.generic.stale,
    });
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REQUEST_TOPIC_MESSAGES,
  can,
  clampSortOrder,
  compareRequestTopics,
  normalizeRole,
  normalizeTopicName,
  parseTopicAudienceQuery,
  parseTopicStatusQuery,
  validateTopicAudience,
  validateTopicName,
  validateTopicSortOrder,
  validateTopicType,
  type NormalizedRole,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import type {
  CreateRequestTopicBody,
  RequestTopicDto,
  RequestTopicListDto,
  RequestTopicResponseDto,
  UpdateRequestTopicBody,
} from './request-topics.dto';

/** The caller, resolved from the session — never from anything in the URL or the body. */
interface Curator {
  membershipId: string;
  accountId: string;
  organizationId: string;
  /** Normalized: the legacy `member` column value is `user` here, as everywhere. */
  role: NormalizedRole;
}

/** The columns the state-machine guards are evaluated against, read under the row lock. */
interface LockedTopic {
  id: string;
  status: string;
  audience: string;
  type: string;
  name: string;
  sortOrder: number;
}

/** The gap a new topic lands past the bottom of its audience by. */
const SORT_ORDER_STEP = 10;

/**
 * Requests spec 02 — the organization's curated catalogue of request topics.
 *
 * **Scope.** `organizationId` is a required argument with no default on every method and
 * is always the session's, never the path's; the path `:orgId` is checked by
 * `OrgScopeGuard` and is never a selector. A topic of another organization answers a bare
 * 404, identical to one that never existed (REQ-02-001).
 *
 * **Capability.** `manage-request-topics` is checked here rather than by
 * `CapabilityGuard`, because the refusal must carry
 * `REQUEST_TOPIC_MESSAGES.manageForbidden` and the guard's message is fixed and never
 * names the resource. The answer is 403, deliberately not the 404 `ClientsService` gives
 * a missing capability: this spec names the message its refusal carries (REQ-02-007).
 *
 * **Writes.** Every write to an existing row happens inside a transaction that first
 * re-reads that row with `FOR UPDATE` and decides against *that* read (State Machine
 * invariants 3 and 5). A status loaded before the transaction is already stale by the
 * time it is tested, so two concurrent archives cannot both succeed: the loser acquires
 * the lock afterwards, re-reads `archived`, and answers 409.
 */
@Injectable()
export class RequestTopicsService {
  constructor(private readonly prisma: PrismaService) {}

  /* ---------------------------------------------------------------- *
   * Read
   * ---------------------------------------------------------------- */

  /**
   * `GET /organizations/:orgId/request-topics`. Open to every active member, a `viewer`
   * included (REQ-02-008, edge case 14): reading the words is not a privilege.
   *
   * An unknown `audience` or `status` is refused rather than silently defaulted, so a
   * typo in a query string cannot look like an empty catalogue (REQ-02-002).
   */
  async listTopics(
    session: SessionPayload,
    organizationId: string,
    query: { audience?: unknown; status?: unknown },
  ): Promise<RequestTopicListDto> {
    await this.requireCaller(session, organizationId);

    const audience = parseTopicAudienceQuery(query.audience);
    const status = parseTopicStatusQuery(query.status);

    const fields: Record<string, string> = {};
    if (audience === null) fields.audience = REQUEST_TOPIC_MESSAGES.audienceUnknown;
    if (status === null) fields.status = REQUEST_TOPIC_MESSAGES.statusUnknown;
    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ error: 'validation_error', fields });
    }

    const rows = await this.prisma.requestTopic.findMany({
      where: {
        organizationId,
        ...(audience === 'any' || audience === null ? {} : { audience }),
        ...(status === 'all' || status === null ? {} : { status }),
      },
    });

    // Ordered in the process rather than in SQL: the tiebreak is case-insensitive on the
    // name (REQ-02-009), which Postgres's default collation does not give, and one
    // organization's catalogue is a handful of rows.
    return { topics: rows.sort(compareRequestTopics).map((row) => this.toDto(row)) };
  }

  /* ---------------------------------------------------------------- *
   * Create
   * ---------------------------------------------------------------- */

  /**
   * `POST …/request-topics`. `sortOrder` is optional and defaults to the highest stored
   * value in that audience plus ten, so a new topic lands at the bottom of its list
   * without the caller computing anything.
   *
   * Every row of the audience counts toward that highest value, archived ones included:
   * counting only the active ones would let a topic created today collide with one that
   * is later restored. The computed value is clamped to the bound of validation rule 6,
   * which is the only thing that can happen when the bottom of the list is already there.
   */
  async createTopic(
    session: SessionPayload,
    organizationId: string,
    body: CreateRequestTopicBody,
  ): Promise<RequestTopicResponseDto> {
    const caller = await this.requireCurator(session, organizationId);

    const fields: Record<string, string> = {};

    const audience = validateTopicAudience(body.audience);
    if (!audience.valid) fields.audience = audience.error;

    const type = validateTopicType(body.type);
    if (!type.valid) fields.type = type.error;

    const name = validateTopicName(body.name);
    if (!name.valid) fields.name = name.error;

    const sortOrder = validateTopicSortOrder(body.sortOrder);
    if (!sortOrder.valid) fields.sortOrder = sortOrder.error;

    if (Object.keys(fields).length > 0) {
      throw new BadRequestException({ error: 'validation_error', fields });
    }

    const audienceValue = (audience as { valid: true; value: 'staff' | 'client' }).value;
    const typeValue = (type as { valid: true; value: 'access' | 'question' }).value;
    const nameValue = (name as { valid: true; value: string }).value;
    const suppliedSortOrder = (sortOrder as { valid: true; value: number | null }).value;

    await this.refuseDuplicateName(organizationId, audienceValue, nameValue, null);

    const position =
      suppliedSortOrder ?? (await this.defaultSortOrder(organizationId, audienceValue));

    try {
      const created = await this.prisma.requestTopic.create({
        data: {
          organizationId,
          audience: audienceValue,
          type: typeValue,
          name: nameValue,
          sortOrder: position,
          // Invariant 1 — `active` is the only status a topic may be created in.
          status: 'active',
          createdByAccountId: caller.accountId,
        },
      });
      return { topic: this.toDto(created) };
    } catch (error) {
      // The pre-check above lost a race; the functional unique index is the real guard
      // and its violation gets the same answer the pre-check would have given.
      if (this.isUniqueViolation(error)) throw this.duplicateName();
      throw error;
    }
  }

  /* ---------------------------------------------------------------- *
   * Rename and reorder
   * ---------------------------------------------------------------- */

  /**
   * `PATCH …/request-topics/{topicId}` — the rename and the reorder, in one route.
   *
   * `audience` and `type` are accepted only when each equals the stored value; a
   * different one is refused rather than ignored (REQ-02-004), and refused *before* the
   * name-uniqueness check, so a call carrying both a changed audience and a name another
   * topic already holds answers `audienceImmutable` and writes nothing.
   *
   * An archived topic may still be renamed and reordered here. The screen draws no such
   * control and offers restoring instead; this is the allowance for a caller holding the
   * topic id (State Machine, archived/rename).
   */
  async updateTopic(
    session: SessionPayload,
    organizationId: string,
    topicId: string,
    body: UpdateRequestTopicBody,
  ): Promise<RequestTopicResponseDto> {
    await this.requireCurator(session, organizationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      // Invariant 5 puts rename and reorder under the row lock too, not only the two
      // writes the status guard needs: every writer of an existing row takes it.
      const locked = await this.lockTopic(tx, organizationId, topicId);

      const fields: Record<string, string> = {};

      if (Object.prototype.hasOwnProperty.call(body, 'audience')) {
        if (body.audience !== locked.audience) {
          fields.audience = REQUEST_TOPIC_MESSAGES.audienceImmutable;
        }
      }
      if (Object.prototype.hasOwnProperty.call(body, 'type')) {
        if (body.type !== locked.type) {
          fields.type = REQUEST_TOPIC_MESSAGES.typeImmutable;
        }
      }

      const renaming = Object.prototype.hasOwnProperty.call(body, 'name');
      const name = renaming ? validateTopicName(body.name) : null;
      if (name && !name.valid) fields.name = name.error;

      const reordering = Object.prototype.hasOwnProperty.call(body, 'sortOrder');
      const sortOrder = reordering ? validateTopicSortOrder(body.sortOrder) : null;
      if (sortOrder && !sortOrder.valid) fields.sortOrder = sortOrder.error;

      // Answered before the uniqueness check below, which is the whole point of the
      // ordering: a rename that also moves audiences writes nothing at all.
      if (Object.keys(fields).length > 0) {
        throw new BadRequestException({ error: 'validation_error', fields });
      }

      const data: Prisma.RequestTopicUpdateInput = {};

      if (name && name.valid) {
        await this.refuseDuplicateName(
          organizationId,
          locked.audience,
          name.value,
          locked.id,
          tx,
        );
        data.name = name.value;
      }
      if (sortOrder && sortOrder.valid && sortOrder.value !== null) {
        data.sortOrder = sortOrder.value;
      }

      try {
        return await tx.requestTopic.update({ where: { id: locked.id }, data });
      } catch (error) {
        if (this.isUniqueViolation(error)) throw this.duplicateName();
        throw error;
      }
    });

    return { topic: this.toDto(updated) };
  }

  /* ---------------------------------------------------------------- *
   * Archive and restore — the only removal there is (REQ-02-014)
   * ---------------------------------------------------------------- */

  /** `PATCH …/request-topics/{topicId}/archive`. No body. */
  async archiveTopic(
    session: SessionPayload,
    organizationId: string,
    topicId: string,
  ): Promise<RequestTopicResponseDto> {
    return this.setStatus(session, organizationId, topicId, 'archived');
  }

  /** `PATCH …/request-topics/{topicId}/restore`. No body. */
  async restoreTopic(
    session: SessionPayload,
    organizationId: string,
    topicId: string,
  ): Promise<RequestTopicResponseDto> {
    return this.setStatus(session, organizationId, topicId, 'active');
  }

  /**
   * The two status writes, which differ only in the value they move to and the audit
   * columns they set or clear.
   *
   * The guard is evaluated on the row the transaction locked, never on a copy loaded
   * earlier (invariant 3), so two concurrent archives produce one 200 and one 409
   * whichever arrived first — and the 409 leaves `archivedAt` exactly as the winner set
   * it (REQ-02-013, AC-13).
   */
  private async setStatus(
    session: SessionPayload,
    organizationId: string,
    topicId: string,
    target: 'active' | 'archived',
  ): Promise<RequestTopicResponseDto> {
    const caller = await this.requireCurator(session, organizationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockTopic(tx, organizationId, topicId);

      if (locked.status === target) {
        throw new ConflictException({
          error: 'conflict',
          message: REQUEST_TOPIC_MESSAGES.statusUnchanged,
        });
      }

      return tx.requestTopic.update({
        where: { id: locked.id },
        data:
          target === 'archived'
            ? {
                status: 'archived',
                archivedAt: new Date(),
                archivedByAccountId: caller.accountId,
              }
            : { status: 'active', archivedAt: null, archivedByAccountId: null },
      });
    });

    return { topic: this.toDto(updated) };
  }

  /* ---------------------------------------------------------------- *
   * Shared internals
   * ---------------------------------------------------------------- */

  /**
   * Re-read the row with `FOR UPDATE` inside the caller's transaction. Everything the
   * guards need comes from THIS read (invariant 3).
   *
   * Selected by id AND the session's organization, so a topic in another organization is
   * indistinguishable from one that does not exist (REQ-02-001, TC-02-INT-21).
   */
  private async lockTopic(
    tx: Prisma.TransactionClient,
    organizationId: string,
    topicId: string,
  ): Promise<LockedTopic> {
    const rows = await tx.$queryRaw<LockedTopic[]>`
      SELECT "id", "status", "audience", "type", "name", "sortOrder"
      FROM "RequestTopic"
      WHERE "id" = ${topicId} AND "organizationId" = ${organizationId}
      FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }

  /**
   * The bottom of an audience plus ten, clamped to the bound.
   *
   * Rows of every status count: if only the active ones did, a topic created while the
   * bottom of the list is archived would take that row's own value and collide with it
   * the moment somebody restored it.
   */
  private async defaultSortOrder(organizationId: string, audience: string): Promise<number> {
    const highest = await this.prisma.requestTopic.aggregate({
      where: { organizationId, audience },
      _max: { sortOrder: true },
    });
    const top = highest._max.sortOrder;
    return top === null ? 0 : clampSortOrder(top + SORT_ORDER_STEP);
  }

  /**
   * Rule 5 — one name per organization and audience, ignoring case (REQ-02-006).
   *
   * The rule the check is here to enforce: no two topics of one organization and audience
   * may hold names equal after trimming, whitespace-collapsing and case-folding. The
   * question this code asks: does any *other* row of that organization and audience hold
   * that folded name. Those are the same question because the incoming name has already
   * been normalized by `validateTopicName`, and because `excludeTopicId` removes the row
   * being renamed — a topic keeping its own name is not a duplicate of itself.
   *
   * This is a pre-check that produces a clean 409 for the ordinary case. The arbiter is
   * the functional unique index; a lost race surfaces as P2002 and gets the same answer.
   */
  private async refuseDuplicateName(
    organizationId: string,
    audience: string,
    name: string,
    excludeTopicId: string | null,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    const folded = normalizeTopicName(name).toLocaleLowerCase();
    const siblings = await client.requestTopic.findMany({
      where: { organizationId, audience },
      select: { id: true, name: true },
    });
    const clash = siblings.some(
      (row) =>
        row.id !== excludeTopicId && normalizeTopicName(row.name).toLocaleLowerCase() === folded,
    );
    if (clash) throw this.duplicateName();
  }

  private duplicateName(): ConflictException {
    return new ConflictException({
      error: 'conflict',
      message: REQUEST_TOPIC_MESSAGES.nameDuplicate,
    });
  }

  private isUniqueViolation(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  /**
   * The caller's own active membership, resolved from the session. `organizationId` is
   * passed in rather than read from the path so the scope key can never be defaulted.
   */
  private async requireCaller(
    session: SessionPayload,
    organizationId: string,
  ): Promise<Curator> {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: { id: true, role: true, status: true, organizationId: true, accountId: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.organizationId !== organizationId
    ) {
      throw new ForbiddenException();
    }
    return {
      membershipId: membership.id,
      accountId: membership.accountId,
      organizationId: membership.organizationId,
      // Read from the live membership row, never from a copy in the cookie, and through
      // `normalizeRole` so the legacy `member` value maps to `user`.
      role: normalizeRole(membership.role),
    };
  }

  /** `manage-request-topics`, or 403 carrying the message the spec names (REQ-02-007). */
  private async requireCurator(
    session: SessionPayload,
    organizationId: string,
  ): Promise<Curator> {
    const caller = await this.requireCaller(session, organizationId);
    if (!can(caller.role, 'manage-request-topics')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUEST_TOPIC_MESSAGES.manageForbidden,
      });
    }
    return caller;
  }

  /** The documented row shape, and nothing beyond it. */
  private toDto(row: {
    id: string;
    audience: string;
    type: string;
    name: string;
    sortOrder: number;
    status: string;
    createdAt: Date;
    updatedAt: Date;
  }): RequestTopicDto {
    return {
      id: row.id,
      audience: row.audience,
      type: row.type,
      name: row.name,
      sortOrder: row.sortOrder,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

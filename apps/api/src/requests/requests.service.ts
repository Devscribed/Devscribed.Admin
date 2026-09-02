import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  REQUEST_MESSAGES,
  can,
  canReadRequest,
  compareRequestRows,
  isTerminalRequestStatus,
  normalizeRole,
  parseRequestScope,
  parseRequestStatusQuery,
  parseRequestTypeQuery,
  todayInTimeZone,
  vacationStatusesFor,
  validateDeclineReason,
  validateNewRequest,
  validateRequestAssignee,
  validateRequestEdit,
  validateRequestMessageBody,
  type NormalizedRole,
  type RequestStatus,
} from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { RequestEventsService } from './request-events.service';
import type {
  RequestDetailDto,
  RequestMessageDto,
  RequestRowDto,
  RequestsListDto,
} from './requests.dto';
import {
  REQUEST_EVENT_INCLUDE,
  REQUEST_MESSAGE_INCLUDE,
  REQUEST_ROW_INCLUDE,
  displayNameOf,
  toRequestDetail,
  toRequestMessage,
  toRequestRow,
} from './requests.serializer';
import { VacationRequestFeedService } from './vacation-request-feed.service';

/** The caller, resolved from the session — never from anything in the URL or the body. */
interface Caller {
  membershipId: string;
  accountId: string;
  organizationId: string;
  /** Normalized: the legacy `member` column value is `user` here, as everywhere. */
  role: NormalizedRole;
  /** The raw column, for the helpers that normalize internally. */
  rawRole: string;
  timezone: string | null;
  displayName: string;
  isAdmin: boolean;
}

/** The columns the state-machine guards are evaluated against, read under the row lock. */
interface LockedRequest {
  id: string;
  status: string;
  requesterMembershipId: string;
  assigneeMembershipId: string | null;
  answeredAt: Date | null;
  resolvedAt: Date | null;
}

export type TransitionAction = 'answer' | 'grant' | 'decline' | 'cancel';

/**
 * The four transitions, as data. `from` is the set of statuses the move is legal in and
 * `actor` is the guard evaluated against the LOCKED row — which is what makes a repeated
 * call find a terminal status and answer 409 rather than writing twice (requirement 30).
 */
const TRANSITIONS: Record<
  TransitionAction,
  {
    to: RequestStatus;
    from: readonly string[];
    actor: (caller: Caller, row: LockedRequest) => boolean;
    forbiddenMessage: string;
  }
> = {
  answer: {
    to: 'answered',
    from: ['open'],
    // Requirement 23 — the addressee, or an admin acting for them.
    actor: (caller, row) => caller.isAdmin || row.assigneeMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToAnswer,
  },
  grant: {
    to: 'granted',
    from: ['open', 'answered'],
    // Requirement 24 — the requester or an admin, and NOBODY else: not the addressee,
    // not a manager who is not the requester. Only the person who needs the access
    // knows whether it works.
    actor: (caller, row) => caller.isAdmin || row.requesterMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToGrant,
  },
  decline: {
    to: 'declined',
    from: ['open', 'answered'],
    actor: (caller, row) => caller.isAdmin || row.assigneeMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToDecline,
  },
  cancel: {
    to: 'cancelled',
    from: ['open', 'answered'],
    actor: (caller, row) => caller.isAdmin || row.requesterMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToCancel,
  },
};

/**
 * Requests spec 01 — requests between members of an organization.
 *
 * Two rules shape every method below.
 *
 * **Scope.** `organizationId` is a required argument with no default and is always the
 * session's, never the path's; the path `:orgId` is checked by `OrgScopeGuard` and is
 * never a selector. A request in another organization, and a request in this one the
 * caller is not party to, both answer a bare 404 — identical to a request that does not
 * exist, so nothing about either is enumerable.
 *
 * **Writes.** Every write to a `Request` row happens inside a transaction that first
 * re-reads that row with `FOR UPDATE` and evaluates its guard against *that* read. A
 * status loaded before the transaction is already stale by the time it is tested, so two
 * concurrent grants cannot both succeed: the loser acquires the lock afterwards, re-reads
 * a terminal status, and answers 409. Idempotence by construction, not by a flag.
 */
@Injectable()
export class RequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: RequestEventsService,
    private readonly vacationFeed: VacationRequestFeedService,
  ) {}

  /* ---------------------------------------------------------------- *
   * Read path
   * ---------------------------------------------------------------- */

  /**
   * `GET /organizations/:orgId/requests` — the two sections composed into one response.
   * Open to every active member: the page-level `view-requests` gate of spec 10 is gone
   * and two inner gates replace it (the vacation section, and the `all` scope).
   */
  async listRequests(
    session: SessionPayload,
    organizationId: string,
    query: {
      scope?: unknown;
      status?: unknown;
      type?: unknown;
      projectId?: unknown;
      q?: unknown;
    },
  ): Promise<RequestsListDto> {
    const caller = await this.requireCaller(session, organizationId);

    const scope = parseRequestScope(query.scope);
    const status = parseRequestStatusQuery(query.status);
    const type = parseRequestTypeQuery(query.type);

    // An unknown value is a 400, never a silent fallback: the closed set is only a
    // contract if breaking it is observable (requirement 42). The field carries a code
    // rather than copy — an unknown value can only arrive from a hand-edited URL, never
    // from the rendered control, so there is no user-facing message to show.
    const queryFields: Record<string, string> = {};
    if (scope === null) queryFields.scope = 'unknown_value';
    if (status === null) queryFields.status = 'unknown_value';
    if (type === null) queryFields.type = 'unknown_value';
    if (scope === null || status === null || type === null) {
      throw new BadRequestException({ error: 'validation_error', fields: queryFields });
    }

    // Requirement 40 — the server is the gate; the absent control is a convenience.
    if (scope === 'all' && !can(caller.role, 'view-all-requests')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUEST_MESSAGES.scopeForbidden,
      });
    }

    const scopeWhere: Prisma.RequestWhereInput =
      scope === 'all'
        ? { organizationId }
        : {
            organizationId,
            OR: [
              { requesterMembershipId: caller.membershipId },
              { assigneeMembershipId: caller.membershipId },
            ],
          };

    // Both counters are computed BEFORE type/status/projectId/q are applied, and
    // neither is a count of the `requests` array. A badge that moved when someone
    // narrowed a filter would be reporting the view rather than the work.
    const [waitingOnMe, total] = await Promise.all([
      this.prisma.request.count({
        where: {
          organizationId,
          assigneeMembershipId: caller.membershipId,
          status: { in: ['open', 'answered'] },
        },
      }),
      this.prisma.request.count({ where: scopeWhere }),
    ]);

    const q = typeof query.q === 'string' ? query.q.trim() : '';
    const projectId =
      typeof query.projectId === 'string' && query.projectId.trim().length > 0
        ? query.projectId
        : null;

    // `type=vacation` is a choice of SECTION, not a filter over one array: vacation rows
    // are not `Request` rows in this release (requirement 41).
    const rows =
      type === 'vacation'
        ? []
        : await this.prisma.request.findMany({
            where: {
              ...scopeWhere,
              ...(status !== 'all' ? { status } : {}),
              ...(type === 'access' || type === 'question' ? { type } : {}),
              ...(projectId ? { projectId } : {}),
              ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
            },
            include: REQUEST_ROW_INCLUDE,
          });

    const today = todayInTimeZone(caller.timezone);
    const requests = rows.map((row) => toRequestRow(row, today)).sort(compareRequestRows);

    const result: RequestsListDto = { requests, counts: { waitingOnMe, total } };

    // The vacation section keeps its own capability (requirement 41): a `user` sees the
    // page and their own requests, and does not see anyone's vacation — the section is
    // absent entirely, not empty.
    if (can(caller.role, 'view-requests')) {
      // `status` filters both sections through requirement 42's fixed mapping, because
      // one control on one page must not mean two things. A `type` of `access` or
      // `question` selects no vacation row, and the section renders empty rather than
      // disappearing, for the same reason `answered` does.
      const statuses =
        type === 'access' || type === 'question' ? [] : vacationStatusesFor(status);
      result.vacation = await this.vacationFeed.listFeed(organizationId, statuses);
    }

    return result;
  }

  /** `GET …/requests/:requestId` — the row, the thread and the trail. */
  async getRequest(
    session: SessionPayload,
    organizationId: string,
    requestId: string,
  ): Promise<RequestDetailDto> {
    const caller = await this.requireCaller(session, organizationId);
    const row = await this.prisma.request.findFirst({
      where: { id: requestId, organizationId },
      include: REQUEST_ROW_INCLUDE,
    });
    if (!row) throw new NotFoundException();
    if (!canReadRequest(caller.rawRole, this.isParty(caller, row))) throw new NotFoundException();

    const [messages, events] = await Promise.all([
      this.prisma.requestMessage.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
        include: REQUEST_MESSAGE_INCLUDE,
      }),
      this.prisma.requestEvent.findMany({
        where: { requestId },
        orderBy: { createdAt: 'asc' },
        include: REQUEST_EVENT_INCLUDE,
      }),
    ]);

    return toRequestDetail(row, messages, events, todayInTimeZone(caller.timezone));
  }

  /* ---------------------------------------------------------------- *
   * Create
   * ---------------------------------------------------------------- */

  /**
   * `POST …/requests`. The number is allocated by re-reading the organization row with
   * `FOR UPDATE` inside the creating transaction, exactly as `Project.nextTaskNumber` is
   * allocated, and the `created` event is written in that same transaction: a request
   * without its creation event is not a state the system can produce.
   *
   * Nothing slow happens under that lock — no HTTP call, no mail, no PDF work — because
   * the same organization row is locked by member add/remove, vacation submit/review/
   * cancel and the accrual run.
   */
  async createRequest(
    session: SessionPayload,
    organizationId: string,
    body: Record<string, unknown>,
  ): Promise<RequestRowDto> {
    const caller = await this.requireCaller(session, organizationId);
    if (!can(caller.role, 'create-request')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUEST_MESSAGES.createForbidden,
      });
    }

    const today = todayInTimeZone(caller.timezone);
    const parsed = validateNewRequest(body, today);
    if (!parsed.valid) {
      throw new BadRequestException({ error: 'validation_error', fields: parsed.fields });
    }
    const input = parsed.value!;

    // Rule 8 — an active membership in the CALLER's organization. One in another
    // organization answers 404, identical to a non-existent id, so ids cannot be probed
    // across organizations; a removed one is the validation case instead.
    const assignee = await this.prisma.membership.findUnique({
      where: { id: input.assigneeMembershipId },
      select: { id: true, status: true, organizationId: true },
    });
    if (!assignee || assignee.organizationId !== organizationId) throw new NotFoundException();
    if (assignee.status !== 'active') {
      throw new BadRequestException({
        error: 'validation_error',
        fields: { assigneeMembershipId: REQUEST_MESSAGES.assigneeInactive },
      });
    }

    // Rule 9 — same split, for the same reason: only an archived project in the caller's
    // own organization tells them something they are entitled to know.
    if (input.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, status: true, organizationId: true },
      });
      if (!project || project.organizationId !== organizationId) throw new NotFoundException();
      if (project.status !== 'active') {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { projectId: REQUEST_MESSAGES.projectUnavailable },
        });
      }
    }

    const created = await this.prisma.$transaction(async (tx) => {
      // Serialize `nextRequestNumber` allocation on the organization row.
      const orgRows = await tx.$queryRaw<{ nextRequestNumber: number }[]>`
        SELECT "nextRequestNumber" FROM "Organization"
        WHERE "id" = ${organizationId}
        FOR UPDATE`;
      const orgRow = orgRows[0];
      if (!orgRow) throw new NotFoundException();
      const number = orgRow.nextRequestNumber;

      const request = await tx.request.create({
        data: {
          organizationId,
          number,
          type: input.type,
          accessKind: input.accessKind,
          title: input.title,
          description: input.description,
          projectId: input.projectId,
          requesterMembershipId: caller.membershipId,
          assigneeKind: input.assigneeKind,
          assigneeMembershipId: input.assigneeMembershipId,
          priority: input.priority,
          blocking: input.blocking,
          neededBy: input.neededBy ? new Date(`${input.neededBy}T00:00:00.000Z`) : null,
          // Requirement 15 — the initial status is always `open`.
          status: 'open',
        },
        include: REQUEST_ROW_INCLUDE,
      });

      await tx.organization.update({
        where: { id: organizationId },
        data: { nextRequestNumber: number + 1 },
      });

      await this.events.record(tx, {
        requestId: request.id,
        actorKind: 'member',
        actorMembershipId: caller.membershipId,
        action: 'created',
        newValue: 'open',
        newLabel: caller.displayName,
      });

      return request;
    });

    // `lastActivityAt` defaults to the same instant as `createdAt` (TC-01-INT-01).
    return toRequestRow(created, today);
  }

  /* ---------------------------------------------------------------- *
   * The thread
   * ---------------------------------------------------------------- */

  /** `POST …/requests/:requestId/messages`. Append-only; there is no edit or delete. */
  async postMessage(
    session: SessionPayload,
    organizationId: string,
    requestId: string,
    body: Record<string, unknown>,
  ): Promise<RequestMessageDto> {
    const caller = await this.requireCaller(session, organizationId);

    const message = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockRequest(tx, organizationId, requestId);
      this.requireParty(caller, locked);

      // Requirement 17 — a message may be posted in `open` and `answered` only.
      if (isTerminalRequestStatus(locked.status)) {
        throw new ConflictException({
          error: 'conflict',
          message: REQUEST_MESSAGES.threadClosed,
        });
      }

      const parsed = validateRequestMessageBody(body.body);
      if (!parsed.valid) {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { body: parsed.error },
        });
      }

      const created = await tx.requestMessage.create({
        data: {
          requestId,
          authorKind: 'member',
          authorMembershipId: caller.membershipId,
          body: parsed.value,
        },
        include: REQUEST_MESSAGE_INCLUDE,
      });

      await tx.request.update({
        where: { id: requestId },
        data: { lastActivityAt: new Date() },
      });

      // The author's display name is snapshotted so the trail renders correctly after
      // the author is removed or renamed (requirement 20).
      await this.events.record(tx, {
        requestId,
        actorKind: 'member',
        actorMembershipId: caller.membershipId,
        action: 'message_posted',
        newLabel: caller.displayName,
      });

      return created;
    });

    return toRequestMessage(message);
  }

  /* ---------------------------------------------------------------- *
   * The lifecycle
   * ---------------------------------------------------------------- */

  /**
   * The one order every transition route uses, so a caller never sees two answers for
   * one call (AC-16): resolve the row scoped by the session's organization and apply the
   * party rule first (404, identical to a missing row), then the terminal check (409),
   * then the legality of the move (409), then the actor guard on the locked row (403).
   */
  async transition(
    session: SessionPayload,
    organizationId: string,
    requestId: string,
    action: TransitionAction,
    body: Record<string, unknown>,
  ): Promise<RequestRowDto> {
    const caller = await this.requireCaller(session, organizationId);
    const rule = TRANSITIONS[action];

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockRequest(tx, organizationId, requestId);
      this.requireParty(caller, locked);

      if (isTerminalRequestStatus(locked.status)) {
        throw new ConflictException({
          error: 'conflict',
          message: REQUEST_MESSAGES.alreadyTerminal,
        });
      }
      if (!rule.from.includes(locked.status)) {
        throw new ConflictException({
          error: 'conflict',
          message: REQUEST_MESSAGES.invalidTransition,
        });
      }
      if (!rule.actor(caller, locked)) {
        throw new ForbiddenException({ error: 'forbidden', message: rule.forbiddenMessage });
      }

      const now = new Date();

      // A decline's reason is written as a message in the same transaction as the
      // status, so a refusal cannot exist without an explanation in the thread
      // (requirement 25). It is written while the row is still non-terminal.
      if (action === 'decline') {
        const reason = validateDeclineReason(body.reason);
        if (!reason.valid) {
          throw new BadRequestException({
            error: 'validation_error',
            fields: { reason: reason.error },
          });
        }
        await tx.requestMessage.create({
          data: {
            requestId,
            authorKind: 'member',
            authorMembershipId: caller.membershipId,
            body: reason.value,
          },
        });

        // Requirement 19 is unconditional: *every* message writes a `message_posted`
        // event in the same transaction as its `RequestMessage` row. The decline reason
        // is a message (requirement 25), so it writes one too — otherwise the history of
        // a declined request records the status change and never records that the reason
        // exists, which requirement 21 makes visible. This is an event of a *different*
        // action alongside the single `status_changed` recorded below, not a second
        // status change: invariant 4 (exactly one `status_changed` per transition) holds.
        await this.events.record(tx, {
          requestId,
          actorKind: 'member',
          actorMembershipId: caller.membershipId,
          action: 'message_posted',
          newLabel: caller.displayName,
        });
      }

      await tx.request.update({
        where: { id: requestId },
        data: {
          status: rule.to,
          lastActivityAt: now,
          // Written exactly once, on the first entry into each state (requirement 31).
          ...(rule.to === 'answered' ? { answeredAt: locked.answeredAt ?? now } : {}),
          ...(isTerminalRequestStatus(rule.to)
            ? {
                resolvedAt: locked.resolvedAt ?? now,
                resolvedByAccountId: caller.accountId,
              }
            : {}),
        },
      });

      await this.events.record(tx, {
        requestId,
        actorKind: 'member',
        actorMembershipId: caller.membershipId,
        action: 'status_changed',
        oldValue: locked.status,
        newValue: rule.to,
        newLabel: caller.displayName,
      });

      return tx.request.findUniqueOrThrow({
        where: { id: requestId },
        include: REQUEST_ROW_INCLUDE,
      });
    });

    return toRequestRow(updated, todayInTimeZone(caller.timezone));
  }

  /**
   * `PATCH …/requests/:requestId`. Editing is limited to five fields, by the requester or
   * an admin, and only while the request is non-terminal. Each edited field writes its
   * own `field_changed` event (requirement 34).
   */
  async patchRequest(
    session: SessionPayload,
    organizationId: string,
    requestId: string,
    body: Record<string, unknown>,
  ): Promise<RequestRowDto> {
    const caller = await this.requireCaller(session, organizationId);
    const today = todayInTimeZone(caller.timezone);

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockRequest(tx, organizationId, requestId);
      this.requireParty(caller, locked);

      if (isTerminalRequestStatus(locked.status)) {
        throw new ConflictException({
          error: 'conflict',
          message: REQUEST_MESSAGES.alreadyTerminal,
        });
      }
      if (!caller.isAdmin && locked.requesterMembershipId !== caller.membershipId) {
        throw new ForbiddenException({
          error: 'forbidden',
          message: REQUEST_MESSAGES.editForbidden,
        });
      }

      const parsed = validateRequestEdit(body, today);
      if (!parsed.valid) {
        throw new BadRequestException({ error: 'validation_error', fields: parsed.fields });
      }
      const changes = parsed.value!;

      const current = await tx.request.findUniqueOrThrow({
        where: { id: requestId },
        select: {
          title: true,
          description: true,
          priority: true,
          blocking: true,
          neededBy: true,
        },
      });

      const data: Prisma.RequestUpdateInput = {};
      const edited: { field: string; oldValue: string | null; newValue: string | null }[] = [];

      const note = (field: string, oldValue: unknown, newValue: unknown): void => {
        edited.push({
          field,
          oldValue: oldValue === null || oldValue === undefined ? null : String(oldValue),
          newValue: newValue === null || newValue === undefined ? null : String(newValue),
        });
      };

      if (changes.title !== undefined && changes.title !== current.title) {
        data.title = changes.title;
        note('title', current.title, changes.title);
      }
      if (changes.description !== undefined && changes.description !== current.description) {
        data.description = changes.description;
        note('description', current.description, changes.description);
      }
      if (changes.priority !== undefined && changes.priority !== current.priority) {
        data.priority = changes.priority;
        note('priority', current.priority, changes.priority);
      }
      if (changes.blocking !== undefined && changes.blocking !== current.blocking) {
        data.blocking = changes.blocking;
        note('blocking', current.blocking, changes.blocking);
      }
      if (changes.neededBy !== undefined) {
        const currentNeededBy = current.neededBy
          ? current.neededBy.toISOString().slice(0, 10)
          : null;
        if (changes.neededBy !== currentNeededBy) {
          data.neededBy = changes.neededBy
            ? new Date(`${changes.neededBy}T00:00:00.000Z`)
            : null;
          note('neededBy', currentNeededBy, changes.neededBy);
        }
      }

      if (edited.length > 0) {
        data.lastActivityAt = new Date();
        await tx.request.update({ where: { id: requestId }, data });
        for (const change of edited) {
          await this.events.record(tx, {
            requestId,
            actorKind: 'member',
            actorMembershipId: caller.membershipId,
            action: 'field_changed',
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
            newLabel: caller.displayName,
          });
        }
      }

      return tx.request.findUniqueOrThrow({
        where: { id: requestId },
        include: REQUEST_ROW_INCLUDE,
      });
    });

    return toRequestRow(updated, today);
  }

  /**
   * `POST …/requests/:requestId/reassign`. The capability (`ViewAllRequests`) is checked
   * by the route's guard; the addressee is validated exactly as at creation, and the
   * event carries both display names so the trail stays readable after a member is
   * removed (requirement 35).
   */
  async reassignRequest(
    session: SessionPayload,
    organizationId: string,
    requestId: string,
    body: Record<string, unknown>,
  ): Promise<RequestRowDto> {
    const caller = await this.requireCaller(session, organizationId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const locked = await this.lockRequest(tx, organizationId, requestId);
      this.requireParty(caller, locked);

      if (isTerminalRequestStatus(locked.status)) {
        throw new ConflictException({
          error: 'conflict',
          message: REQUEST_MESSAGES.alreadyTerminal,
        });
      }

      const parsed = validateRequestAssignee(body);
      if (!parsed.valid) {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { assigneeMembershipId: parsed.error },
        });
      }

      const next = await tx.membership.findUnique({
        where: { id: parsed.value.assigneeMembershipId },
        select: {
          id: true,
          status: true,
          organizationId: true,
          account: { select: { firstName: true, lastName: true } },
        },
      });
      if (!next || next.organizationId !== organizationId) throw new NotFoundException();
      if (next.status !== 'active') {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { assigneeMembershipId: REQUEST_MESSAGES.assigneeInactive },
        });
      }

      const previous = locked.assigneeMembershipId
        ? await tx.membership.findUnique({
            where: { id: locked.assigneeMembershipId },
            select: { id: true, account: { select: { firstName: true, lastName: true } } },
          })
        : null;

      await tx.request.update({
        where: { id: requestId },
        data: {
          assigneeKind: parsed.value.assigneeKind,
          assigneeMembershipId: next.id,
          lastActivityAt: new Date(),
        },
      });

      await this.events.record(tx, {
        requestId,
        actorKind: 'member',
        actorMembershipId: caller.membershipId,
        action: 'assignee_changed',
        oldValue: locked.assigneeMembershipId,
        newValue: next.id,
        oldLabel: previous ? displayNameOf(previous.account) : null,
        newLabel: displayNameOf(next.account),
      });

      return tx.request.findUniqueOrThrow({
        where: { id: requestId },
        include: REQUEST_ROW_INCLUDE,
      });
    });

    return toRequestRow(updated, todayInTimeZone(caller.timezone));
  }

  /* ---------------------------------------------------------------- *
   * Shared internals
   * ---------------------------------------------------------------- */

  /**
   * Re-read the row with `FOR UPDATE` inside the caller's transaction. Everything the
   * guards need comes from THIS read: anything loaded before the transaction is already
   * stale by the time it is tested (invariant 3).
   *
   * The row is selected by id AND the session's organization, so a request in another
   * organization is indistinguishable from one that does not exist.
   */
  private async lockRequest(
    tx: Prisma.TransactionClient,
    organizationId: string,
    requestId: string,
  ): Promise<LockedRequest> {
    const rows = await tx.$queryRaw<LockedRequest[]>`
      SELECT "id", "status", "requesterMembershipId", "assigneeMembershipId",
             "answeredAt", "resolvedAt"
      FROM "Request"
      WHERE "id" = ${requestId} AND "organizationId" = ${organizationId}
      FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }

  /** The requester, the addressee, or a holder of `view-all-requests`. */
  private isParty(
    caller: Caller,
    row: { requesterMembershipId: string; assigneeMembershipId: string | null },
  ): boolean {
    return (
      row.requesterMembershipId === caller.membershipId ||
      row.assigneeMembershipId === caller.membershipId
    );
  }

  /**
   * A caller who is not party to a request is told nothing: 404, identical to a request
   * that does not exist. A party the route then forbids gets the 403 named for that
   * route — and no route ever answers both for the same caller (AC-16).
   */
  private requireParty(
    caller: Caller,
    row: { requesterMembershipId: string; assigneeMembershipId: string | null },
  ): void {
    if (!canReadRequest(caller.rawRole, this.isParty(caller, row))) {
      throw new NotFoundException();
    }
  }

  /**
   * The caller's own membership, resolved from the session. `organizationId` is passed
   * in rather than read from the path so the scope key can never be defaulted; it is the
   * session's organization, which `OrgScopeGuard` has already matched against the URL.
   */
  private async requireCaller(
    session: SessionPayload,
    organizationId: string,
  ): Promise<Caller> {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: {
        id: true,
        role: true,
        status: true,
        organizationId: true,
        accountId: true,
        account: { select: { firstName: true, lastName: true, timezone: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.organizationId !== organizationId
    ) {
      throw new ForbiddenException();
    }
    const role = normalizeRole(membership.role);
    return {
      membershipId: membership.id,
      accountId: membership.accountId,
      organizationId: membership.organizationId,
      role,
      rawRole: membership.role,
      timezone: membership.account.timezone,
      displayName: displayNameOf(membership.account),
      isAdmin: role === 'admin',
    };
  }
}

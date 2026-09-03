import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CLIENT_USER_MESSAGES,
  REQUEST_MESSAGES,
  can,
  canReadRequest,
  compareRequestRows,
  expandRequestStatusQuery,
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
import {
  RequestNotificationsService,
  type NotificationRecipient,
} from './request-notifications.service';
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
  kind: 'member';
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

/**
 * Requests spec 03 — the other principal that reaches these routes. A client contact
 * holds no role at all, which is why they carry none here: every branch asks the kind
 * first, and no role-keyed helper is ever reached with one (REQ-03-017).
 */
interface ClientCaller {
  kind: 'client';
  clientMembershipId: string;
  clientId: string;
  accountId: string;
  organizationId: string;
  timezone: string | null;
  displayName: string;
}

type AnyCaller = Caller | ClientCaller;

/** The columns the state-machine guards are evaluated against, read under the row lock. */
interface LockedRequest {
  id: string;
  status: string;
  requesterMembershipId: string;
  assigneeKind: string;
  assigneeMembershipId: string | null;
  /** Requests spec 03 — the client half of the addressee, read under the same lock. */
  assigneeClientMembershipId: string | null;
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
    actor: (caller: AnyCaller, row: LockedRequest) => boolean;
    forbiddenMessage: string;
  }
> = {
  answer: {
    to: 'answered',
    from: ['open'],
    // Requirement 23 — the addressee, or an admin acting for them. Requests spec 03
    // REQ-03-030 gives the addressee client contact the same test, against the same
    // locked row: the guard is who the row is addressed to, whichever kind that is.
    actor: (caller, row) =>
      caller.kind === 'client'
        ? row.assigneeClientMembershipId === caller.clientMembershipId
        : caller.isAdmin || row.assigneeMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToAnswer,
  },
  grant: {
    to: 'granted',
    from: ['open', 'answered'],
    // Requirement 24 — the requester or an admin, and NOBODY else: not the addressee,
    // not a manager who is not the requester. Only the person who needs the access
    // knows whether it works. A client contact is never the requester (REQ-03-027), so
    // REQ-03-032's 403 is this same guard rather than a second rule.
    actor: (caller, row) =>
      caller.kind === 'client'
        ? false
        : caller.isAdmin || row.requesterMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToGrant,
  },
  decline: {
    to: 'declined',
    from: ['open', 'answered'],
    actor: (caller, row) =>
      caller.kind === 'client'
        ? row.assigneeClientMembershipId === caller.clientMembershipId
        : caller.isAdmin || row.assigneeMembershipId === caller.membershipId,
    forbiddenMessage: REQUEST_MESSAGES.notYoursToDecline,
  },
  cancel: {
    to: 'cancelled',
    from: ['open', 'answered'],
    actor: (caller, row) =>
      caller.kind === 'client'
        ? false
        : caller.isAdmin || row.requesterMembershipId === caller.membershipId,
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
    private readonly notifications: RequestNotificationsService,
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
      topicId?: unknown;
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
    // The kind is asked first (REQ-03-017): a client principal is never answered this
    // 403, because `scope=all` widens nothing they could ever be granted (REQ-03-029).
    if (caller.kind === 'member' && scope === 'all' && !can(caller.role, 'view-all-requests')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: REQUEST_MESSAGES.scopeForbidden,
      });
    }

    // REQ-03-029 — a client contact receives only the requests addressed to them, for
    // `scope=mine`, `scope=all` and no scope alike.
    const scopeWhere: Prisma.RequestWhereInput =
      caller.kind === 'client'
        ? { organizationId, assigneeClientMembershipId: caller.clientMembershipId }
        : scope === 'all'
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
    const waitingOnMeWhere: Prisma.RequestWhereInput =
      caller.kind === 'client'
        ? {
            organizationId,
            assigneeClientMembershipId: caller.clientMembershipId,
            status: { in: ['open', 'answered'] },
          }
        : {
            organizationId,
            assigneeMembershipId: caller.membershipId,
            status: { in: ['open', 'answered'] },
          };

    const [waitingOnMe, total] = await Promise.all([
      this.prisma.request.count({ where: waitingOnMeWhere }),
      this.prisma.request.count({ where: scopeWhere }),
    ]);

    const q = typeof query.q === 'string' ? query.q.trim() : '';
    const projectId =
      typeof query.projectId === 'string' && query.projectId.trim().length > 0
        ? query.projectId
        : null;
    // Requests spec 02 requirement 26 — an equality filter on the stored column, applied
    // INSIDE the organization scope above, so a topicId from another organization returns
    // an empty array rather than that organization's rows (TC-02-INT-15).
    const topicId =
      typeof query.topicId === 'string' && query.topicId.trim().length > 0
        ? query.topicId
        : null;

    // Requests spec 02 requirement 27 — `closed` is one filter value over two stored
    // statuses, and the five stored values still resolve for a link somebody saved. The
    // parser above has already refused anything outside the set, so this cannot be null.
    const statuses = status === 'all' ? null : expandRequestStatusQuery(status);

    // `type=vacation` is a choice of SECTION, not a filter over one array: vacation rows
    // are not `Request` rows in this release (requirement 41).
    const rows =
      type === 'vacation'
        ? []
        : await this.prisma.request.findMany({
            where: {
              ...scopeWhere,
              ...(statuses ? { status: { in: [...statuses] } } : {}),
              ...(type === 'access' || type === 'question' ? { type } : {}),
              ...(projectId ? { projectId } : {}),
              ...(topicId ? { topicId } : {}),
              ...(q ? { title: { contains: q, mode: 'insensitive' as const } } : {}),
            },
            include: REQUEST_ROW_INCLUDE,
          });

    const today = todayInTimeZone(caller.timezone);
    const requests = rows.map((row) => toRequestRow(row, today)).sort(compareRequestRows);

    const result: RequestsListDto = { requests, counts: { waitingOnMe, total } };

    // The vacation section keeps its own capability (requirement 41): a `user` sees the
    // page and their own requests, and does not see anyone's vacation — the section is
    // absent entirely, not empty. The kind is asked before the capability, so a client
    // contact's response carries no `vacation` member at all (REQ-03-029).
    if (caller.kind === 'member' && can(caller.role, 'view-requests')) {
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
    // REQ-03-034 — a request a client principal is not the addressee of is 404, identical
    // to one that does not exist. `requireParty` asks the kind before the role-keyed
    // helper, which is the whole of the ordering rule.
    this.requireParty(caller, row);

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
    const resolved = await this.requireCaller(session, organizationId);

    // REQ-03-027 — the ordering is part of the rule. A client contact is refused here,
    // before any capability is consulted and before the body is looked at, so they never
    // receive `createForbidden` (the sentence written for a viewer) and a malformed body
    // is not answered as a validation error.
    if (resolved.kind === 'client') {
      throw new ForbiddenException({
        error: 'forbidden',
        message: CLIENT_USER_MESSAGES.clientCannotCreate,
      });
    }
    const caller = resolved;

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

    // Requests spec 02 rules 8 and 9 — the topic. Read before the transaction, exactly as
    // the assignee and the project below are: a topic archived in that window yields a
    // request under an archived topic, which requirement 10 makes lossless (the request
    // keeps its snapshot name, stays readable and stays filterable) rather than a
    // violation of any invariant.
    //
    // Rule 8 collapses three outcomes into one answer — archived, another organization's,
    // and naming no row at all — with one body, so an id belonging to somebody else is
    // not distinguishable from one that never existed (requirement 19). This is the
    // module's one deliberate 400 where it otherwise answers 404 across organizations,
    // and it leaks nothing precisely because all three answers are identical.
    const topic = await this.prisma.requestTopic.findFirst({
      where: { id: input.topicId, organizationId, status: 'active' },
      select: { id: true, name: true, type: true, audience: true },
    });
    if (!topic) {
      throw new BadRequestException({
        error: 'validation_error',
        fields: { topicId: REQUEST_MESSAGES.topicUnavailable },
      });
    }

    // Rule 9 — compared only on a topic rule 8 has found active, so an archived client
    // topic answers `topicUnavailable` and never `topicAudienceMismatch` (requirement 20,
    // edge case 18). Requests spec 03 REQ-03-024 makes the audience the addressee's kind:
    // `staff` for a colleague, `client` for a client contact, all four cells of the
    // table decided here.
    const requiredAudience = input.assigneeKind === 'client' ? 'client' : 'staff';
    if (topic.audience !== requiredAudience) {
      throw new BadRequestException({
        error: 'validation_error',
        fields: { topicId: REQUEST_MESSAGES.topicAudienceMismatch },
      });
    }

    // The addressee row. Both kinds answer alike across organizations: an id of another
    // organization and one that names nothing are both a bare 404, so ids cannot be
    // probed across organizations; a removed row of the caller's OWN organization is the
    // validation case instead, and only after the 404 (spec 01 rule 8, REQ-03-020,
    // REQ-03-025).
    let contactClientId: string | null = null;
    if (input.assigneeKind === 'client') {
      const contact = await this.prisma.clientMembership.findUnique({
        where: { id: input.assigneeClientMembershipId! },
        select: { id: true, status: true, organizationId: true, clientId: true },
      });
      if (!contact || contact.organizationId !== organizationId) throw new NotFoundException();
      if (contact.status !== 'active') {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { assigneeClientMembershipId: REQUEST_MESSAGES.assigneeInactive },
        });
      }
      contactClientId = contact.clientId;
    } else {
      const assignee = await this.prisma.membership.findUnique({
        where: { id: input.assigneeMembershipId! },
        select: { id: true, status: true, organizationId: true },
      });
      if (!assignee || assignee.organizationId !== organizationId) throw new NotFoundException();
      if (assignee.status !== 'active') {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { assigneeMembershipId: REQUEST_MESSAGES.assigneeInactive },
        });
      }
    }

    // Rule 9 — same split, for the same reason: only an archived project in the caller's
    // own organization tells them something they are entitled to know.
    if (input.projectId) {
      const project = await this.prisma.project.findUnique({
        where: { id: input.projectId },
        select: { id: true, status: true, organizationId: true, clientId: true },
      });
      if (!project || project.organizationId !== organizationId) throw new NotFoundException();
      if (project.status !== 'active') {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { projectId: REQUEST_MESSAGES.projectUnavailable },
        });
      }

      if (input.assigneeKind === 'client') {
        // REQ-03-022 — the project belongs to the addressee's client. A project with no
        // client link at all is refused by the same sentence, so neither answer says
        // whether the project exists (edge case 7).
        if (project.clientId !== contactClientId) {
          throw new BadRequestException({
            error: 'validation_error',
            fields: { projectId: REQUEST_MESSAGES.clientProjectMismatch },
          });
        }
        // REQ-03-023 — the requester works on that project. An admin is not carved out:
        // that would remove the only rule keeping a client's inbox to people they work
        // with. It is a gate at creation, not a standing condition (edge case 6).
        const assignment = await this.prisma.projectMember.findUnique({
          where: {
            projectId_membershipId: {
              projectId: project.id,
              membershipId: caller.membershipId,
            },
          },
          select: { id: true },
        });
        if (!assignment) {
          throw new BadRequestException({
            error: 'validation_error',
            fields: { projectId: REQUEST_MESSAGES.notOnProject },
          });
        }
      }
    }

    const notificationIds: string[] = [];
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
          // Requirement 21 — the kind is derived from the topic and never supplied, and
          // `accessKind` is written null even under an access topic: the column keeps its
          // stored values on the rows that carry them and gains none.
          type: topic.type,
          accessKind: null,
          topicId: topic.id,
          // Requirement 23 — the snapshot, written in the same transaction as the row it
          // belongs to, and never rewritten afterwards by any writer (requirement 25).
          topicLabel: topic.name,
          title: input.title,
          description: input.description,
          projectId: input.projectId,
          requesterMembershipId: caller.membershipId,
          assigneeKind: input.assigneeKind,
          assigneeMembershipId: input.assigneeMembershipId,
          // Requests spec 03 — one of the two is set, decided by the kind above.
          assigneeClientMembershipId: input.assigneeClientMembershipId,
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

      const eventId = await this.events.record(tx, {
        requestId: request.id,
        ...this.actorColumns(caller),
        action: 'created',
        newValue: 'open',
        newLabel: caller.displayName,
      });

      // REQ-03-035 — the outbox rows ride the transaction that wrote the event, against
      // the row as that transaction leaves it.
      notificationIds.push(
        ...(await this.notifications.record(tx, {
          organizationId,
          requestId: request.id,
          eventId,
          action: 'created',
          recipients: this.notifications.recipientsFor(request, this.actorRecipient(caller)),
        })),
      );

      return request;
    });

    // REQ-03-037 — after the commit, and not awaited: the route answers whatever the
    // notifier does.
    this.notifications.dispatch(notificationIds);

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

    const notificationIds: string[] = [];
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

      const actor = this.actorColumns(caller);
      const created = await tx.requestMessage.create({
        data: {
          requestId,
          // REQ-03-033 — a contact's message carries `authorKind` of `client` and their
          // client-membership id; the columns are the same seam the addressee uses.
          authorKind: actor.actorKind,
          authorMembershipId: actor.actorMembershipId,
          authorClientMembershipId: actor.actorClientMembershipId,
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
      const eventId = await this.events.record(tx, {
        requestId,
        ...actor,
        action: 'message_posted',
        newLabel: caller.displayName,
      });

      notificationIds.push(
        ...(await this.notifications.record(tx, {
          organizationId,
          requestId,
          eventId,
          action: 'message_posted',
          recipients: this.notifications.recipientsFor(locked, this.actorRecipient(caller)),
        })),
      );

      return created;
    });

    this.notifications.dispatch(notificationIds);

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

    const notificationIds: string[] = [];
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
      const actor = this.actorColumns(caller);
      const actorRecipient = this.actorRecipient(caller);
      const recipients = this.notifications.recipientsFor(locked, actorRecipient);

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
            authorKind: actor.actorKind,
            authorMembershipId: actor.actorMembershipId,
            authorClientMembershipId: actor.actorClientMembershipId,
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
        const messageEventId = await this.events.record(tx, {
          requestId,
          ...actor,
          action: 'message_posted',
          newLabel: caller.displayName,
        });

        notificationIds.push(
          ...(await this.notifications.record(tx, {
            organizationId,
            requestId,
            eventId: messageEventId,
            action: 'message_posted',
            recipients,
          })),
        );
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

      const eventId = await this.events.record(tx, {
        requestId,
        ...actor,
        action: 'status_changed',
        oldValue: locked.status,
        newValue: rule.to,
        newLabel: caller.displayName,
      });

      notificationIds.push(
        ...(await this.notifications.record(tx, {
          organizationId,
          requestId,
          eventId,
          action: 'status_changed',
          recipients,
        })),
      );

      return tx.request.findUniqueOrThrow({
        where: { id: requestId },
        include: REQUEST_ROW_INCLUDE,
      });
    });

    this.notifications.dispatch(notificationIds);

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
    // Editing is a staff route: REQ-03-019 does not name it, so a client principal is
    // already answered 404 by the guard and is answered the same here.
    const caller = this.requireMemberCaller(await this.requireCaller(session, organizationId));
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
          // `field_changed` is not among the actions REQ-03-035 names, so it writes no
          // outbox row and notifies nobody.
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
    // Reassignment is a staff route, and it takes a colleague: a reassign path that
    // accepts a client addressee is named in Known Gaps as not built, so a body naming
    // one is refused with the answer this route already gives it.
    const caller = this.requireMemberCaller(await this.requireCaller(session, organizationId));

    const notificationIds: string[] = [];
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
      if (!parsed.valid || parsed.value.assigneeKind !== 'member') {
        throw new BadRequestException({
          error: 'validation_error',
          fields: { assigneeMembershipId: REQUEST_MESSAGES.assigneeInvalid },
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
          // The other half of the addressee is cleared, so exactly one of the two is
          // ever set on a row.
          assigneeClientMembershipId: null,
          lastActivityAt: new Date(),
        },
      });

      const eventId = await this.events.record(tx, {
        requestId,
        actorKind: 'member',
        actorMembershipId: caller.membershipId,
        action: 'assignee_changed',
        oldValue: locked.assigneeMembershipId,
        newValue: next.id,
        oldLabel: previous ? displayNameOf(previous.account) : null,
        newLabel: displayNameOf(next.account),
      });

      // REQ-03-036 — the addressee AS THE TRANSACTION LEAVES IT, so a reassignment
      // notifies the incoming addressee and not the outgoing one.
      notificationIds.push(
        ...(await this.notifications.record(tx, {
          organizationId,
          requestId,
          eventId,
          action: 'assignee_changed',
          recipients: this.notifications.recipientsFor(
            {
              requesterMembershipId: locked.requesterMembershipId,
              assigneeKind: 'member',
              assigneeMembershipId: next.id,
              assigneeClientMembershipId: null,
            },
            this.actorRecipient(caller),
          ),
        })),
      );

      return tx.request.findUniqueOrThrow({
        where: { id: requestId },
        include: REQUEST_ROW_INCLUDE,
      });
    });

    this.notifications.dispatch(notificationIds);

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
      SELECT "id", "status", "requesterMembershipId", "assigneeKind",
             "assigneeMembershipId", "assigneeClientMembershipId",
             "answeredAt", "resolvedAt"
      FROM "Request"
      WHERE "id" = ${requestId} AND "organizationId" = ${organizationId}
      FOR UPDATE`;
    const row = rows[0];
    if (!row) throw new NotFoundException();
    return row;
  }

  /**
   * The requester, the addressee, or a holder of `view-all-requests` — for a member.
   *
   * For a client contact it is one test and only one: the request is addressed to them
   * (REQ-03-028). There is no widening capability a contact could hold, so a request
   * they are not the addressee of is not theirs (REQ-03-034).
   */
  private isParty(caller: AnyCaller, row: PartyColumns): boolean {
    if (caller.kind === 'client') {
      return row.assigneeClientMembershipId === caller.clientMembershipId;
    }
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
  private requireParty(caller: AnyCaller, row: PartyColumns): void {
    const party = this.isParty(caller, row);
    // The kind is asked before any role-keyed helper: `canReadRequest` normalizes an
    // absent role to `viewer`, which would answer a client principal from a role they do
    // not hold (REQ-03-017, edge case 17).
    if (caller.kind === 'client') {
      if (!party) throw new NotFoundException();
      return;
    }
    if (!canReadRequest(caller.rawRole, party)) {
      throw new NotFoundException();
    }
  }

  /**
   * The caller's own principal, resolved from the session. `organizationId` is passed in
   * rather than read from the path so the scope key can never be defaulted; it is the
   * session's organization, which `OrgScopeGuard` has already matched against the URL.
   *
   * The staff row wins, as REQ-03-002's table says, and the client row is read only when
   * there is no active staff one.
   */
  private async requireCaller(
    session: SessionPayload,
    organizationId: string,
  ): Promise<AnyCaller> {
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
      membership &&
      membership.status === 'active' &&
      membership.organizationId === organizationId
    ) {
      const role = normalizeRole(membership.role);
      return {
        kind: 'member',
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

    const contact = await this.prisma.clientMembership.findUnique({
      where: { accountId: session.accountId },
      select: {
        id: true,
        status: true,
        organizationId: true,
        clientId: true,
        accountId: true,
        account: { select: { firstName: true, lastName: true, timezone: true } },
      },
    });
    if (contact && contact.status === 'active' && contact.organizationId === organizationId) {
      return {
        kind: 'client',
        clientMembershipId: contact.id,
        clientId: contact.clientId,
        accountId: contact.accountId,
        organizationId: contact.organizationId,
        timezone: contact.account.timezone,
        displayName: displayNameOf(contact.account),
      };
    }

    throw new ForbiddenException();
  }

  /**
   * The caller as a member of staff, for the routes REQ-03-019 does not open to a client
   * principal at all. A contact is answered the same bare 404 `OrgScopeGuard` already
   * gives them, so the two layers cannot disagree about what a contact sees.
   */
  private requireMemberCaller(caller: AnyCaller): Caller {
    if (caller.kind !== 'member') throw new NotFoundException();
    return caller;
  }

  /** Who the caller is, as a notification recipient — the actor of the events they cause. */
  private actorRecipient(caller: AnyCaller): NotificationRecipient {
    return caller.kind === 'client'
      ? { kind: 'client', id: caller.clientMembershipId }
      : { kind: 'member', id: caller.membershipId };
  }

  /** The actor columns of an event or a message, for whichever kind the caller is. */
  private actorColumns(caller: AnyCaller): {
    actorKind: 'member' | 'client';
    actorMembershipId: string | null;
    actorClientMembershipId: string | null;
  } {
    return caller.kind === 'client'
      ? {
          actorKind: 'client',
          actorMembershipId: null,
          actorClientMembershipId: caller.clientMembershipId,
        }
      : {
          actorKind: 'member',
          actorMembershipId: caller.membershipId,
          actorClientMembershipId: null,
        };
  }
}

/** The addressee and requester columns every party test is evaluated against. */
interface PartyColumns {
  requesterMembershipId: string;
  assigneeMembershipId: string | null;
  assigneeClientMembershipId: string | null;
}

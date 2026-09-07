import { isRequestOverdue } from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import type {
  RequestAssigneeDto,
  RequestDetailDto,
  RequestEventDto,
  RequestMessageDto,
  RequestRowDto,
  RequestTopicMemberDto,
} from './requests.dto';

/**
 * Everything the wire shape needs, and nothing else. Declared once as a Prisma
 * validator so the query and the serializer cannot drift apart.
 */
export const REQUEST_ROW_INCLUDE = {
  project: { select: { id: true, name: true } },
  /* Requests spec 02 — the live catalogue row, for the four members of `topic` that are
     read from it. `topic.name` is NOT read here: it is the snapshot on the request. */
  topic: { select: { id: true, audience: true, type: true, status: true } },
  requester: {
    select: { id: true, status: true, account: { select: { firstName: true, lastName: true } } },
  },
  assignee: {
    select: { id: true, status: true, account: { select: { firstName: true, lastName: true } } },
  },
  /* Requests spec 03 — the client half of the addressee. The contact's display name and
     their client's name are read; their email address is not, and no request response
     carries it. */
  assigneeClientMembership: {
    select: {
      id: true,
      status: true,
      client: { select: { id: true, name: true } },
      account: { select: { firstName: true, lastName: true } },
    },
  },
  _count: { select: { messages: true } },
} satisfies Prisma.RequestInclude;

export type RequestWithRelations = Prisma.RequestGetPayload<{
  include: typeof REQUEST_ROW_INCLUDE;
}>;

export const REQUEST_MESSAGE_INCLUDE = {
  author: { select: { id: true, account: { select: { firstName: true, lastName: true } } } },
  /* Requests spec 03 — a message a client contact wrote carries the other author column. */
  clientAuthor: { select: { id: true, account: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.RequestMessageInclude;

export type RequestMessageWithAuthor = Prisma.RequestMessageGetPayload<{
  include: typeof REQUEST_MESSAGE_INCLUDE;
}>;

export const REQUEST_EVENT_INCLUDE = {
  actor: { select: { id: true, account: { select: { firstName: true, lastName: true } } } },
  /* Requests spec 03 — an event a client contact caused carries the other actor column. */
  clientActor: { select: { id: true, account: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.RequestEventInclude;

export type RequestEventWithActor = Prisma.RequestEventGetPayload<{
  include: typeof REQUEST_EVENT_INCLUDE;
}>;

/** "First Last" — the one display name this feature shows, everywhere. */
export function displayNameOf(account: { firstName: string; lastName: string }): string {
  return `${account.firstName} ${account.lastName}`.trim();
}

/** A `@db.Date` column back to the 'YYYY-MM-DD' the wire and the validators speak. */
export function toDateString(value: Date | null): string | null {
  return value ? value.toISOString().slice(0, 10) : null;
}

/**
 * One request row for the wire. `today` is the reading account's calendar date, which is
 * the only reason `overdue` can be a property of a row rather than of the database:
 * two callers in different zones legitimately see different flags on the same request
 * (requirement 33, edge case 10).
 */
export function toRequestRow(row: RequestWithRelations, today: string): RequestRowDto {
  const neededBy = toDateString(row.neededBy);
  return {
    id: row.id,
    number: row.number,
    type: row.type,
    accessKind: row.accessKind,
    topic: toRequestTopicMember(row),
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    blocking: row.blocking,
    overdue: isRequestOverdue({ neededBy, status: row.status }, today),
    neededBy,
    project: row.project ? { id: row.project.id, name: row.project.name } : null,
    requester: {
      membershipId: row.requesterMembershipId,
      displayName: row.requester ? displayNameOf(row.requester.account) : '',
    },
    assignee: toRequestAssignee(row),
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    messageCount: row._count.messages,
  };
}

/**
 * Who the request is addressed to, for whichever kind it carries.
 *
 * Requests spec 03: a client addressee answers with the contact's display name, their
 * client's name and the same `inactive` read — a removal is a soft delete there too, so
 * a request whose contact has been removed reports its assignee inactive and is
 * cancelled by nothing (REQ-03-026). The contact's email address is never carried.
 */
export function toRequestAssignee(
  row: Pick<
    RequestWithRelations,
    'assigneeKind' | 'assigneeMembershipId' | 'assignee' | 'assigneeClientMembershipId' | 'assigneeClientMembership'
  >,
): RequestAssigneeDto {
  if (row.assigneeKind === 'client') {
    const contact = row.assigneeClientMembership;
    return {
      kind: 'client',
      id: row.assigneeClientMembershipId,
      displayName: contact ? displayNameOf(contact.account) : null,
      clientName: contact ? contact.client.name : null,
      inactive: contact ? contact.status !== 'active' : true,
    };
  }
  return {
    kind: row.assigneeKind,
    id: row.assigneeMembershipId,
    displayName: row.assignee ? displayNameOf(row.assignee.account) : null,
    // The client name belongs to a client addressee alone; one shape answers both, so a
    // screen reads the same member whichever kind it is looking at.
    clientName: null,
    // Member removal is a soft delete (`status = 'removed'`), so this is a status read
    // and never a null FK — requirement 36 and edge case 11.
    inactive: row.assignee ? row.assignee.status !== 'active' : true,
  };
}

/**
 * Requests spec 02 — the one member this spec adds to a request row, and it removes none.
 *
 * Keyed on `topicLabel`, not on `topicId`: `topic` is `null` exactly when the request
 * carries no label, which is every request raised before this spec and no request raised
 * after it. `name` is the **snapshot** label, so renaming the catalogue entry never
 * rewrites what an old request says it was about (REQ-02-025).
 *
 * The other four are read from the row `topicId` names, so a screen can mark a topic that
 * has since been archived — and each of the four is `null` when a request carries a label
 * and no `topicId`, the state a row reaches only if its topic was deleted outside this
 * product's routes (REQ-02-023, TC-02-INT-02).
 */
export function toRequestTopicMember(
  row: Pick<RequestWithRelations, 'topicLabel' | 'topic'>,
): RequestTopicMemberDto | null {
  if (row.topicLabel === null) return null;
  return {
    id: row.topic ? row.topic.id : null,
    name: row.topicLabel,
    audience: row.topic ? row.topic.audience : null,
    type: row.topic ? row.topic.type : null,
    status: row.topic ? row.topic.status : null,
  };
}

export function toRequestMessage(message: RequestMessageWithAuthor): RequestMessageDto {
  const author = message.author ?? message.clientAuthor;
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    author: {
      // The membership id of a staff author, and null for a client contact — the thread
      // shows a name, and a contact has no membership to name.
      membershipId: message.authorMembershipId,
      displayName: author ? displayNameOf(author.account) : null,
    },
  };
}

export function toRequestEvent(event: RequestEventWithActor): RequestEventDto {
  return {
    id: event.id,
    action: event.action,
    field: event.field,
    oldValue: event.oldValue,
    newValue: event.newValue,
    oldLabel: event.oldLabel,
    newLabel: event.newLabel,
    createdAt: event.createdAt.toISOString(),
    actor: {
      membershipId: event.actorMembershipId,
      displayName: (event.actor ?? event.clientActor)
        ? displayNameOf((event.actor ?? event.clientActor)!.account)
        : null,
    },
  };
}

export function toRequestDetail(
  row: RequestWithRelations,
  messages: RequestMessageWithAuthor[],
  events: RequestEventWithActor[],
  today: string,
): RequestDetailDto {
  return {
    request: toRequestRow(row, today),
    messages: messages.map(toRequestMessage),
    events: events.map(toRequestEvent),
  };
}

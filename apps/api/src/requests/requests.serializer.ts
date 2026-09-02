import { isRequestOverdue } from '@devscribed/validation';
import type { Prisma } from '@prisma/client';
import type {
  RequestDetailDto,
  RequestEventDto,
  RequestMessageDto,
  RequestRowDto,
} from './requests.dto';

/**
 * Everything the wire shape needs, and nothing else. Declared once as a Prisma
 * validator so the query and the serializer cannot drift apart.
 */
export const REQUEST_ROW_INCLUDE = {
  project: { select: { id: true, name: true } },
  requester: {
    select: { id: true, status: true, account: { select: { firstName: true, lastName: true } } },
  },
  assignee: {
    select: { id: true, status: true, account: { select: { firstName: true, lastName: true } } },
  },
  _count: { select: { messages: true } },
} satisfies Prisma.RequestInclude;

export type RequestWithRelations = Prisma.RequestGetPayload<{
  include: typeof REQUEST_ROW_INCLUDE;
}>;

export const REQUEST_MESSAGE_INCLUDE = {
  author: { select: { id: true, account: { select: { firstName: true, lastName: true } } } },
} satisfies Prisma.RequestMessageInclude;

export type RequestMessageWithAuthor = Prisma.RequestMessageGetPayload<{
  include: typeof REQUEST_MESSAGE_INCLUDE;
}>;

export const REQUEST_EVENT_INCLUDE = {
  actor: { select: { id: true, account: { select: { firstName: true, lastName: true } } } },
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
    assignee: {
      kind: row.assigneeKind,
      id: row.assigneeMembershipId,
      displayName: row.assignee ? displayNameOf(row.assignee.account) : null,
      // Member removal is a soft delete (`status = 'removed'`), so this is a status read
      // and never a null FK — requirement 36 and edge case 11.
      inactive: row.assignee ? row.assignee.status !== 'active' : true,
    },
    createdAt: row.createdAt.toISOString(),
    lastActivityAt: row.lastActivityAt.toISOString(),
    answeredAt: row.answeredAt ? row.answeredAt.toISOString() : null,
    resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
    messageCount: row._count.messages,
  };
}

export function toRequestMessage(message: RequestMessageWithAuthor): RequestMessageDto {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    author: {
      membershipId: message.authorMembershipId,
      displayName: message.author ? displayNameOf(message.author.account) : null,
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
      displayName: event.actor ? displayNameOf(event.actor.account) : null,
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

import type { RequestCard } from './vacation-request-feed.service';

/** The project block on a request row; `null` when the request names no project. */
export interface RequestProjectDto {
  id: string;
  name: string;
}

/** Who raised the request. */
export interface RequestRequesterDto {
  membershipId: string;
  displayName: string;
}

/**
 * Who the request is addressed to. `kind` is `member` or, since requests spec 03,
 * `client`; `inactive` is a read of that row's status, not a column — removal is a soft
 * delete on both sides, so the FK's SetNull never fires (requirement 36, REQ-03-026).
 *
 * `clientName` is the addressee's client, present for a client addressee and `null` for
 * a colleague. The contact's email address is never carried here.
 */
export interface RequestAssigneeDto {
  kind: string;
  id: string | null;
  displayName: string | null;
  clientName: string | null;
  inactive: boolean;
}

/**
 * Requests spec 02 — the topic a request was raised under.
 *
 * `name` is the snapshot `topicLabel`, not the catalogue's current name. The other four
 * are read from the row `topicId` names and are all `null` when a label outlives its
 * `topicId`, which is why the member is keyed on the label rather than on the id.
 */
export interface RequestTopicMemberDto {
  id: string | null;
  name: string;
  audience: string | null;
  type: string | null;
  status: string | null;
}

/** One row of the request list, and the body of every write route's response. */
export interface RequestRowDto {
  id: string;
  number: number;
  type: string;
  accessKind: string | null;
  /** `null` exactly when the request carries no `topicLabel` (requests spec 02). */
  topic: RequestTopicMemberDto | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  blocking: boolean;
  /** Derived per reading account's timezone; no column holds it (requirement 33). */
  overdue: boolean;
  /** 'YYYY-MM-DD' or null. */
  neededBy: string | null;
  project: RequestProjectDto | null;
  requester: RequestRequesterDto;
  assignee: RequestAssigneeDto;
  createdAt: string;
  lastActivityAt: string;
  answeredAt: string | null;
  resolvedAt: string | null;
  messageCount: number;
}

/** One message in the thread. */
export interface RequestMessageDto {
  id: string;
  body: string;
  createdAt: string;
  author: { membershipId: string | null; displayName: string | null };
}

/** One entry of the history panel. */
export interface RequestEventDto {
  id: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  oldLabel: string | null;
  newLabel: string | null;
  createdAt: string;
  actor: { membershipId: string | null; displayName: string | null };
}

/** `GET …/requests/{requestId}` — the row, the thread and the trail. */
export interface RequestDetailDto {
  request: RequestRowDto;
  messages: RequestMessageDto[];
  events: RequestEventDto[];
}

/**
 * `GET …/requests` — the two sections composed into one response. `vacation` is present
 * only for a caller holding `view-requests`; both counters ignore every filter.
 */
export interface RequestsListDto {
  requests: RequestRowDto[];
  vacation?: { requests: RequestCard[]; pendingCount: number };
  counts: { waitingOnMe: number; total: number };
}

/**
 * `GET …/request-contacts` — one addressee the caller may raise a request to
 * (REQ-03-043): an active contact of a client that owns a project the caller works on.
 */
export interface RequestContactDto {
  id: string;
  displayName: string;
  clientId: string;
  clientName: string;
}

/** `GET …/request-contacts` — the contacts a requester may choose from, and no others. */
export interface RequestContactsDto {
  contacts: RequestContactDto[];
}

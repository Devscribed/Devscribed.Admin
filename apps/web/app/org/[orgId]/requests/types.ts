import type { VacationRequestStatus } from '@devscribed/validation';

/** Member summary embedded in each org-wide vacation card (spec 10). */
export interface OrgRequestMember {
  membershipId: string;
  firstName: string;
  lastName: string;
  initials: string;
  avatarUrl: string | null;
}

/** The member's vacation balance snapshot carried on each vacation card. */
export interface OrgRequestBalance {
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

/**
 * One vacation row of `GET /api/organizations/{orgId}/requests` (spec 10). Structurally a
 * superset of spec 09's `VacationRequest`, so a value of this type is assignable to the
 * reused `RejectRequestModal`'s `request` prop. Unchanged by requests spec 01 — only the
 * key it arrives under moved, from `requests` to `vacation.requests`.
 */
export interface OrgRequest {
  id: string;
  type: 'vacation';
  member: OrgRequestMember;
  /** 'YYYY-MM-DD'. */
  startDate: string;
  /** 'YYYY-MM-DD'. */
  endDate: string;
  workingDays: number;
  deductionAmount: number;
  status: VacationRequestStatus;
  requestedAt: string;
  reviewedAt: string | null;
  /** Account id of the reviewer (not a display name). */
  reviewedBy: string | null;
  reviewerComment: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  memberBalance: OrgRequestBalance;
}

/* ------------------------------------------------------------------ *
 * Requests spec 01
 * ------------------------------------------------------------------ */

export interface RequestProject {
  id: string;
  name: string;
}

export interface RequestAssignee {
  kind: string;
  id: string | null;
  displayName: string | null;
  /** The addressee's membership is no longer active (requirement 36). */
  inactive: boolean;
}

/** One request row — the list row and the body of every write route's response. */
export interface RequestRowData {
  id: string;
  number: number;
  type: string;
  accessKind: string | null;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  /** Derived by the server in the reading account's timezone; no column holds it. */
  overdue: boolean;
  blocking: boolean;
  neededBy: string | null;
  project: RequestProject | null;
  requester: { membershipId: string; displayName: string };
  assignee: RequestAssignee;
  createdAt: string;
  lastActivityAt: string;
  answeredAt: string | null;
  resolvedAt: string | null;
  messageCount: number;
}

export interface RequestMessageData {
  id: string;
  body: string;
  createdAt: string;
  author: { membershipId: string | null; displayName: string | null };
}

export interface RequestEventData {
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

export interface RequestDetailData {
  request: RequestRowData;
  messages: RequestMessageData[];
  events: RequestEventData[];
}

/**
 * `GET /api/organizations/{orgId}/requests`. `vacation` is present only for a caller
 * holding `view-requests`; both counters ignore every filter, which is what lets the page
 * tell "you have none" from "the filters excluded them".
 */
export interface OrgRequestsResponse {
  requests: RequestRowData[];
  vacation?: { requests: OrgRequest[]; pendingCount: number };
  counts: { waitingOnMe: number; total: number };
}

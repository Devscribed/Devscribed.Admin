import type { VacationRequestStatus } from '@devscribed/validation';

/** Member summary embedded in each org-wide request card (spec 10). */
export interface OrgRequestMember {
  membershipId: string;
  firstName: string;
  lastName: string;
  initials: string;
  avatarUrl: string | null;
}

/** The member's vacation balance snapshot carried on each request. */
export interface OrgRequestBalance {
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

/**
 * One row of `GET /api/organizations/{orgId}/requests` (spec 10). Structurally a
 * superset of spec 09's `VacationRequest`, so a value of this type is assignable to the
 * reused `RejectRequestModal`'s `request` prop.
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

export interface OrgRequestsResponse {
  requests: OrgRequest[];
  pendingCount: number;
  totalCount: number;
}

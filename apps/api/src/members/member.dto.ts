import { MembershipStatus, Role } from '@devscribed/shared';

/** A member row as returned to the client (spec 05 / spec 01 E2E). */
export interface MemberDto {
  /** membership id — the stable row identifier used by `member-row-{id}` */
  id: string;
  accountId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  role: Role;
  status: MembershipStatus;
  joinedAt: string;
}

/** The members-list response, including whether the caller may manage members. */
export interface MembersListResponse {
  members: MemberDto[];
  /** admin/manager may act on rows; user/viewer are read-only (spec 03). */
  canManage: boolean;
}

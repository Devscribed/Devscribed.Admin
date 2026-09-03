import type { Role } from '@devscribed/validation';

/**
 * Shape of one entry in `GET /api/organizations/{orgId}/members`'s `members` array
 * (`apps/api/src/members/members.service.ts`, `MemberListItem`). `jobTitle` is part
 * of the real response but unused on this screen — it belongs to spec 05's detail
 * page — kept here anyway so this type stays a faithful mirror of the API contract.
 */
export interface Member {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  status: 'active' | 'removed';
  joinedAt: string;
  isLastAdmin: boolean;
  isSelf: boolean;
  jobTitle: string | null;
}

export interface MemberListResponse {
  members: Member[];
  callerRole: Role;
}

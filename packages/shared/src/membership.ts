import { MembershipStatus, Role } from './enums';

/**
 * The role/status/joined attributes for a new membership, independent of the
 * account/organization identifiers the persistence layer attaches.
 */
export interface CreatorMembershipInput {
  role: Role;
  status: MembershipStatus;
  joinedAt: Date;
}

/**
 * The membership granted to the person who creates an organization at signup
 * (spec 01, requirements 5–6): the creator is the organization's first `admin`
 * with an `active` membership. There is no separate "owner" concept.
 *
 * @param joinedAt when the membership was created (defaults to now).
 */
export function createAdminMembershipInput(joinedAt: Date = new Date()): CreatorMembershipInput {
  return {
    role: Role.Admin,
    status: MembershipStatus.Active,
    joinedAt,
  };
}

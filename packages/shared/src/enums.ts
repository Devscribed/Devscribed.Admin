/**
 * The closed set of membership roles (spec 03 — Roles & Permissions).
 * Every active membership carries exactly one of these values.
 */
export enum Role {
  Admin = 'admin',
  Manager = 'manager',
  User = 'user',
  Viewer = 'viewer',
}

/**
 * The two member states (spec 05 — Member List & Management).
 * Delete is a soft-delete → `removed`; Restore returns → `active`.
 */
export enum MembershipStatus {
  Active = 'active',
  Removed = 'removed',
}

/**
 * Invitation lifecycle states (spec 03 — User Invitation).
 * `pending` → acceptable; `used` → accepted; `invalidated` → superseded by a
 * re-invite or the inviter was removed.
 */
export enum InvitationStatus {
  Pending = 'pending',
  Used = 'used',
  Invalidated = 'invalidated',
}

/** All role values, in declaration order. */
export const ROLES: readonly Role[] = Object.values(Role);

/** All membership-status values, in declaration order. */
export const MEMBERSHIP_STATUSES: readonly MembershipStatus[] = Object.values(MembershipStatus);

/** Type guard: is `value` a member of the {@link Role} enum? */
export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Type guard: is `value` a member of the {@link MembershipStatus} enum? */
export function isMembershipStatus(value: unknown): value is MembershipStatus {
  return typeof value === 'string' && (MEMBERSHIP_STATUSES as readonly string[]).includes(value);
}

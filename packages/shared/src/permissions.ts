import { Role } from './enums';

/**
 * Permission rules for the user-management surface. Originally a standalone
 * "Roles & Permissions" spec, these are now shared helpers referenced by
 * invitation (spec 03), the member list (spec 04), and member detail (spec 05).
 */

/** Roles allowed to invite members / manage the member list (spec 03/04). */
export function canInvite(role: Role): boolean {
  return role === Role.Admin || role === Role.Manager;
}

/**
 * The roles an inviter of the given role may assign to an invitation
 * (spec 03, requirement 4): an `admin` may assign any role; a `manager` may
 * assign any non-admin role; `user`/`viewer` may assign none.
 */
export function assignableRoles(inviterRole: Role): Role[] {
  if (inviterRole === Role.Admin) {
    return [Role.Admin, Role.Manager, Role.User, Role.Viewer];
  }
  if (inviterRole === Role.Manager) {
    return [Role.Manager, Role.User, Role.Viewer];
  }
  return [];
}

/** Whether an inviter may assign the target role (spec 03, requirement 4). */
export function canAssignRole(inviterRole: Role, targetRole: Role): boolean {
  return assignableRoles(inviterRole).includes(targetRole);
}

import type { PrincipalKind } from '@devscribed/validation';

/**
 * Requests spec 03 — who is calling, resolved from the database on every request.
 *
 * The session cookie's fields are unchanged: it carries an account, an organization and
 * a security stamp, and nothing about which kind of principal the account holds. That is
 * read per request, exactly as the role already is, so a cookie cannot assert a
 * principal it was not issued for and no cookie minted before this spec becomes invalid.
 */

/** A member of staff: an active `Membership` of the session's organization. */
export interface MemberPrincipal {
  kind: 'member';
  accountId: string;
  organizationId: string;
  membershipId: string;
  /** The raw `Membership.role` column — normalized at the point it is asked about. */
  role: string;
}

/** A client contact: an active `ClientMembership` of the session's organization. */
export interface ClientPrincipal {
  kind: 'client';
  accountId: string;
  organizationId: string;
  clientMembershipId: string;
  clientId: string;
}

export type SessionPrincipal = MemberPrincipal | ClientPrincipal;

export type { PrincipalKind };

/**
 * REQ-03-002 — at most one principal per account, and the staff row wins.
 *
 * The rows handed in are already filtered to the ones that count: an active
 * `Membership`, and a `ClientMembership` whose status is read here. Anything else
 * resolves to no principal at all, which is the state a removed member of staff is
 * already in and which every service below already refuses.
 */
export function resolvePrincipal(input: {
  accountId: string;
  organizationId: string;
  memberships: Array<{ id: string; organizationId: string; role: string; status: string }>;
  clientMembership: { id: string; organizationId: string; clientId: string; status: string } | null;
}): SessionPrincipal | null {
  const membership = input.memberships.find(
    (row) => row.status === 'active' && row.organizationId === input.organizationId,
  );
  if (membership) {
    return {
      kind: 'member',
      accountId: input.accountId,
      organizationId: input.organizationId,
      membershipId: membership.id,
      role: membership.role,
    };
  }

  const contact = input.clientMembership;
  if (contact && contact.status === 'active' && contact.organizationId === input.organizationId) {
    return {
      kind: 'client',
      accountId: input.accountId,
      organizationId: input.organizationId,
      clientMembershipId: contact.id,
      clientId: contact.clientId,
    };
  }

  return null;
}

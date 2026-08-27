import { NotFoundException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { normalizeRole } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { SESSION_COOKIE, SessionService } from '../auth/session.service';

/**
 * The one fence in front of every test-support route.
 *
 * These routes exist because the product has no invite flow, no mailbox, and no way to
 * advance the clock, so an E2E run cannot build its own preconditions through the product
 * alone. They are fixtures, not features, and **user-management spec 04 retires most of
 * them**.
 *
 * Three gates, in order:
 *
 *  1. Outside production there is no token at all. A developer's machine is not a target,
 *     and demanding a secret there would only get one committed to a `.env.example`.
 *  2. In production a bearer token is required, and an unset token means shut. Shut is the
 *     default everywhere it is not deliberately opened — `prod.tfvars` sets
 *     `test_fixtures_enabled = false`, so no parameter is created, nothing is injected,
 *     and no value of any other variable can open these routes there.
 *  3. Holding the token is still not authority over an organization. Every fixture that
 *     writes also requires a session that is an active **admin of the organization it
 *     writes to** — see `resolveFixtureScope`. The token says "this environment is a
 *     test stand"; the session says "and you already run this organization".
 *
 * Gate 3 is what makes the difference between a fixture and a privilege-escalation
 * endpoint. Without it, one leaked token would make its holder an admin of every
 * organization on the stand; with it, the worst it buys is a change inside an
 * organization they can already administer.
 *
 * Understand what enabling these costs before doing so: the mail sink hands out every live
 * signing link the environment has issued, and that is true no matter how the write side
 * is fenced.
 */
export function assertFixturesOpen(authorization?: string): void {
  if (process.env.NODE_ENV !== 'production') return;

  const expected = process.env.TEST_FIXTURE_SECRET;
  if (!expected) throw new NotFoundException();

  const offered = (authorization ?? '').replace(/^Bearer /i, '');
  // Length first: timingSafeEqual throws on a mismatch rather than returning false, and
  // the length is not the secret.
  if (offered.length !== expected.length) throw new NotFoundException();
  if (!timingSafeEqual(Buffer.from(offered), Buffer.from(expected))) {
    throw new NotFoundException();
  }
}

/**
 * The read-only half of the affordance — the `/dev` console's organization picker — which
 * lists every organization in the environment and is therefore **never** opened by the
 * token. A test stand's own console is a local thing; enumerating a deployment's tenants
 * from the internet is not, and the E2E suite has no need of it.
 */
export function assertLocalOnly(): void {
  if (process.env.NODE_ENV === 'production') throw new NotFoundException();
}

/**
 * Gate 3, and the organization a fixture is allowed to write to.
 *
 * **In production the caller must already be an active admin of it**, proved by their own
 * session — the token says "this environment is a test stand", the session says "and you
 * already run this organization". Without that second half one leaked token would make its
 * holder an admin of every organization on the stand; with it, the worst it buys is a
 * change inside an organization they can already administer. That is the whole difference
 * between a fixture and a privilege-escalation endpoint.
 *
 * **Outside production there is no fence**, exactly as in `assertFixturesOpen` and for the
 * same reason. The caller gets whichever organization they named and `null` if they named
 * none, which is what keeps the `/dev` console working: a developer signed in to one
 * organization switches roles in another all the time, and demanding a matching session
 * there would break the tool without protecting anything.
 *
 * Deliberately not `@UseGuards(SessionGuard)`. Guards run before the handler, so a missing
 * cookie would answer 401 — and a 401 from a route that is meant to be invisible tells an
 * unauthenticated stranger that the route exists. Resolving the session here, after the
 * token check, keeps 404 the only answer these routes ever give.
 *
 * `orgId` is checked against the session rather than used as a selector, the same rule
 * `OrgScopeGuard` enforces: an id in a body never widens what the caller can touch. It is
 * accepted at all so the call site stays readable about which organization it means.
 */
export async function resolveFixtureScope(
  prisma: PrismaService,
  sessions: SessionService,
  request: Request & { cookies?: Record<string, string> },
  orgId?: string,
): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') return orgId ?? null;

  const session = sessions.verify(request.cookies?.[SESSION_COOKIE]);
  if (!session) throw new NotFoundException();
  if (orgId !== undefined && orgId !== session.organizationId) throw new NotFoundException();

  const account = await prisma.account.findUnique({
    where: { id: session.accountId },
    select: { securityStamp: true },
  });
  // The same revocation check `SessionGuard` makes. A fixture route that honoured a
  // revoked session would be a way to keep using one.
  if (!account || account.securityStamp !== session.securityStamp) throw new NotFoundException();

  const membership = await prisma.membership.findFirst({
    where: {
      accountId: session.accountId,
      organizationId: session.organizationId,
      status: 'active',
    },
    select: { role: true },
  });
  if (!membership || normalizeRole(membership.role) !== 'admin') throw new NotFoundException();

  return session.organizationId;
}

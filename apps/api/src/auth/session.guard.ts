import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { resolvePrincipal, type SessionPrincipal } from './principal';
import { SESSION_COOKIE, SessionPayload, SessionService } from './session.service';

export type AuthenticatedRequest = Request & {
  session?: SessionPayload;
  /**
   * Requests spec 03 — which kind of principal the session resolves to, read from the
   * database on every request. `undefined` when the account holds none in this
   * organization, which is the state a removed member is already in.
   */
  principal?: SessionPrincipal;
};

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly sessions: SessionService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = this.sessions.verify(request.cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException('Not signed in');

    // A valid signature only proves the cookie is ours, not that it is still good.
    // Re-reading the stamp is what makes revocation instant (requirement 12).
    //
    // The memberships come back in the same query rather than in a second one: the
    // principal kind is a per-request read, so it rides the read that already happens.
    const account = await this.prisma.account.findUnique({
      where: { id: session.accountId },
      select: {
        securityStamp: true,
        memberships: {
          where: { status: 'active' },
          select: { id: true, organizationId: true, role: true, status: true },
        },
        clientMembership: {
          select: { id: true, organizationId: true, clientId: true, status: true },
        },
      },
    });
    if (!account || account.securityStamp !== session.securityStamp) {
      throw new UnauthorizedException('Not signed in');
    }

    request.session = session;
    request.principal =
      resolvePrincipal({
        accountId: session.accountId,
        organizationId: session.organizationId,
        memberships: account.memberships,
        clientMembership: account.clientMembership,
      }) ?? undefined;
    return true;
  }
}

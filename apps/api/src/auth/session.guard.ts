import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { SESSION_COOKIE, SessionPayload, SessionService } from './session.service';

export type AuthenticatedRequest = Request & { session?: SessionPayload };

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
    const account = await this.prisma.account.findUnique({
      where: { id: session.accountId },
      select: { securityStamp: true },
    });
    if (!account || account.securityStamp !== session.securityStamp) {
      throw new UnauthorizedException('Not signed in');
    }

    request.session = session;
    return true;
  }
}

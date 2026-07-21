import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { SESSION_COOKIE, SessionPayload, SessionService } from './session.service';

export type AuthenticatedRequest = Request & { session?: SessionPayload };

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const session = this.sessions.verify(request.cookies?.[SESSION_COOKIE]);
    if (!session) throw new UnauthorizedException('Not signed in');
    request.session = session;
    return true;
  }
}

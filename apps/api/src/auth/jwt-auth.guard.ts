import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { SessionPayload } from './session.service';

type AuthedRequest = Request & {
  user?: SessionPayload;
  cookies?: Record<string, string>;
};

/**
 * Authenticates a request from its session cookie or `Authorization: Bearer`
 * header and attaches the decoded {@link SessionPayload} as `req.user`. Server-side
 * enforcement is the security boundary (spec 03, requirement 7).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly cookieName = process.env.SESSION_COOKIE_NAME ?? 'ds_session';

  constructor(private readonly jwt: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const authHeader = req.headers.authorization;
    const fromBearer =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = req.cookies?.[this.cookieName] ?? fromBearer;

    if (!token) {
      throw new UnauthorizedException();
    }
    try {
      req.user = this.jwt.verify<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }
    return true;
  }
}

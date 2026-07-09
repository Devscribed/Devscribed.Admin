import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { MembershipStatus } from '@devscribed/shared';
import { Membership } from '../entities/membership.entity';
import { SessionPayload } from './session.service';

type AuthedRequest = Request & {
  user?: SessionPayload;
  cookies?: Record<string, string>;
};

/**
 * Authenticates a request from its session cookie or `Authorization: Bearer`
 * header and attaches the decoded {@link SessionPayload} as `req.user`. Beyond
 * verifying the JWT signature, it confirms against the database that:
 *  - the caller still holds an `active` membership in the token's organization
 *    (a `removed` member loses access — specs 02/05), and
 *  - the account's `tokenVersion` still matches the token's `ver` (a password
 *    reset revokes older sessions — spec 02, requirement 9).
 *
 * Server-side enforcement is the security boundary (spec 03, requirement 7).
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly cookieName = process.env.SESSION_COOKIE_NAME ?? 'ds_session';

  constructor(
    private readonly jwt: JwtService,
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const authHeader = req.headers.authorization;
    const fromBearer =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = req.cookies?.[this.cookieName] ?? fromBearer;

    if (!token) {
      throw new UnauthorizedException();
    }

    let payload: SessionPayload;
    try {
      payload = this.jwt.verify<SessionPayload>(token);
    } catch {
      throw new UnauthorizedException();
    }

    const membership = await this.memberships.findOne({
      where: {
        accountId: payload.sub,
        organizationId: payload.orgId,
        status: MembershipStatus.Active,
      },
      relations: { account: true },
    });
    if (!membership || membership.account.tokenVersion !== payload.ver) {
      throw new UnauthorizedException();
    }

    req.user = payload;
    return true;
  }
}

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Response } from 'express';
import { Role } from '@devscribed/shared';

/** The authenticated identity carried by a session token (spec 02, requirement 1). */
export interface SessionPayload {
  /** account id */
  sub: string;
  /** current organization id */
  orgId: string;
  /** role within the current organization */
  role: Role;
  email: string;
  /** account security stamp at issuance; the guard rejects stale stamps (spec 02, req 12). */
  stamp: string;
}

/**
 * Issues session tokens and attaches them as an httpOnly cookie. Signup (spec 01)
 * and login (spec 02) both establish a session scoped to the user's current
 * organization and role.
 */
@Injectable()
export class SessionService {
  private readonly cookieName = process.env.SESSION_COOKIE_NAME ?? 'ds_session';
  private readonly ttlSeconds = Number(process.env.SESSION_TTL ?? 86400);

  constructor(private readonly jwt: JwtService) {}

  /** Sign a token, set it as an httpOnly cookie on the response, and return it. */
  issue(res: Response, payload: SessionPayload): string {
    const token = this.jwt.sign(payload);
    res.cookie(this.cookieName, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: this.ttlSeconds * 1000,
    });
    return token;
  }

  /** Clear the session cookie (logout). */
  clear(res: Response): void {
    res.clearCookie(this.cookieName, { path: '/' });
  }
}

import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { CookieOptions, Response } from 'express';

export const SESSION_COOKIE = 'ds_session';

export interface SessionPayload {
  accountId: string;
  organizationId: string;
  /**
   * Snapshot of the account's stamp at sign-in. Re-checked against the database on
   * every authenticated request, so revoking sessions is a single column write.
   */
  securityStamp: string;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SessionService {
  constructor(private readonly jwt: JwtService) {}

  /** Signs the session and puts it in an httpOnly cookie — never readable from JS. */
  issue(res: Response, payload: SessionPayload): void {
    const token = this.jwt.sign(payload, { expiresIn: '7d' });
    res.cookie(SESSION_COOKIE, token, this.cookieOptions());
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  verify(token: string | undefined): SessionPayload | null {
    if (!token) return null;
    try {
      const { accountId, organizationId, securityStamp } =
        this.jwt.verify<SessionPayload>(token);
      // A cookie minted before the stamp existed has no business authenticating.
      if (!securityStamp) return null;
      return { accountId, organizationId, securityStamp };
    } catch {
      return null;
    }
  }

  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: MAX_AGE_MS,
    };
  }
}

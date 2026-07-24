import { Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SessionService } from './session.service';

@Controller('api/logout')
export class LogoutController {
  constructor(private readonly sessions: SessionService) {}

  /**
   * Drops the session cookie. Deliberately unguarded: a caller with an expired or
   * missing cookie is already in the state logout aims for, and answering 401 would
   * only leave a stale cookie in place on the one client that most needs it gone.
   *
   * This ends the session on *this* browser. It does not invalidate the signed token
   * itself — that is what `securityStamp` rotation is for (spec 02 requirement 12),
   * and rotating it here would sign the account out of every other device too.
   */
  @Post()
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response): void {
    this.sessions.clear(res);
  }
}

import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { SessionService } from '../auth/session.service';
import type { InviteAcceptDto, InviteCreateDto } from './invitations.dto';
import { InvitationsService } from './invitations.service';

@Controller('api')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Authenticated, `admin`/`manager` only. Deliberately has no `:orgId` in its path —
   * the inviting organization comes entirely from the caller's session, so there is
   * nothing for an `OrgScopeGuard` to compare against.
   */
  @Post('invitations')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async create(@Req() req: AuthenticatedRequest, @Body() dto: InviteCreateDto) {
    await this.invitations.createInvitation(req.session!, dto);
    return { message: 'Invitation sent' };
  }

  /** Public — the invitee may not be signed in yet. */
  @Get('invitations/:token/validate')
  @HttpCode(200)
  async validate(@Param('token') token: string) {
    return this.invitations.validateToken(token);
  }

  /** Public — sets the auth cookie on success, same as login/signup. */
  @Post('invitations/accept')
  @HttpCode(200)
  async accept(@Body() dto: InviteAcceptDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.invitations.accept(dto);
    this.sessions.issue(res, {
      accountId: result.accountId,
      organizationId: result.organizationId,
      securityStamp: result.securityStamp,
    });
    return { accountId: result.accountId, redirectTo: '/members' };
  }
}

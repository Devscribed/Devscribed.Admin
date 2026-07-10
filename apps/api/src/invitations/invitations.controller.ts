import { Body, Controller, Get, HttpCode, Param, Post, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionPayload, SessionService } from '../auth/session.service';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';

@Controller('invitations')
export class InvitationsController {
  constructor(
    private readonly invitations: InvitationsService,
    private readonly session: SessionService,
  ) {}

  /** POST /api/invitations — create and send an invitation (admin/manager only). */
  @Post()
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async create(@CurrentUser() user: SessionPayload, @Body() dto: CreateInvitationDto) {
    await this.invitations.create(user, dto);
    return { message: 'Invitation sent' };
  }

  /** GET /api/invitations/:token/validate — inspect a token for the accept screen (public). */
  @Get(':token/validate')
  validate(@Param('token') token: string) {
    return this.invitations.validate(token);
  }

  /** POST /api/invitations/accept — accept an invitation (public); establishes a session. */
  @Post('accept')
  @HttpCode(200)
  async accept(@Body() dto: AcceptInvitationDto, @Res({ passthrough: true }) res: Response) {
    const { account, organization, membership } = await this.invitations.accept(dto);
    this.session.issue(res, {
      sub: account.id,
      orgId: organization.id,
      role: membership.role,
      email: account.email,
      stamp: account.securityStamp,
    });
    return { accountId: account.id, redirectTo: '/members' };
  }
}

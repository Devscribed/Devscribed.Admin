import { Body, Controller, Get, HttpCode, Post, Put, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { SessionService } from '../auth/session.service';
import { AccountService } from './account.service';
import type {
  ChangeEmailDto,
  ChangePasswordDto,
  ConfirmEmailDto,
  UpdateSettingsDto,
} from './account.dto';

@Controller('api/account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly sessions: SessionService,
  ) {}

  @Get('settings')
  @UseGuards(SessionGuard)
  async getSettings(@Req() req: AuthenticatedRequest) {
    return this.account.getSettings(req.session!);
  }

  @Put('settings')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async updateSettings(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSettingsDto) {
    return this.account.updateSettings(req.session!, dto);
  }

  @Post('change-email')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async changeEmail(@Req() req: AuthenticatedRequest, @Body() dto: ChangeEmailDto) {
    return this.account.changeEmail(req.session!, dto);
  }

  /** Public — the token alone is sufficient (requirement 8). No guard. */
  @Post('confirm-email')
  @HttpCode(200)
  async confirmEmail(@Body() dto: ConfirmEmailDto) {
    return this.account.confirmEmail(dto);
  }

  @Post('change-password')
  @UseGuards(SessionGuard)
  @HttpCode(200)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() dto: ChangePasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { message, accountId, organizationId, securityStamp } =
      await this.account.changePassword(req.session!, dto);
    // Re-issue the current session's cookie with the fresh stamp so this device stays
    // signed in while every other outstanding cookie is invalidated (requirement 3).
    this.sessions.issue(res, { accountId, organizationId, securityStamp });
    return { message };
  }
}

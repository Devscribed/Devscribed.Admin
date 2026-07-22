import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SessionService } from '../auth/session.service';
import type { SignupDto } from './signup.dto';
import { SignupService } from './signup.service';

@Controller('api/signup')
export class SignupController {
  constructor(
    private readonly signupService: SignupService,
    private readonly sessions: SessionService,
  ) {}

  @Post()
  @HttpCode(201)
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const result = await this.signupService.signup(dto);
    this.sessions.issue(res, {
      accountId: result.accountId,
      organizationId: result.organizationId,
      securityStamp: result.securityStamp,
    });
    return { account: result.account, organization: result.organization };
  }
}

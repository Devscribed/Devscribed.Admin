import { Body, Controller, HttpCode, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { LoginDto } from './login.dto';
import { LoginService } from './login.service';
import { SessionService } from './session.service';

@Controller('api/login')
export class LoginController {
  constructor(
    private readonly loginService: LoginService,
    private readonly sessions: SessionService,
  ) {}

  @Post()
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accountId, organizationId, securityStamp } = await this.loginService.login(dto);
    this.sessions.issue(res, { accountId, organizationId, securityStamp });
    // The organization is in the cookie too, but the cookie is httpOnly — the client
    // needs it in the body to know which /org/{id}/… route to land on.
    return { accountId, organizationId };
  }
}

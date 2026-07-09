import { Body, Controller, Post, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SignupDto } from './dto/signup.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * POST /api/auth/signup — create the account, organization, and admin
   * membership, then establish a session so the creator lands authenticated in
   * their new organization (spec 01, requirement 8).
   */
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const { account, organization, membership } = await this.auth.signup(dto);
    const token = this.session.issue(res, {
      sub: account.id,
      orgId: organization.id,
      role: membership.role,
      email: account.email,
    });

    return {
      token,
      user: {
        id: account.id,
        email: account.email,
        firstName: account.firstName,
        lastName: account.lastName,
        role: membership.role,
      },
      organization: {
        id: organization.id,
        name: organization.name,
      },
    };
  }
}

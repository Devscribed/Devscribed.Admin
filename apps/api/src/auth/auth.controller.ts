import { Body, Controller, Get, HttpCode, Post, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { AuthContext, AuthService } from './auth.service';
import { SessionService } from './session.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

const NEUTRAL_FORGOT_MESSAGE = 'If an account exists, a reset link has been sent.';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly session: SessionService,
  ) {}

  /**
   * POST /api/auth/signup — create the account, organization, and admin
   * membership, then establish a session (spec 01, requirement 8).
   */
  @Post('signup')
  async signup(@Body() dto: SignupDto, @Res({ passthrough: true }) res: Response) {
    const context = await this.auth.signup(dto);
    return this.establishSession(res, context);
  }

  /** POST /api/auth/login — authenticate and establish a session (spec 02). */
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const context = await this.auth.login(dto);
    return this.establishSession(res, context);
  }

  /** POST /api/auth/logout — clear the session cookie. */
  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    this.session.clear(res);
    return { success: true };
  }

  /** POST /api/auth/forgot-password — always answers neutrally (spec 02, req 7). */
  @Post('forgot-password')
  @HttpCode(200)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.auth.forgotPassword(dto);
    return { message: NEUTRAL_FORGOT_MESSAGE };
  }

  /** GET /api/auth/reset-password/validate?token=… — check a token before showing the form. */
  @Get('reset-password/validate')
  async validateResetToken(@Query('token') token?: string) {
    return { valid: await this.auth.isResetTokenValid(token ?? '') };
  }

  /** POST /api/auth/reset-password — set a new password from a valid token (spec 02). */
  @Post('reset-password')
  @HttpCode(200)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.auth.resetPassword(dto);
    return { message: 'Your password has been reset' };
  }

  private establishSession(res: Response, { account, organization, membership }: AuthContext) {
    const token = this.session.issue(res, {
      sub: account.id,
      orgId: organization.id,
      role: membership.role,
      email: account.email,
      stamp: account.securityStamp,
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

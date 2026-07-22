import { Body, Controller, Get, HttpCode, Post, Query } from '@nestjs/common';
import { AUTH_MESSAGES } from '@devscribed/validation';
import type { ResetPasswordInput } from './password-reset.service';
import { PasswordResetService } from './password-reset.service';

@Controller('api/forgot-password')
export class ForgotPasswordController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  @Post()
  @HttpCode(200)
  async forgotPassword(@Body() body: { email?: unknown }) {
    await this.passwordReset.requestReset(body?.email);
    return { message: AUTH_MESSAGES.resetLinkSent };
  }
}

@Controller('api/reset-password')
export class ResetPasswordController {
  constructor(private readonly passwordReset: PasswordResetService) {}

  /**
   * Always 200 — validity lives in the body, so a dead link is a normal answer
   * rather than an error to be logged or retried.
   */
  @Get('validate')
  @HttpCode(200)
  async validate(@Query('token') token?: string) {
    return { valid: await this.passwordReset.isTokenUsable(token) };
  }

  @Post()
  @HttpCode(200)
  async resetPassword(@Body() body: ResetPasswordInput) {
    await this.passwordReset.resetPassword(body ?? {});
    return { message: AUTH_MESSAGES.resetSuccess };
  }
}

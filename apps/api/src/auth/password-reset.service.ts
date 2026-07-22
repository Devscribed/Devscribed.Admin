import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AUTH_MESSAGES, normalizeEmail, validatePassword } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import {
  generateResetToken,
  hashResetToken,
  isResetTokenUsable,
  resetTokenExpiry,
} from './reset-token';

const BCRYPT_ROUNDS = 12;

export interface ResetPasswordInput {
  token?: unknown;
  password?: unknown;
  passwordConfirmation?: unknown;
}

@Injectable()
export class PasswordResetService {
  private readonly logger = new Logger(PasswordResetService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * Always resolves. Whether the address is registered, belongs to a removed member,
   * or the transport falls over, the caller gets the same neutral answer — anything
   * else would turn this endpoint into an account-existence oracle (requirement 7).
   */
  async requestReset(rawEmail: unknown): Promise<void> {
    const email = normalizeEmail(typeof rawEmail === 'string' ? rawEmail : '');
    if (email.length === 0) {
      throw new BadRequestException({ message: AUTH_MESSAGES.emailRequired });
    }

    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { memberships: { where: { status: 'active' } } },
    });

    // No account, or no active membership — nothing to send, but say the same thing.
    if (!account || account.memberships.length === 0) return;

    const { token, tokenHash } = generateResetToken();
    const createdAt = new Date();

    await this.prisma.$transaction([
      // At most one live token per account (requirement 8).
      this.prisma.passwordResetToken.updateMany({
        where: { accountId: account.id, usedAt: null, isInvalidated: false },
        data: { isInvalidated: true },
      }),
      this.prisma.passwordResetToken.create({
        data: {
          accountId: account.id,
          tokenHash,
          createdAt,
          expiresAt: resetTokenExpiry(createdAt),
        },
      }),
    ]);

    try {
      await this.mail.sendPasswordReset({
        to: account.email,
        firstName: account.firstName,
        token,
        resetUrl: this.resetUrl(token),
      });
    } catch (error) {
      // A dispatch failure must not change the response, or the difference between
      // "sent" and "failed" becomes observable.
      this.logger.error(`Reset email dispatch failed for ${account.email}`, error as Error);
    }
  }

  /**
   * Read-only check behind `GET /api/reset-password/validate`. Never mutates the
   * token, so the page can ask as often as it likes (requirement 13).
   */
  async isTokenUsable(rawToken: unknown): Promise<boolean> {
    const record = await this.findLiveToken(rawToken);
    return record !== null;
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const record = await this.findLiveToken(input.token);
    if (!record) {
      throw new BadRequestException({ message: AUTH_MESSAGES.resetTokenInvalid });
    }

    const password = typeof input.password === 'string' ? input.password : '';
    const confirmation =
      typeof input.passwordConfirmation === 'string' ? input.passwordConfirmation : '';

    // Both checks run before anything is written: a rejected attempt must leave the
    // token spendable (requirements TC-02-INT-12 and -13).
    if (password !== confirmation) {
      throw new BadRequestException({ message: AUTH_MESSAGES.passwordMismatch });
    }

    const policy = validatePassword(password);
    if (!policy.valid) {
      throw new BadRequestException({ message: policy.error });
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      // New stamp = every outstanding cookie stops validating (requirement 10).
      this.prisma.account.update({
        where: { id: record.accountId },
        data: { passwordHash, securityStamp: randomUUID() },
      }),
    ]);
  }

  /** Returns the token row only if it is currently spendable; null for every other case. */
  private async findLiveToken(rawToken: unknown) {
    if (typeof rawToken !== 'string' || rawToken.length === 0) return null;

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(rawToken) },
    });
    if (!record) return null;

    return isResetTokenUsable(record, new Date()) ? record : null;
  }

  private resetUrl(token: string): string {
    const base = process.env.WEB_ORIGIN || 'http://localhost:3000';
    return `${base}/reset-password?token=${encodeURIComponent(token)}`;
  }
}

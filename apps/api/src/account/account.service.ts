import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import {
  ACCOUNT_MESSAGES,
  isEmailChangeTokenExpired,
  isSameAsCurrentEmail,
  normalizeEmail,
  validateAccountSettings,
  validateChangePassword,
  validateEmail,
} from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import type { SessionPayload } from '../auth/session.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import type {
  ChangeEmailDto,
  ChangePasswordDto,
  ConfirmEmailDto,
  UpdateSettingsDto,
} from './account.dto';
import {
  emailChangeTokenExpiry,
  generateEmailChangeToken,
  hashEmailChangeToken,
} from './email-change-token';

const BCRYPT_ROUNDS = 12;

export interface AccountSettingsResponse {
  email: string;
  firstName: string;
  lastName: string;
  phoneCountryCode: string | null;
  phoneNumber: string | null;
  timezone: string;
  firstDayOfWeek: string;
}

/** Handed to the controller so it can re-issue the current session cookie (requirement 3). */
export interface ChangePasswordResult {
  message: string;
  accountId: string;
  organizationId: string;
  securityStamp: string;
}

/**
 * Spec 06 — personal account settings. Self-service: every method acts on the caller's
 * own account, resolved from the session, never from the URL. Mirrors
 * `PasswordResetService` for token generation, supersession via `$transaction`, and
 * swallowed mail-dispatch errors.
 */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async getSettings(session: SessionPayload): Promise<AccountSettingsResponse> {
    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
    });
    return {
      email: account.email,
      firstName: account.firstName,
      lastName: account.lastName,
      phoneCountryCode: account.phoneCountryCode,
      phoneNumber: account.phoneNumber,
      timezone: account.timezone ?? '',
      firstDayOfWeek: account.firstDayOfWeek,
    };
  }

  async updateSettings(session: SessionPayload, dto: UpdateSettingsDto): Promise<{ message: string }> {
    const validation = validateAccountSettings(dto);
    if (!validation.valid) {
      throw new BadRequestException({ errors: validation.errors });
    }

    const { firstName, lastName, phoneCountryCode, phoneNumber, timezone, firstDayOfWeek } =
      validation.value;

    await this.prisma.account.update({
      where: { id: session.accountId },
      data: {
        firstName,
        lastName,
        // Empty means "cleared" — stored as null, which is what GET returns for unset.
        phoneCountryCode: phoneCountryCode.length > 0 ? phoneCountryCode : null,
        phoneNumber: phoneNumber.length > 0 ? phoneNumber : null,
        timezone,
        firstDayOfWeek,
      },
    });

    return { message: 'Settings saved' };
  }

  async changeEmail(session: SessionPayload, dto: ChangeEmailDto): Promise<{ message: string }> {
    const rawNewEmail = typeof dto.newEmail === 'string' ? dto.newEmail : '';

    // Format/length/empty first — a specific field message, not a whole-request one.
    const format = validateEmail(rawNewEmail);
    if (!format.valid) {
      throw new BadRequestException({ message: format.error });
    }
    const newEmail = format.value; // already normalized (lowercase, trimmed)

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
    });

    if (isSameAsCurrentEmail(account.email, newEmail)) {
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.sameAsCurrentEmail });
    }

    // Same-as-current is already handled, so any hit here is a different account.
    const taken = await this.prisma.account.findUnique({ where: { email: newEmail } });
    if (taken) {
      // Create nothing, send nothing (TC-06-INT-16).
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.emailInUse });
    }

    const { token, tokenHash } = generateEmailChangeToken();
    const createdAt = new Date();

    await this.prisma.$transaction([
      // At most one live token per account — supersede any prior pending record (req 2).
      this.prisma.pendingEmailChange.updateMany({
        where: { accountId: account.id, usedAt: null, isInvalidated: false },
        data: { isInvalidated: true },
      }),
      this.prisma.pendingEmailChange.create({
        data: {
          accountId: account.id,
          newEmail,
          tokenHash,
          createdAt,
          expiresAt: emailChangeTokenExpiry(createdAt),
        },
      }),
    ]);

    // Confirmation to the new address, notification to the old — dispatch failures are
    // swallowed (logged) exactly like password reset, so the response cannot leak
    // whether transport succeeded.
    try {
      await this.mail.sendEmailChangeConfirmation({
        to: newEmail,
        firstName: account.firstName,
        token,
        confirmUrl: this.confirmUrl(token),
      });
    } catch (error) {
      this.logger.error(`Email change confirmation dispatch failed for ${newEmail}`, error as Error);
    }
    try {
      await this.mail.sendEmailChangeNotification({
        to: account.email,
        firstName: account.firstName,
      });
    } catch (error) {
      this.logger.error(
        `Email change notification dispatch failed for ${account.email}`,
        error as Error,
      );
    }

    return { message: 'A confirmation link has been sent to your new email address' };
  }

  async confirmEmail(dto: ConfirmEmailDto): Promise<{ message: string }> {
    const rawToken = typeof dto.token === 'string' ? dto.token : '';
    if (rawToken.length === 0) {
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.confirmationInvalid });
    }

    const record = await this.prisma.pendingEmailChange.findUnique({
      where: { tokenHash: hashEmailChangeToken(rawToken) },
    });

    // Not found / used / invalidated all collapse to the same "no longer valid" message.
    if (!record || record.isInvalidated || record.usedAt !== null) {
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.confirmationInvalid });
    }
    if (isEmailChangeTokenExpired(new Date(), record.expiresAt)) {
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.confirmationExpired });
    }

    // Uniqueness re-checked at confirmation time — another account may have claimed the
    // email since the request. The token is NOT consumed on this failure (TC-06-INT-04).
    const taken = await this.prisma.account.findUnique({ where: { email: record.newEmail } });
    if (taken && taken.id !== record.accountId) {
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.emailInUse });
    }

    try {
      await this.prisma.$transaction([
        this.prisma.account.update({
          where: { id: record.accountId },
          data: { email: record.newEmail },
        }),
        this.prisma.pendingEmailChange.update({
          where: { id: record.id },
          data: { usedAt: new Date() },
        }),
      ]);
    } catch (error) {
      // Lost the race between the check above and the update — the unique index is the
      // real guard. Token stays spendable for a retry.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestException({ message: ACCOUNT_MESSAGES.emailInUse });
      }
      throw error;
    }

    return { message: 'Your email has been updated' };
  }

  async changePassword(session: SessionPayload, dto: ChangePasswordDto): Promise<ChangePasswordResult> {
    const validation = validateChangePassword(dto);
    if (!validation.valid) {
      // Single message, in the spec's field order (current → new → confirm).
      throw new BadRequestException({ message: validation.errors[validation.firstInvalidField!] });
    }

    const account = await this.prisma.account.findUniqueOrThrow({
      where: { id: session.accountId },
    });

    const currentMatches = await bcrypt.compare(validation.value.currentPassword, account.passwordHash);
    if (!currentMatches) {
      throw new BadRequestException({ message: ACCOUNT_MESSAGES.currentPasswordIncorrect });
    }

    const passwordHash = await bcrypt.hash(validation.value.newPassword, BCRYPT_ROUNDS);
    const securityStamp = randomUUID();

    await this.prisma.$transaction([
      // New stamp = every outstanding cookie stops validating (spec 02 requirement 12);
      // the controller re-issues the current session's cookie so it survives.
      this.prisma.account.update({
        where: { id: account.id },
        data: { passwordHash, securityStamp },
      }),
    ]);

    return {
      message: 'Your password has been changed',
      accountId: account.id,
      organizationId: session.organizationId,
      securityStamp,
    };
  }

  private confirmUrl(token: string): string {
    const base = process.env.WEB_ORIGIN || 'http://localhost:3000';
    return `${base}/account/confirm-email?token=${encodeURIComponent(token)}`;
  }
}

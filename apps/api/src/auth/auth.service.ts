import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, QueryFailedError, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  createAdminMembershipInput,
  expiresAt,
  MembershipStatus,
  normalizeEmail,
  passwordsMatch,
  RESET_TOKEN_TTL_MS,
  validatePassword,
} from '@devscribed/shared';
import { Account } from '../entities/account.entity';
import { Organization } from '../entities/organization.entity';
import { Membership } from '../entities/membership.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { MailerService } from '../mail/mailer.service';
import { PasswordService } from './password.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { validateSignup } from './signup.validation';
import { generateResetToken, hashResetToken } from './reset-token.util';

/** The authenticated context returned by signup/login. */
export interface AuthContext {
  account: Account;
  organization: Organization;
  membership: Membership;
}

const INVALID_CREDENTIALS = 'Invalid email or password';
const DEACTIVATED = 'Your account has been deactivated, contact your administrator';
const INVALID_RESET_LINK = 'This reset link is invalid or has expired';

// Postgres unique-violation SQLSTATE.
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof QueryFailedError &&
    (error.driverError as { code?: string })?.code === UNIQUE_VIOLATION
  );
}

@Injectable()
export class AuthService {
  /** Precomputed hash used to equalize timing when the email is unknown. */
  private readonly dummyHash: Promise<string>;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    @InjectRepository(PasswordResetToken)
    private readonly resetTokens: Repository<PasswordResetToken>,
    private readonly passwords: PasswordService,
    private readonly mailer: MailerService,
  ) {
    this.dummyHash = this.passwords.hash('timing-equalizer');
  }

  private get appBaseUrl(): string {
    return process.env.APP_BASE_URL ?? 'http://localhost:3000';
  }

  /**
   * Sign up a new organization owner (spec 01). Atomically creates the account,
   * the organization, and the creator's `admin`/`active` membership.
   */
  async signup(dto: SignupDto): Promise<AuthContext> {
    const result = validateSignup(dto);
    if (result.errors) {
      throw new BadRequestException({ message: 'Validation failed', errors: result.errors });
    }
    const { data } = result;
    const passwordHash = await this.passwords.hash(data.password);

    try {
      return await this.dataSource.transaction(async (manager) => {
        const existing = await manager.findOne(Account, { where: { email: data.email } });
        if (existing) {
          throw this.emailInUse();
        }

        const account = await manager.save(
          manager.create(Account, {
            email: data.email,
            passwordHash,
            firstName: data.firstName,
            lastName: data.lastName,
            timezone: data.timezone,
            securityStamp: randomUUID(),
          }),
        );

        const organization = await manager.save(
          manager.create(Organization, { name: data.orgName }),
        );

        const creator = createAdminMembershipInput();
        const membership = await manager.save(
          manager.create(Membership, {
            accountId: account.id,
            organizationId: organization.id,
            role: creator.role,
            status: creator.status,
            joinedAt: creator.joinedAt,
          }),
        );

        return { account, organization, membership };
      });
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw this.emailInUse();
      }
      throw error;
    }
  }

  /**
   * Authenticate with email + password (spec 02). Email lookup is
   * case-insensitive. The `removed`-member check runs after finding the account
   * but before verifying the password (req 6): a removed member gets a distinct
   * deactivation message regardless of password. Unknown email / wrong password
   * both return the same generic error (req 4); a dummy hash comparison equalizes
   * timing on the unknown-email path.
   */
  async login(dto: LoginDto): Promise<AuthContext> {
    const email = normalizeEmail(dto.email ?? '');
    const password = dto.password ?? '';
    if (email.length === 0 || password.trim().length === 0) {
      throw new BadRequestException('Email and password are required');
    }

    const account = await this.accounts.findOne({ where: { email } });
    if (!account) {
      await this.passwords.verify(password, await this.dummyHash);
      throw this.invalidCredentials();
    }

    const membership = await this.memberships.findOne({
      where: { accountId: account.id },
      relations: { organization: true },
      order: { createdAt: 'DESC' },
    });
    if (membership && membership.status === MembershipStatus.Removed) {
      throw this.deactivated();
    }

    const passwordOk = await this.passwords.verify(password, account.passwordHash);
    if (!passwordOk) {
      throw this.invalidCredentials();
    }

    if (!membership || membership.status !== MembershipStatus.Active) {
      throw this.invalidCredentials();
    }

    return { account, organization: membership.organization, membership };
  }

  /**
   * Begin a password reset (spec 02, req 7). Rejects an empty email; otherwise
   * always resolves so the caller returns a neutral response. A reset email is
   * dispatched only for a registered, `active` member. Issuing a token
   * invalidates the account's prior unused tokens (req 8).
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = normalizeEmail(dto.email ?? '');
    if (email.length === 0) {
      throw new BadRequestException('Email is required');
    }

    const account = await this.accounts.findOne({ where: { email } });
    if (!account) {
      return;
    }

    const membership = await this.memberships.findOne({ where: { accountId: account.id } });
    if (!membership || membership.status !== MembershipStatus.Active) {
      return; // neutral response, no email (req 7)
    }

    // Supersede any prior unused tokens for this account (req 8).
    await this.resetTokens.update(
      { accountId: account.id, usedAt: IsNull(), isInvalidated: false },
      { isInvalidated: true },
    );

    const rawToken = generateResetToken();
    const now = new Date();
    await this.resetTokens.save(
      this.resetTokens.create({
        accountId: account.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: expiresAt(now, RESET_TOKEN_TTL_MS),
        usedAt: null,
        isInvalidated: false,
      }),
    );

    const link = `${this.appBaseUrl}/reset-password?token=${rawToken}`;
    await this.mailer.send({
      to: account.email,
      subject: 'Reset your Devscribed.Admin password',
      text:
        `We received a request to reset your password. Use this link within 60 minutes:\n\n` +
        `${link}\n\nIf you didn't request this, you can ignore this email.`,
      html:
        `<p>We received a request to reset your password. Use this link within 60 minutes:</p>` +
        `<p><a href="${link}">Reset your password</a></p>` +
        `<p>If you didn't request this, you can ignore this email.</p>`,
    });
  }

  /** Whether a raw reset token is currently valid (unused, not invalidated, unexpired). */
  async isResetTokenValid(rawToken: string): Promise<boolean> {
    if (!rawToken) {
      return false;
    }
    const record = await this.resetTokens.findOne({
      where: { tokenHash: hashResetToken(rawToken) },
    });
    return this.tokenIsUsable(record);
  }

  /**
   * Complete a password reset (spec 02, reqs 9–11). Validates the token, the
   * confirmation match, and the password policy — none of which consume the
   * token — then updates the hash, marks the token used, and regenerates the
   * security stamp to revoke all existing sessions.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const record = await this.resetTokens.findOne({
      where: { tokenHash: hashResetToken(dto.token ?? '') },
    });
    if (!this.tokenIsUsable(record)) {
      throw new BadRequestException(INVALID_RESET_LINK);
    }

    if (!passwordsMatch(dto.password ?? '', dto.passwordConfirmation ?? dto.password ?? '')) {
      throw new BadRequestException('Passwords do not match');
    }

    const policy = validatePassword(dto.password ?? '');
    if (!policy.valid) {
      throw new BadRequestException({ message: policy.error, errors: { password: policy.error } });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    await this.dataSource.transaction(async (manager) => {
      const account = await manager.findOneOrFail(Account, { where: { id: record!.accountId } });
      account.passwordHash = passwordHash;
      account.securityStamp = randomUUID(); // revoke all existing sessions (req 12)
      await manager.save(account);
      await manager.update(PasswordResetToken, { id: record!.id }, { usedAt: new Date() });
    });
  }

  private tokenIsUsable(record: PasswordResetToken | null): boolean {
    return (
      !!record && !record.usedAt && !record.isInvalidated && record.expiresAt.getTime() > Date.now()
    );
  }

  private invalidCredentials(): BadRequestException {
    return new BadRequestException(INVALID_CREDENTIALS);
  }

  private deactivated(): BadRequestException {
    return new BadRequestException(DEACTIVATED);
  }

  private emailInUse(): ConflictException {
    return new ConflictException({
      message: 'This email is already registered',
      errors: { email: 'This email is already registered' },
    });
  }
}

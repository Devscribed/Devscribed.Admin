import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import {
  createAdminMembershipInput,
  expiresAt,
  MembershipStatus,
  normalizeEmail,
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
            tokenVersion: 0,
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
   * Authenticate with email + password (spec 02). All failure modes — unknown
   * email, wrong password, or a non-active membership (removed member, req 6) —
   * return the same generic error (req 4). A dummy hash comparison equalizes
   * timing on the unknown-email path.
   */
  async login(dto: LoginDto): Promise<AuthContext> {
    const email = normalizeEmail(dto.email ?? '');
    const account = await this.accounts.findOne({ where: { email } });
    if (!account) {
      await this.passwords.verify(dto.password ?? '', await this.dummyHash);
      throw this.invalidCredentials();
    }

    const passwordOk = await this.passwords.verify(dto.password ?? '', account.passwordHash);
    if (!passwordOk) {
      throw this.invalidCredentials();
    }

    const membership = await this.memberships.findOne({
      where: { accountId: account.id, status: MembershipStatus.Active },
      relations: { organization: true },
    });
    if (!membership) {
      throw this.invalidCredentials();
    }

    return { account, organization: membership.organization, membership };
  }

  /**
   * Begin a password reset (spec 02, req 7). Always resolves; the caller returns
   * a neutral response either way. If the email is registered, a single-use,
   * 60-minute token is stored (hashed) and a reset link is emailed.
   */
  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const email = normalizeEmail(dto.email ?? '');
    const account = await this.accounts.findOne({ where: { email } });
    if (!account) {
      return;
    }

    const rawToken = generateResetToken();
    const now = new Date();
    await this.resetTokens.save(
      this.resetTokens.create({
        accountId: account.id,
        tokenHash: hashResetToken(rawToken),
        expiresAt: expiresAt(now, RESET_TOKEN_TTL_MS),
        usedAt: null,
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

  /**
   * Complete a password reset (spec 02, reqs 8–9). Validates the token
   * (single-use, unexpired) and the new password policy, updates the hash, marks
   * the token used, and bumps `tokenVersion` to revoke all existing sessions.
   */
  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const policy = validatePassword(dto.password ?? '');
    if (!policy.valid) {
      throw new BadRequestException({ message: policy.error, errors: { password: policy.error } });
    }

    const record = await this.resetTokens.findOne({
      where: { tokenHash: hashResetToken(dto.token ?? '') },
    });
    if (!record) {
      throw new BadRequestException('This reset link is invalid.');
    }
    if (record.usedAt) {
      throw new BadRequestException('This reset link has already been used.');
    }
    if (record.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('This reset link has expired.');
    }

    const passwordHash = await this.passwords.hash(dto.password);
    await this.dataSource.transaction(async (manager) => {
      const account = await manager.findOneOrFail(Account, { where: { id: record.accountId } });
      account.passwordHash = passwordHash;
      account.tokenVersion += 1; // revoke all existing sessions (req 9)
      await manager.save(account);
      await manager.update(PasswordResetToken, { id: record.id }, { usedAt: new Date() });
    });
  }

  private invalidCredentials(): UnauthorizedException {
    return new UnauthorizedException('invalid email or password');
  }

  private emailInUse(): ConflictException {
    return new ConflictException({
      message: 'This email is already registered',
      errors: { email: 'This email is already registered' },
    });
  }
}

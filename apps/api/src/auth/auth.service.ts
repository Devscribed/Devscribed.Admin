import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { createAdminMembershipInput } from '@devscribed/shared';
import { Account } from '../entities/account.entity';
import { Organization } from '../entities/organization.entity';
import { Membership } from '../entities/membership.entity';
import { PasswordService } from './password.service';
import { SignupDto } from './dto/signup.dto';
import { validateSignup } from './signup.validation';

export interface SignupResult {
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
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly passwords: PasswordService,
  ) {}

  /**
   * Sign up a new organization owner (spec 01). Atomically creates the account,
   * the organization, and the creator's `admin`/`active` membership in a single
   * transaction — if any step fails, nothing is persisted (requirement 5).
   */
  async signup(dto: SignupDto): Promise<SignupResult> {
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
      // Backstop for a race that slips past the pre-check: the unique email
      // index rejects the second writer, and the transaction rolls back.
      if (error instanceof ConflictException) {
        throw error;
      }
      if (isUniqueViolation(error)) {
        throw this.emailInUse();
      }
      throw error;
    }
  }

  private emailInUse(): ConflictException {
    return new ConflictException({
      message: 'An account with this email already exists',
      errors: { email: 'An account with this email already exists' },
    });
  }
}

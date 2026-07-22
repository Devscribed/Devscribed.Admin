import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { MESSAGES, createAdminMembership, validateSignup } from '@devscribed/validation';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import type { SignupDto } from './signup.dto';

const BCRYPT_ROUNDS = 12;

export interface SignupResult {
  accountId: string;
  organizationId: string;
  securityStamp: string;
  account: { id: string; email: string; firstName: string; lastName: string; timezone: string | null };
  organization: { id: string; name: string };
}

@Injectable()
export class SignupService {
  constructor(private readonly prisma: PrismaService) {}

  async signup(dto: SignupDto): Promise<SignupResult> {
    // Server-side re-validation: the client's checks are a convenience, not a gate.
    const validation = validateSignup(dto);
    if (!validation.valid) {
      throw new BadRequestException({
        message: validation.errors[validation.firstInvalidField!],
        errors: validation.errors,
      });
    }

    const { orgName, firstName, lastName, email, password } = validation.value;
    const timezone = typeof dto.timezone === 'string' && dto.timezone.trim() ? dto.timezone.trim() : null;

    const existing = await this.prisma.account.findUnique({ where: { email } });
    if (existing) throw this.duplicateEmail();

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      // Account, organization and admin membership are created together or not at all (FR-6).
      return await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: { email, passwordHash, firstName, lastName, timezone },
        });
        const organization = await tx.organization.create({ data: { name: orgName } });
        await tx.membership.create({
          data: createAdminMembership({ accountId: account.id, organizationId: organization.id }),
        });

        return {
          accountId: account.id,
          organizationId: organization.id,
          securityStamp: account.securityStamp,
          account: {
            id: account.id,
            email: account.email,
            firstName: account.firstName,
            lastName: account.lastName,
            timezone: account.timezone,
          },
          organization: { id: organization.id, name: organization.name },
        };
      });
    } catch (error) {
      // Lost the race between the check above and the insert — the unique index is the real guard.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.duplicateEmail();
      }
      throw error;
    }
  }

  private duplicateEmail(): ConflictException {
    return new ConflictException({
      message: MESSAGES.email.duplicate,
      errors: { email: MESSAGES.email.duplicate },
    });
  }
}

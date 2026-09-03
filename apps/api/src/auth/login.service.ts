import { BadRequestException, Injectable } from '@nestjs/common';
import { AUTH_MESSAGES, normalizeEmail } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import type { LoginDto } from './login.dto';

export interface LoginResult {
  accountId: string;
  organizationId: string;
  securityStamp: string;
}

@Injectable()
export class LoginService {
  constructor(private readonly prisma: PrismaService) {}

  async login(dto: LoginDto): Promise<LoginResult> {
    const email = normalizeEmail(dto.email ?? '');
    const password = dto.password ?? '';

    if (email.length === 0 || password.length === 0) {
      throw new BadRequestException({ message: AUTH_MESSAGES.credentialsRequired });
    }

    const account = await this.prisma.account.findUnique({
      where: { email },
      include: {
        memberships: { where: { status: 'active' } },
        // Requests spec 03 REQ-03-003 — the second kind of principal an account may
        // hold. Read here rather than in a second query so the decision below is made
        // against one snapshot.
        clientMembership: true,
      },
    });

    // Unknown email and wrong password must be indistinguishable (requirement 4),
    // so both paths end at the same message.
    if (!account) throw this.invalidCredentials();

    // Checked *before* the password (requirement 6): verifying first would let a
    // caller tell a correct password from a wrong one on a deactivated account. That
    // ordering is unchanged by requests spec 03; only the set of accounts that pass it
    // grows, by REQ-03-002's table — an active staff row wins, an active client row
    // alone resolves the client principal and every other cell is still the deactivated
    // refusal (REQ-03-004, REQ-03-007).
    const membership = account.memberships[0];
    const contact =
      account.clientMembership && account.clientMembership.status === 'active'
        ? account.clientMembership
        : null;
    const organizationId = membership
      ? membership.organizationId
      : contact
        ? contact.organizationId
        : null;
    if (!organizationId) {
      throw new BadRequestException({ message: AUTH_MESSAGES.deactivated });
    }

    const passwordMatches = await bcrypt.compare(password, account.passwordHash);
    if (!passwordMatches) throw this.invalidCredentials();

    return {
      accountId: account.id,
      organizationId,
      securityStamp: account.securityStamp,
    };
  }

  private invalidCredentials(): BadRequestException {
    return new BadRequestException({ message: AUTH_MESSAGES.invalidCredentials });
  }
}

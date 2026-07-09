import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipStatus, Role } from '@devscribed/shared';
import { Membership } from '../entities/membership.entity';
import { MemberDto } from './member.dto';

/** Roles permitted to manage members (spec 03 permission matrix). */
const MANAGER_ROLES: readonly Role[] = [Role.Admin, Role.Manager];

@Injectable()
export class MembersService {
  constructor(
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
  ) {}

  /** Whether a role may act on member rows (invite/delete/restore). */
  canManage(role: Role): boolean {
    return MANAGER_ROLES.includes(role);
  }

  /**
   * List the `active` members of an organization, sorted by full name
   * (spec 05, requirement 2 default view). The full member list — including the
   * removed filter and per-row actions — is built out in spec 05.
   */
  async listActiveForOrg(organizationId: string): Promise<MemberDto[]> {
    const rows = await this.memberships.find({
      where: { organizationId, status: MembershipStatus.Active },
      relations: { account: true },
    });

    return rows
      .map((membership): MemberDto => {
        const { account } = membership;
        const fullName = `${account.firstName} ${account.lastName}`.trim();
        return {
          id: membership.id,
          accountId: account.id,
          firstName: account.firstName,
          lastName: account.lastName,
          fullName,
          email: account.email,
          role: membership.role,
          status: membership.status,
          joinedAt: membership.joinedAt.toISOString(),
        };
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }
}

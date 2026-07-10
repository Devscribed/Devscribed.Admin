import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import {
  canAssignRole,
  canInvite,
  expiresAt,
  INVITE_TOKEN_TTL_MS,
  InvitationStatus,
  isSameEmail,
  MembershipStatus,
  normalizeEmail,
  Role,
  validateEmail,
  validateName,
  validatePassword,
  validateRole,
} from '@devscribed/shared';
import { Account } from '../entities/account.entity';
import { Organization } from '../entities/organization.entity';
import { Membership } from '../entities/membership.entity';
import { Invitation } from '../entities/invitation.entity';
import { MailerService } from '../mail/mailer.service';
import { PasswordService } from '../auth/password.service';
import { SessionPayload } from '../auth/session.service';
import { AuthContext } from '../auth/auth.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { AcceptInvitationDto } from './dto/accept-invitation.dto';
import { generateInvitationToken, hashInvitationToken } from './invitation-token.util';

const INVALID_INVITE = 'This invitation is no longer valid';
const EXPIRED_INVITE = 'This invitation has expired';

export interface InvitationValidation {
  organizationName: string;
  email: string;
  role: Role;
  accountExists: boolean;
  orgSwitch: boolean;
  oldOrganizationName: string | null;
  lastAdmin: boolean;
}

@Injectable()
export class InvitationsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Invitation) private readonly invitations: Repository<Invitation>,
    @InjectRepository(Account) private readonly accounts: Repository<Account>,
    @InjectRepository(Membership) private readonly memberships: Repository<Membership>,
    private readonly passwords: PasswordService,
    private readonly mailer: MailerService,
  ) {}

  private get appBaseUrl(): string {
    return process.env.APP_BASE_URL ?? 'http://localhost:3000';
  }

  /** Create an invitation (spec 03). Caller must be an admin/manager. */
  async create(inviter: SessionPayload, dto: CreateInvitationDto): Promise<void> {
    if (!canInvite(inviter.role)) {
      throw new ForbiddenException('You do not have permission to invite members');
    }

    const emailResult = validateEmail(dto.email ?? '');
    if (!emailResult.valid) {
      throw new BadRequestException(emailResult.error);
    }
    const roleResult = validateRole(dto.role ?? '');
    if (!roleResult.valid) {
      throw new BadRequestException(roleResult.error);
    }
    const email = normalizeEmail(emailResult.value);
    const role = roleResult.value;

    if (isSameEmail(inviter.email, email)) {
      throw new BadRequestException('You cannot invite yourself');
    }
    if (!canAssignRole(inviter.role, role)) {
      throw new ForbiddenException('You do not have permission to assign the admin role');
    }

    const existingAccount = await this.accounts.findOne({ where: { email } });
    if (existingAccount) {
      const activeSameOrg = await this.memberships.findOne({
        where: {
          accountId: existingAccount.id,
          organizationId: inviter.orgId,
          status: MembershipStatus.Active,
        },
      });
      if (activeSameOrg) {
        throw new BadRequestException('This person is already a member of your organization');
      }
    }

    const inviterMembership = await this.memberships.findOneOrFail({
      where: {
        accountId: inviter.sub,
        organizationId: inviter.orgId,
        status: MembershipStatus.Active,
      },
      relations: { organization: true },
    });

    const rawToken = generateInvitationToken();
    await this.dataSource.transaction(async (manager) => {
      // Supersede any prior pending invitation for (email, org) (req 8).
      await manager.update(
        Invitation,
        { email, organizationId: inviter.orgId, status: InvitationStatus.Pending },
        { status: InvitationStatus.Invalidated },
      );
      await manager.save(
        manager.create(Invitation, {
          email,
          role,
          organizationId: inviter.orgId,
          inviterMembershipId: inviterMembership.id,
          tokenHash: hashInvitationToken(rawToken),
          expiresAt: expiresAt(new Date(), INVITE_TOKEN_TTL_MS),
          status: InvitationStatus.Pending,
          usedAt: null,
        }),
      );
    });

    const orgName = inviterMembership.organization.name;
    const link = `${this.appBaseUrl}/accept-invite?token=${rawToken}`;
    await this.mailer.send({
      to: email,
      subject: `You've been invited to join ${orgName}`,
      text:
        `You've been invited to join ${orgName} as a ${role}. Use this link within 7 days:\n\n` +
        `${link}\n\nIf you weren't expecting this, you can ignore this email.`,
      html:
        `<p>You've been invited to join <strong>${orgName}</strong> as a ${role}.</p>` +
        `<p><a href="${link}">Accept your invitation</a> (valid for 7 days).</p>`,
    });
  }

  /** Validate a token for the accept screen (spec 03). Public. */
  async validate(rawToken: string): Promise<InvitationValidation> {
    const invitation = await this.findAcceptable(rawToken);

    const account = await this.accounts.findOne({ where: { email: invitation.email } });
    let orgSwitch = false;
    let oldOrganizationName: string | null = null;
    let lastAdmin = false;

    if (account) {
      const others = await this.memberships.find({
        where: { accountId: account.id },
        relations: { organization: true },
      });
      const otherOrg = others.find((m) => m.organizationId !== invitation.organizationId);
      if (otherOrg) {
        orgSwitch = true;
        oldOrganizationName = otherOrg.organization.name;
        lastAdmin = await this.isLastActiveAdmin(otherOrg);
      }
    }

    return {
      organizationName: invitation.organization.name,
      email: invitation.email,
      role: invitation.role,
      accountExists: !!account,
      orgSwitch,
      oldOrganizationName,
      lastAdmin,
    };
  }

  /** Accept an invitation (spec 03). Public. Returns the authenticated context. */
  async accept(dto: AcceptInvitationDto): Promise<AuthContext> {
    const invitation = await this.findAcceptable(dto.token ?? '');
    const account = await this.accounts.findOne({ where: { email: invitation.email } });
    return account
      ? this.acceptExisting(invitation, account, dto)
      : this.acceptNew(invitation, dto);
  }

  /** Invalidate a membership's pending invitations (spec 03, req 10 — called on member removal). */
  async invalidatePendingInvitationsForInviter(membershipId: string): Promise<void> {
    await this.invitations.update(
      { inviterMembershipId: membershipId, status: InvitationStatus.Pending },
      { status: InvitationStatus.Invalidated },
    );
  }

  private async acceptNew(invitation: Invitation, dto: AcceptInvitationDto): Promise<AuthContext> {
    const errors: Record<string, string> = {};
    const first = validateName(dto.firstName ?? '', 'First name');
    if (!first.valid) {
      errors.firstName = first.error;
    }
    const last = validateName(dto.lastName ?? '', 'Last name');
    if (!last.valid) {
      errors.lastName = last.error;
    }
    const password = validatePassword(dto.password ?? '');
    if (!password.valid) {
      errors.password = password.error;
    }
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({ errors });
    }

    const passwordHash = await this.passwords.hash(dto.password);
    const timezone = (dto.timezone ?? '').trim() || 'UTC';

    return this.dataSource.transaction(async (manager) => {
      const account = await manager.save(
        manager.create(Account, {
          email: invitation.email,
          passwordHash,
          firstName: (dto.firstName ?? '').trim(),
          lastName: (dto.lastName ?? '').trim(),
          timezone,
          securityStamp: randomUUID(),
        }),
      );
      const membership = await manager.save(
        manager.create(Membership, {
          accountId: account.id,
          organizationId: invitation.organizationId,
          role: invitation.role,
          status: MembershipStatus.Active,
          joinedAt: new Date(),
        }),
      );
      await manager.update(
        Invitation,
        { id: invitation.id },
        { status: InvitationStatus.Used, usedAt: new Date() },
      );
      const organization = await manager.findOneOrFail(Organization, {
        where: { id: invitation.organizationId },
      });
      return { account, organization, membership };
    });
  }

  private async acceptExisting(
    invitation: Invitation,
    account: Account,
    dto: AcceptInvitationDto,
  ): Promise<AuthContext> {
    const passwordOk = await this.passwords.verify(dto.password ?? '', account.passwordHash);
    if (!passwordOk) {
      throw new BadRequestException('Incorrect password');
    }

    const existing = await this.memberships.find({
      where: { accountId: account.id },
      relations: { organization: true },
    });
    const otherOrg = existing.filter((m) => m.organizationId !== invitation.organizationId);
    const sameOrg = existing.find((m) => m.organizationId === invitation.organizationId);

    if (otherOrg.length > 0 && dto.orgSwitchConfirmed !== true) {
      throw new ConflictException({
        message: 'org_switch_confirmation_required',
        oldOrganizationName: otherOrg[0].organization.name,
        lastAdmin: await this.isLastActiveAdmin(otherOrg[0]),
      });
    }

    return this.dataSource.transaction(async (manager) => {
      if (otherOrg.length > 0) {
        // Org-switch: hard-delete the old organization's membership(s) and data (req 6).
        await manager.delete(
          Membership,
          otherOrg.map((m) => m.id),
        );
      }

      let membership: Membership;
      if (sameOrg) {
        // Restore a removed member of the same org with the invitation's new role (req 5).
        sameOrg.status = MembershipStatus.Active;
        sameOrg.role = invitation.role;
        sameOrg.jobTitle = null;
        sameOrg.joinedAt = new Date();
        membership = await manager.save(sameOrg);
      } else {
        membership = await manager.save(
          manager.create(Membership, {
            accountId: account.id,
            organizationId: invitation.organizationId,
            role: invitation.role,
            status: MembershipStatus.Active,
            joinedAt: new Date(),
          }),
        );
      }

      await manager.update(
        Invitation,
        { id: invitation.id },
        { status: InvitationStatus.Used, usedAt: new Date() },
      );
      const organization = await manager.findOneOrFail(Organization, {
        where: { id: invitation.organizationId },
      });
      return { account, organization, membership };
    });
  }

  /** Load an invitation and assert it is acceptable, or throw the spec's token errors. */
  private async findAcceptable(rawToken: string): Promise<Invitation> {
    const invitation = rawToken
      ? await this.invitations.findOne({
          where: { tokenHash: hashInvitationToken(rawToken) },
          relations: { organization: true, inviterMembership: true },
        })
      : null;

    if (!invitation || invitation.status !== InvitationStatus.Pending) {
      throw new BadRequestException(INVALID_INVITE);
    }
    if (invitation.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(EXPIRED_INVITE);
    }
    if (
      !invitation.inviterMembership ||
      invitation.inviterMembership.status !== MembershipStatus.Active
    ) {
      throw new BadRequestException(INVALID_INVITE);
    }
    return invitation;
  }

  private async isLastActiveAdmin(membership: Membership): Promise<boolean> {
    if (membership.role !== Role.Admin || membership.status !== MembershipStatus.Active) {
      return false;
    }
    const admins = await this.memberships.count({
      where: {
        organizationId: membership.organizationId,
        role: Role.Admin,
        status: MembershipStatus.Active,
      },
    });
    return admins === 1;
  }
}

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  CLIENT_USER_MESSAGES,
  INVITE_MESSAGES,
  Role,
  canAssignRole,
  isClientInvitationRole,
  isSelfInvitation,
  validateInviteAcceptNewAccount,
  validateInviteCreate,
} from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import type { SessionPayload } from '../auth/session.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import type { InviteAcceptDto, InviteCreateDto } from './invitations.dto';
import {
  generateInvitationToken,
  hashInvitationToken,
  invitationTokenExpiry,
} from './invitation-token';

const BCRYPT_ROUNDS = 12;

/**
 * Where each principal lands after accepting. The staff destination is the one this
 * route has always answered; requests spec 03 REQ-03-015 adds the client's, which is the
 * only organization screen a contact may reach.
 */
const STAFF_REDIRECT = '/members';
const CLIENT_REDIRECT = '/requests';

export interface AcceptResult {
  accountId: string;
  organizationId: string;
  securityStamp: string;
  /**
   * Where the accept screen lands the new principal. Requests spec 03 REQ-03-015 sends a
   * client contact to the requests destination, which is the only organization screen
   * they may reach; a member of staff keeps the members destination.
   */
  redirectTo: string;
}

export interface ValidateResult {
  organizationName: string;
  email: string;
  role: string;
  accountExists: boolean;
  orgSwitch: boolean;
  oldOrganizationName: string | null;
  lastAdmin: boolean;
}

@Injectable()
export class InvitationsService {
  private readonly logger = new Logger(InvitationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /**
   * `POST /api/invitations`. There is no `:orgId` in this route — the inviting
   * organization comes entirely from the caller's session, never from the request.
   */
  async createInvitation(session: SessionPayload, dto: InviteCreateDto): Promise<void> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      include: { account: true },
    });

    // A caller with no active membership in the session's org cannot invite — collapses
    // into the same "no permission" message a user/viewer would get.
    if (
      !caller ||
      caller.status !== 'active' ||
      caller.organizationId !== session.organizationId ||
      (caller.role !== 'admin' && caller.role !== 'manager')
    ) {
      throw new ForbiddenException({ message: INVITE_MESSAGES.permissionDenied });
    }

    const validation = validateInviteCreate(dto);
    if (!validation.valid) {
      throw new BadRequestException({
        message: validation.errors[validation.firstInvalidField!],
        errors: validation.errors,
      });
    }
    const { email, role } = validation.value;

    if (isSelfInvitation(caller.account.email, email)) {
      throw new BadRequestException({ message: INVITE_MESSAGES.selfInvitation });
    }

    if (!canAssignRole(caller.role as Role, role as Role)) {
      throw new ForbiddenException({ message: INVITE_MESSAGES.roleAuthority });
    }

    const invitee = await this.prisma.account.findUnique({
      where: { email },
      include: {
        memberships: { where: { organizationId: caller.organizationId, status: 'active' } },
        // Requests spec 03 REQ-03-042 — the duplicate check above reads staff rows only,
        // and of this organization only, so it cannot see the principal that matters here.
        clientMembership: true,
      },
    });
    if (invitee && invitee.memberships.length > 0) {
      throw new BadRequestException({ message: INVITE_MESSAGES.alreadyMember });
    }
    // REQ-03-042 — a staff invitation is never written for an address holding an active
    // `ClientMembership` of ANY organization. Refused here as well as at the accept
    // because the account may acquire the client principal in between; neither the
    // invitation nor the membership is written.
    if (invitee?.clientMembership?.status === 'active') {
      throw this.principalConflict();
    }

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: caller.organizationId },
    });

    const { token, tokenHash } = generateInvitationToken();
    const createdAt = new Date();

    await this.prisma.$transaction([
      // At most one live pending invitation per (email, org) — requirement 8.
      this.prisma.invitation.updateMany({
        where: { email, organizationId: caller.organizationId, status: 'pending' },
        data: { status: 'invalidated' },
      }),
      this.prisma.invitation.create({
        data: {
          email,
          role,
          organizationId: caller.organizationId,
          inviterMembershipId: caller.id,
          tokenHash,
          createdAt,
          expiresAt: invitationTokenExpiry(createdAt),
          status: 'pending',
        },
      }),
    ]);

    try {
      await this.mail.sendInvitation({
        to: email,
        organizationName: organization.name,
        // Carried so the dev outbox can scope this message to the organization that sent
        // it. An accept link is as sensitive as a signing one.
        organizationId: organization.id,
        role,
        token,
        acceptUrl: this.acceptUrl(token),
      });
    } catch (error) {
      // A dispatch failure must not undo the already-persisted invitation.
      this.logger.error(`Invitation email dispatch failed for ${email}`, error as Error);
    }
  }

  /** `GET /api/invitations/{token}/validate` — public, read-only. */
  async validateToken(rawToken: unknown): Promise<ValidateResult> {
    const record = await this.findPendingInvitation(rawToken);

    const account = await this.prisma.account.findUnique({
      where: { email: record.email },
      include: { memberships: true },
    });

    let orgSwitch = false;
    let oldOrganizationName: string | null = null;
    let lastAdmin = false;

    if (account) {
      const membership = account.memberships[0];
      if (membership && membership.organizationId !== record.organizationId) {
        orgSwitch = true;
        const oldOrg = await this.prisma.organization.findUnique({
          where: { id: membership.organizationId },
        });
        oldOrganizationName = oldOrg?.name ?? null;
        lastAdmin = await this.isLastActiveAdmin(membership.organizationId, membership.id, membership.role, membership.status);
      }
    }

    return {
      organizationName: record.organization.name,
      email: record.email,
      role: record.role,
      accountExists: account !== null,
      orgSwitch,
      oldOrganizationName,
      lastAdmin,
    };
  }

  /** `POST /api/invitations/accept` — public. */
  async accept(dto: InviteAcceptDto): Promise<AcceptResult> {
    const record = await this.findPendingInvitation(dto.token);

    const account = await this.prisma.account.findUnique({
      where: { email: record.email },
      // Requests spec 03 — the other principal the account may already hold. Read here
      // so both branches below decide against one snapshot of both tables.
      include: { memberships: true, clientMembership: true },
    });

    // State-machine invariant 1 — an account never holds an active `Membership` and an
    // active `ClientMembership` at once. It is a rule, not a schema fact: two unique
    // constraints on two tables cannot express mutual exclusion between them, so it is
    // enforced at every write — REQ-03-014 from the client side, REQ-03-042 from the
    // staff side — and refuses before anything is written.
    if (account) this.requireNoConflictingPrincipal(record.role, account);

    if (isClientInvitationRole(record.role)) {
      return account
        ? this.acceptClientExistingAccount(record, account, dto)
        : this.acceptClientNewAccount(record, dto);
    }

    if (!account) {
      return this.acceptNewAccount(record, dto);
    }
    return this.acceptExistingAccount(record, account, dto);
  }

  /**
   * REQ-03-014 and REQ-03-042 — the two ends of one rule, with the same answer at both.
   *
   * The rule: no account ever holds two active principals. The question this asks: does
   * the accepting account already hold an active principal that the invitation in hand
   * would give it a second of — an active `Membership` or an active `ClientMembership`
   * of ANY organization for a client invitation, an active `ClientMembership` of any
   * organization for a staff one. Nothing is written either way, and the message names
   * no address and no organization.
   */
  private requireNoConflictingPrincipal(
    role: string,
    account: {
      memberships: Array<{ status: string }>;
      clientMembership: { status: string } | null;
    },
  ): void {
    const holdsStaff = account.memberships.some((row) => row.status === 'active');
    const holdsContact = account.clientMembership?.status === 'active';
    const conflict = isClientInvitationRole(role) ? holdsStaff || holdsContact : holdsContact;
    if (conflict) throw this.principalConflict();
  }

  /**
   * REQ-03-012 — accepting a `client` invitation creates ONE active `ClientMembership`
   * and writes no `Membership`. The invitation is marked used in the same transaction.
   */
  private async acceptClientNewAccount(
    record: {
      id: string;
      email: string;
      organizationId: string;
      clientId: string | null;
      inviterMembershipId: string;
    },
    dto: InviteAcceptDto,
  ): Promise<AcceptResult> {
    const clientId = this.requireInvitationClient(record);

    const validation = validateInviteAcceptNewAccount({
      firstName: typeof dto.firstName === 'string' ? dto.firstName : '',
      lastName: typeof dto.lastName === 'string' ? dto.lastName : '',
      password: typeof dto.password === 'string' ? dto.password : '',
    });
    if (!validation.valid) {
      throw new BadRequestException({ errors: validation.errors });
    }
    const { firstName, lastName, password } = validation.value;
    const timezone =
      typeof dto.timezone === 'string' && dto.timezone.trim() ? dto.timezone.trim() : null;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const joinedAt = new Date();

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: { email: record.email, passwordHash, firstName, lastName, timezone },
      });
      await tx.clientMembership.create({
        data: {
          accountId: created.id,
          organizationId: record.organizationId,
          clientId,
          status: 'active',
          invitedByMembershipId: record.inviterMembershipId,
          joinedAt,
        },
      });
      await tx.invitation.update({
        where: { id: record.id },
        data: { status: 'used', usedAt: joinedAt },
      });
      return created;
    });

    return {
      accountId: account.id,
      organizationId: record.organizationId,
      securityStamp: account.securityStamp,
      redirectTo: CLIENT_REDIRECT,
    };
  }

  /**
   * REQ-03-012 for an account that already exists: the row it holds returns to `active`
   * rather than a second one being written, so the requests addressed to that contact
   * are theirs again (TC-03-INT-11).
   */
  private async acceptClientExistingAccount(
    record: {
      id: string;
      email: string;
      organizationId: string;
      clientId: string | null;
      inviterMembershipId: string;
    },
    account: {
      id: string;
      passwordHash: string;
      securityStamp: string;
      clientMembership: { id: string; clientId: string; status: string } | null;
    },
    dto: InviteAcceptDto,
  ): Promise<AcceptResult> {
    const clientId = this.requireInvitationClient(record);

    const password = typeof dto.password === 'string' ? dto.password : '';
    const passwordMatches = await bcrypt.compare(password, account.passwordHash);
    if (!passwordMatches) {
      throw new BadRequestException({ message: INVITE_MESSAGES.incorrectPassword });
    }

    const existing = account.clientMembership;
    // REQ-03-013's rule at the accepting end: a removed row belongs to the client it was
    // written for, and no invitation moves it. The invite route already refuses this
    // address, so reaching this is the row having moved in between.
    if (existing && existing.clientId !== clientId) {
      throw new ConflictException({
        error: 'already_linked',
        message: CLIENT_USER_MESSAGES.alreadyLinked,
      });
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.clientMembership.update({
          where: { id: existing.id },
          data: {
            status: 'active',
            joinedAt: now,
            removedAt: null,
            removedByAccountId: null,
            invitedByMembershipId: record.inviterMembershipId,
          },
        });
      } else {
        await tx.clientMembership.create({
          data: {
            accountId: account.id,
            organizationId: record.organizationId,
            clientId,
            status: 'active',
            invitedByMembershipId: record.inviterMembershipId,
            joinedAt: now,
          },
        });
      }
      await tx.invitation.update({
        where: { id: record.id },
        data: { status: 'used', usedAt: now },
      });
    });

    return {
      accountId: account.id,
      organizationId: record.organizationId,
      securityStamp: account.securityStamp,
      redirectTo: CLIENT_REDIRECT,
    };
  }

  /**
   * A `client` invitation names the client it was written for (REQ-03-009). A row that
   * does not is one no route in this product writes, and it is answered as a token that
   * cannot be acted on rather than guessed at.
   */
  private requireInvitationClient(record: { clientId: string | null }): string {
    if (!record.clientId) {
      throw new BadRequestException({ message: INVITE_MESSAGES.tokenInvalid });
    }
    return record.clientId;
  }

  private principalConflict(): ConflictException {
    return new ConflictException({
      error: 'principal_conflict',
      message: CLIENT_USER_MESSAGES.principalConflict,
    });
  }

  /**
   * Spec 03 requirement 10. Called by spec 04's member-removal endpoint whenever a
   * membership's status transitions to `removed` — that endpoint does not exist yet, so
   * nothing calls this method in production code today. It is unit/integration-tested
   * directly here in the meantime.
   */
  async invalidatePendingInvitationsFrom(membershipId: string): Promise<void> {
    await this.prisma.invitation.updateMany({
      where: { inviterMembershipId: membershipId, status: 'pending' },
      data: { status: 'invalidated' },
    });
  }

  private async acceptNewAccount(
    record: { id: string; email: string; role: string; organizationId: string },
    dto: InviteAcceptDto,
  ): Promise<AcceptResult> {
    const validation = validateInviteAcceptNewAccount({
      firstName: typeof dto.firstName === 'string' ? dto.firstName : '',
      lastName: typeof dto.lastName === 'string' ? dto.lastName : '',
      password: typeof dto.password === 'string' ? dto.password : '',
    });
    if (!validation.valid) {
      throw new BadRequestException({ errors: validation.errors });
    }
    const { firstName, lastName, password } = validation.value;
    const timezone =
      typeof dto.timezone === 'string' && dto.timezone.trim() ? dto.timezone.trim() : null;
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const joinedAt = new Date();

    const account = await this.prisma.$transaction(async (tx) => {
      const created = await tx.account.create({
        data: { email: record.email, passwordHash, firstName, lastName, timezone },
      });
      await tx.membership.create({
        data: {
          accountId: created.id,
          organizationId: record.organizationId,
          role: record.role,
          status: 'active',
          joinedAt,
        },
      });
      await tx.invitation.update({
        where: { id: record.id },
        data: { status: 'used', usedAt: joinedAt },
      });
      return created;
    });

    return {
      accountId: account.id,
      organizationId: record.organizationId,
      securityStamp: account.securityStamp,
      redirectTo: STAFF_REDIRECT,
    };
  }

  private async acceptExistingAccount(
    record: { id: string; email: string; role: string; organizationId: string },
    account: {
      id: string;
      passwordHash: string;
      securityStamp: string;
      memberships: Array<{
        id: string;
        organizationId: string;
        role: string;
        status: string;
      }>;
    },
    dto: InviteAcceptDto,
  ): Promise<AcceptResult> {
    const password = typeof dto.password === 'string' ? dto.password : '';
    const passwordMatches = await bcrypt.compare(password, account.passwordHash);
    if (!passwordMatches) {
      throw new BadRequestException({ message: INVITE_MESSAGES.incorrectPassword });
    }

    const now = new Date();
    const membership = account.memberships[0];

    // No prior membership at all — a brand-new active membership in the inviting org.
    if (!membership) {
      await this.prisma.$transaction([
        this.prisma.membership.create({
          data: {
            accountId: account.id,
            organizationId: record.organizationId,
            role: record.role,
            status: 'active',
            joinedAt: now,
          },
        }),
        this.prisma.invitation.update({
          where: { id: record.id },
          data: { status: 'used', usedAt: now },
        }),
      ]);
      return {
        accountId: account.id,
        organizationId: record.organizationId,
        securityStamp: account.securityStamp,
        redirectTo: STAFF_REDIRECT,
      };
    }

    // Same org — restore (requirement 5, "removed member of the same org").
    if (membership.organizationId === record.organizationId) {
      await this.prisma.$transaction([
        this.prisma.membership.update({
          where: { id: membership.id },
          data: { status: 'active', role: record.role, joinedAt: now, jobTitle: null },
        }),
        this.prisma.invitation.update({
          where: { id: record.id },
          data: { status: 'used', usedAt: now },
        }),
      ]);
      return {
        accountId: account.id,
        organizationId: record.organizationId,
        securityStamp: account.securityStamp,
        redirectTo: STAFF_REDIRECT,
      };
    }

    // Different org — org-switch (requirement 6). Hard-delete the old membership.
    const oldOrg = await this.prisma.organization.findUnique({
      where: { id: membership.organizationId },
    });
    const lastAdmin = await this.isLastActiveAdmin(
      membership.organizationId,
      membership.id,
      membership.role,
      membership.status,
    );

    if (dto.orgSwitchConfirmed !== true) {
      throw new ConflictException({
        message: 'org_switch_confirmation_required',
        oldOrganizationName: oldOrg?.name ?? '',
        lastAdmin,
      });
    }

    await this.prisma.$transaction([
      this.prisma.membership.delete({ where: { id: membership.id } }),
      this.prisma.membership.create({
        data: {
          accountId: account.id,
          organizationId: record.organizationId,
          role: record.role,
          status: 'active',
          joinedAt: now,
        },
      }),
      this.prisma.invitation.update({
        where: { id: record.id },
        data: { status: 'used', usedAt: now },
      }),
    ]);

    return {
      accountId: account.id,
      organizationId: record.organizationId,
      securityStamp: account.securityStamp,
      redirectTo: STAFF_REDIRECT,
    };
  }

  /** True only when this membership is the sole active admin of its (still-active) org. */
  private async isLastActiveAdmin(
    organizationId: string,
    membershipId: string,
    role: string,
    status: string,
  ): Promise<boolean> {
    if (role !== 'admin' || status !== 'active') return false;
    const otherActiveAdmins = await this.prisma.membership.count({
      where: {
        organizationId,
        role: 'admin',
        status: 'active',
        id: { not: membershipId },
      },
    });
    return otherActiveAdmins === 0;
  }

  /**
   * Loads the invitation for a presented token and throws the two collapsed error
   * messages spec 03 requires (expired vs. everything else — used, invalidated, not
   * found, or the inviter no longer active). Never mutates.
   */
  private async findPendingInvitation(rawToken: unknown) {
    if (typeof rawToken !== 'string' || rawToken.length === 0) {
      throw new BadRequestException({ message: INVITE_MESSAGES.tokenInvalid });
    }

    const record = await this.prisma.invitation.findUnique({
      where: { tokenHash: hashInvitationToken(rawToken) },
      include: { organization: true, inviterMembership: true },
    });
    if (!record) {
      throw new BadRequestException({ message: INVITE_MESSAGES.tokenInvalid });
    }
    if (record.status !== 'pending') {
      throw new BadRequestException({ message: INVITE_MESSAGES.tokenInvalid });
    }
    if (record.inviterMembership.status !== 'active') {
      throw new BadRequestException({ message: INVITE_MESSAGES.tokenInvalid });
    }
    if (new Date().getTime() >= record.expiresAt.getTime()) {
      throw new BadRequestException({ message: INVITE_MESSAGES.tokenExpired });
    }

    return record;
  }

  private acceptUrl(token: string): string {
    const base = process.env.WEB_ORIGIN || 'http://localhost:3000';
    return `${base}/accept-invite?token=${encodeURIComponent(token)}`;
  }
}

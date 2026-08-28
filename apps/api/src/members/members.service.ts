import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MESSAGES,
  MEMBER_MESSAGES,
  can,
  canChangeRole,
  getAvailableRoles,
  getAvatarInitials,
  isValidRole,
  validateJobTitle,
  visibleMembers,
  type MembershipStatus,
  type Role,
} from '@devscribed/validation';
import { randomUUID } from 'crypto';
import type { SessionPayload } from '../auth/session.service';
import { InvitationsService } from '../invitations/invitations.service';
import { PrismaService } from '../prisma.service';
import { VacationRequestsService } from '../vacation/vacation-requests.service';

export interface MemberListItem {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: MembershipStatus;
  joinedAt: string;
  isLastAdmin: boolean;
  isSelf: boolean;
  jobTitle: string | null;
}

export interface MemberListResult {
  members: MemberListItem[];
  callerRole: string;
}

export interface MemberListQuery {
  search?: string;
  showRemoved?: boolean;
}

/** Spec 05 — `GET /members/:memberId` response shape (API Contracts section). */
export interface MemberDetail {
  id: string;
  fullName: string;
  email: string;
  role: string;
  status: MembershipStatus;
  joinedAt: string;
  jobTitle: string | null;
  timezone: string | null;
  avatarInitials: string;
  isLastAdmin: boolean;
  canEditRole: boolean;
  canEditJobTitle: boolean;
  availableRoles: Role[];
  callerRole: string;
  /**
   * Spec 07 — drives the Vacation tab's enabled/disabled state. True when the target is
   * active AND the caller can view vacation for anyone, OR the caller is viewing their
   * own membership and can view their own balance. Never true for a removed target.
   */
  canViewVacation: boolean;
}

/** Spec 05 — `PUT /members/:memberId` request body. */
export interface MemberDetailUpdateInput {
  role: string;
  jobTitle: string;
}

interface CallerMembership {
  id: string;
  role: Role;
  organizationId: string;
}

/**
 * Spec 04 — member list & management. `list` is read-only for every role; `remove`
 * and `restore` are gated by the same capability matrix that drives spec 03's invite
 * permission (`can`, from `@devscribed/validation`), which is why the errors below
 * follow the same `{ error, message }` shape `InvitationsService` uses.
 */
@Injectable()
export class MembersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invitations: InvitationsService,
    private readonly vacationRequests: VacationRequestsService,
  ) {}

  async list(session: SessionPayload, query: MemberListQuery): Promise<MemberListResult> {
    const caller = await this.requireCaller(session);

    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: caller.organizationId },
      include: { account: true },
    });

    // Computed once over the whole org, not per visible row — a removed admin must
    // never count, and the flag has to be right even before any filter is applied.
    const activeAdminIds = memberships
      .filter((m) => m.role === 'admin' && m.status === 'active')
      .map((m) => m.id);
    const soleActiveAdminId = activeAdminIds.length === 1 ? activeAdminIds[0] : null;

    const shaped: MemberListItem[] = memberships.map((m) => ({
      id: m.id,
      fullName: `${m.account.firstName} ${m.account.lastName}`,
      email: m.account.email,
      role: m.role,
      status: m.status as MembershipStatus,
      joinedAt: m.joinedAt.toISOString(),
      isLastAdmin: m.id === soleActiveAdminId,
      isSelf: m.id === caller.id,
      jobTitle: m.jobTitle,
    }));

    // Search/removed-filter composition is the same pure logic unit-tested directly
    // in `@devscribed/validation` (TC-04-UNIT-01/02/03/04) — filtering in application
    // code rather than a raw LIKE keeps the query itself trivially injection-safe
    // (Prisma still parameterizes the `organizationId` lookup above) while reusing
    // one tested implementation for both the unit tests and this runtime path.
    const visible = visibleMembers(shaped, {
      search: query.search,
      showRemoved: query.showRemoved,
    }).sort((a, b) => a.fullName.localeCompare(b.fullName));

    return { members: visible, callerRole: caller.role };
  }

  /** `DELETE /members/:memberId` — soft-delete (requirements 6-9). */
  async remove(session: SessionPayload, targetId: string): Promise<{ success: true }> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'delete-restore')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: MEMBER_MESSAGES.deleteForbidden,
      });
    }

    const removedMembershipId = await this.prisma.$transaction(async (tx) => {
      // Serializes every concurrent delete/restore against this org on one row lock,
      // so the zero-admin count below can never be read stale by a second racing
      // request (TC-04-INT-09: two admins deleting each other simultaneously) —
      // whichever transaction acquires the lock first commits its status change
      // before the other's count query runs.
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      const target = await tx.membership.findFirst({
        where: { id: targetId, organizationId: caller.organizationId },
      });
      if (!target) throw new NotFoundException();

      if (target.id === caller.id) {
        throw new ConflictException({
          error: 'cannot_remove_self',
          message: MEMBER_MESSAGES.cannotRemoveSelf,
        });
      }
      if (target.status === 'removed') {
        throw new ConflictException({
          error: 'already_removed',
          message: MEMBER_MESSAGES.alreadyRemoved,
        });
      }
      if (target.role === 'admin') {
        const otherActiveAdmins = await tx.membership.count({
          where: {
            organizationId: caller.organizationId,
            role: 'admin',
            status: 'active',
            id: { not: target.id },
          },
        });
        if (otherActiveAdmins === 0) {
          throw new ConflictException({
            error: 'last_admin_guard',
            message: MEMBER_MESSAGES.lastAdminGuard,
          });
        }
      }

      await tx.membership.update({ where: { id: target.id }, data: { status: 'removed' } });
      // SecurityStamp rotation (spec 02 requirement 12) — the exact mechanism
      // password reset uses to revoke every outstanding session in one write.
      await tx.account.update({
        where: { id: target.accountId },
        data: { securityStamp: randomUUID() },
      });

      // Spec 09 requirement 20 — cancel the removed member's pending requests and refund
      // any future-dated approved ones. Runs on this same `tx` so it is atomic with the
      // removal (past approved requests are left untouched).
      await this.vacationRequests.cancelActiveForRemoval(tx, target.id, session.accountId);

      // Spec 11 requirement 15 — cascade-delete the member's project assignments.
      // Removal is a soft-delete (status → 'removed'), so the ProjectMember → Membership
      // FK cascade never fires; delete the rows explicitly, atomically with the removal,
      // so no assignment outlives the membership (TC-11-INT-13 — no orphan row).
      await tx.projectMember.deleteMany({ where: { membershipId: target.id } });

      // Spec 12 FR-19 / TC-12-INT-30 — discard the removed member's running timer (if any).
      // Removal is a soft-delete, so the RunningTimer → Membership FK cascade never fires;
      // delete the row explicitly, atomically with the removal. TimeEntry rows are historical
      // and are deliberately NOT deleted — they survive removal (spec 12 §Concurrency 25 note).
      await tx.runningTimer.deleteMany({ where: { membershipId: target.id } });

      return target.id;
    });

    // Independent side effect (spec 03 requirement 10) — the removed member may
    // themselves have sent pending invitations as an admin/manager. Deliberately
    // outside the transaction above: it is not part of the removal's own atomicity
    // guarantee, and a failure here must not undo an already-committed removal.
    await this.invitations.invalidatePendingInvitationsFrom(removedMembershipId);

    return { success: true };
  }

  /** `POST /members/:memberId/restore` (requirement 8). No invitation involved. */
  async restore(session: SessionPayload, targetId: string): Promise<{ success: true }> {
    const caller = await this.requireCaller(session);
    if (!can(caller.role, 'delete-restore')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: MEMBER_MESSAGES.restoreForbidden,
      });
    }

    const target = await this.prisma.membership.findFirst({
      where: { id: targetId, organizationId: caller.organizationId },
    });
    if (!target) throw new NotFoundException();
    if (target.status !== 'removed') {
      throw new ConflictException({ error: 'not_removed', message: MEMBER_MESSAGES.notRemoved });
    }

    await this.prisma.membership.update({
      where: { id: target.id },
      data: { status: 'active', joinedAt: new Date(), jobTitle: null },
    });

    return { success: true };
  }

  /**
   * Resolves the caller's own membership from the session — never from the URL.
   * `SessionGuard`/`OrgScopeGuard` already proved the session is live and the path's
   * `:orgId` agrees with it; this only fails if the caller's membership vanished or
   * was removed between those checks and this one.
   */
  private async requireCaller(
    session: SessionPayload,
    forbiddenBody?: { error: string; message: string },
  ): Promise<CallerMembership> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
    });
    if (
      !caller ||
      caller.status !== 'active' ||
      caller.organizationId !== session.organizationId
    ) {
      throw new ForbiddenException(forbiddenBody);
    }
    return { id: caller.id, role: caller.role as Role, organizationId: caller.organizationId };
  }

  /**
   * `GET /members/:memberId` (spec 05 requirements 1-4, 11-13). Viewable by every
   * role — the permission matrix only gates the two edit flags, never the read.
   * `canEditRole`/`availableRoles` are derived from `getAvailableRoles`, which folds
   * in both the caller's role and the target's *current* role — see that function's
   * doc comment for why a single-role-parameter `canChangeRole(caller, role)` can't
   * express the matrix on its own.
   */
  async getDetail(session: SessionPayload, targetId: string): Promise<MemberDetail> {
    const caller = await this.requireCaller(session, {
      error: 'forbidden',
      message: MEMBER_MESSAGES.viewForbidden,
    });

    const target = await this.prisma.membership.findFirst({
      where: { id: targetId, organizationId: caller.organizationId },
      include: { account: true },
    });
    if (!target) {
      throw new NotFoundException({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
    }

    const targetRole = target.role as Role;
    const targetStatus = target.status as MembershipStatus;

    // Only an active admin can be "the last admin" — a removed admin never blocks
    // anything, and this member's own status/role already rule that out otherwise.
    const isLastAdmin =
      targetRole === 'admin' &&
      targetStatus === 'active' &&
      (await this.prisma.membership.count({
        where: { organizationId: caller.organizationId, role: 'admin', status: 'active' },
      })) === 1;

    // Role editing only ever applies to active members (requirement 10); job title
    // editing shares that constraint but — unlike role — never depends on the
    // target's role at all (the asymmetry spec 05 calls out explicitly).
    const availableRoles = targetStatus === 'active' ? getAvailableRoles(caller.role, targetRole) : [];
    const canEditRole = availableRoles.length > 0;
    const canEditJobTitle =
      targetStatus === 'active' && (caller.role === 'admin' || caller.role === 'manager');

    const isSelf = target.id === caller.id;
    const canViewVacation =
      targetStatus === 'active' &&
      (can(caller.role, 'view-vacation') ||
        (isSelf && can(caller.role, 'view-own-vacation-balance')));

    return {
      id: target.id,
      fullName: `${target.account.firstName} ${target.account.lastName}`,
      email: target.account.email,
      role: target.role,
      status: targetStatus,
      joinedAt: target.joinedAt.toISOString(),
      jobTitle: target.jobTitle,
      timezone: target.account.timezone,
      avatarInitials: getAvatarInitials(target.account.firstName, target.account.lastName),
      isLastAdmin,
      canEditRole,
      canEditJobTitle,
      availableRoles,
      callerRole: caller.role,
      canViewVacation,
    };
  }

  /**
   * `PUT /members/:memberId` (spec 05 requirements 5-13). Role and job title are
   * saved atomically — the whole handler after the initial caller/permission check
   * runs inside one transaction, mirroring `remove()`'s `SELECT ... FOR UPDATE` row
   * lock on the organization so the zero-admin count below can never be read stale
   * by a second racing request.
   *
   * Validation/authorization order matches spec 05's Error Messages table and its
   * numbered test cases exactly: caller permission, then existence, then removed
   * status, then role-enum validity, then job-title length, then role-change
   * authority (skipped entirely when the requested role equals the current one —
   * TC-05-INT-15), then the zero-admin guard.
   */
  async updateDetail(
    session: SessionPayload,
    targetId: string,
    input: MemberDetailUpdateInput,
  ): Promise<{ success: true }> {
    const caller = await this.requireCaller(session, {
      error: 'forbidden',
      message: MEMBER_MESSAGES.editForbidden,
    });
    if (!can(caller.role, 'edit-detail')) {
      throw new ForbiddenException({ error: 'forbidden', message: MEMBER_MESSAGES.editForbidden });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Organization" WHERE id = ${caller.organizationId} FOR UPDATE`;

      const target = await tx.membership.findFirst({
        where: { id: targetId, organizationId: caller.organizationId },
      });
      if (!target) {
        throw new NotFoundException({ error: 'not_found', message: MEMBER_MESSAGES.memberNotFound });
      }
      if (target.status === 'removed') {
        throw new BadRequestException({
          error: 'member_removed',
          message: MEMBER_MESSAGES.memberRemoved,
        });
      }

      if (!isValidRole(input.role)) {
        throw new BadRequestException({ error: 'invalid_role', message: MESSAGES.role.invalid });
      }
      const newRole = input.role;

      const jobTitleResult = validateJobTitle(input.jobTitle ?? '');
      if (!jobTitleResult.valid) {
        throw new BadRequestException({ errors: { jobTitle: jobTitleResult.error } });
      }

      const currentRole = target.role as Role;
      if (newRole !== currentRole && !canChangeRole(caller.role, currentRole, newRole)) {
        throw new ForbiddenException({
          error: 'role_authority',
          message: MEMBER_MESSAGES.roleAuthority,
        });
      }

      // Zero-admin guard (requirement 9) — only a demotion away from `admin` can ever
      // trip it; every other transition (including a no-op admin->admin save) skips
      // the count query entirely.
      if (currentRole === 'admin' && newRole !== 'admin') {
        const otherActiveAdmins = await tx.membership.count({
          where: {
            organizationId: caller.organizationId,
            role: 'admin',
            status: 'active',
            id: { not: target.id },
          },
        });
        if (otherActiveAdmins === 0) {
          throw new ConflictException({
            error: 'last_admin_guard',
            message: MEMBER_MESSAGES.lastAdminGuard,
          });
        }
      }

      await tx.membership.update({
        where: { id: target.id },
        data: { role: newRole, jobTitle: jobTitleResult.value.length > 0 ? jobTitleResult.value : null },
      });

      return { success: true };
    });
  }
}

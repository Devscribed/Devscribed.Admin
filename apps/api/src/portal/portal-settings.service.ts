import { ForbiddenException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import {
  PORTAL_MESSAGES,
  hasCapability,
  normalizeRole,
  validatePortalGroups,
  type NormalizedRole,
  type PortalGroups,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/** The caller, resolved from the session — never from anything in the URL or the body. */
interface Caller {
  membershipId: string;
  accountId: string;
  organizationId: string;
  /** Normalized: the legacy `member` column value is `user` here, as everywhere. */
  role: NormalizedRole;
}

/**
 * The three group switches for a portal's news feed — `people`, `hiring`, `work`
 * (REQ-01-048 through REQ-01-052). `readGroups` is the one reader, called both by the
 * settings GET and, on every news read, by the feed. `writeGroups` is the one writer in
 * this spec.
 *
 * Neither route carries a capability guard at the controller: `ManagePortalSettings` is
 * asked here, on both verbs, because the refusal must carry
 * `PORTAL_MESSAGES.settingsForbidden` rather than `CapabilityGuard`'s fixed message.
 */
@Injectable()
export class PortalSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * REQ-01-049: no row means all three groups read `true`. Returns defaults rather than
   * 404, and writes nothing on a read.
   */
  async readGroups(organizationId: string): Promise<PortalGroups> {
    const row = await this.prisma.organizationPortalSettings.findUnique({
      where: { organizationId },
      select: { peopleEnabled: true, hiringEnabled: true, workEnabled: true },
    });
    if (!row) {
      return { people: true, hiring: true, work: true };
    }
    return { people: row.peopleEnabled, hiring: row.hiringEnabled, work: row.workEnabled };
  }

  /**
   * The settings pair's read (REQ-01-049), for the one caller a capability gates. The
   * feed calls `readGroups` directly and must not be gated — it reads the switches for
   * every staff role — so the capability is asked here, on the route's own path, rather
   * than inside the reader both call sites share.
   */
  async readGroupsForManager(
    session: SessionPayload,
    organizationId: string,
  ): Promise<PortalGroups> {
    await this.requireManager(session, organizationId);
    return this.readGroups(organizationId);
  }

  /**
   * REQ-01-051: a single `upsert` on the unique `organizationId`, so create and update are
   * the same statement. Edge case 18 settles the race as last-write-wins on a whole-record
   * replacement — no lock is taken.
   *
   * The body arrives unvalidated and is re-checked here, server-side, exactly as
   * `PortalFeedService` re-checks `limit` and `cursor`: Validation Rules 3-5 require all
   * three groups and require each to be strictly boolean, and a body that is not is
   * `422 PORTAL_MESSAGES.groupsInvalid`. The capability is asked first, so a member who
   * may not change the switches learns nothing from the shape of a body they sent.
   */
  async writeGroups(
    session: SessionPayload,
    organizationId: string,
    body: unknown,
  ): Promise<PortalGroups> {
    await this.requireManager(session, organizationId);

    const validation = validatePortalGroups(body);
    if (!validation.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { groups: validation.error },
      });
    }
    const groups = validation.value;

    const row = await this.prisma.organizationPortalSettings.upsert({
      where: { organizationId },
      create: {
        organizationId,
        peopleEnabled: groups.people,
        hiringEnabled: groups.hiring,
        workEnabled: groups.work,
      },
      update: {
        peopleEnabled: groups.people,
        hiringEnabled: groups.hiring,
        workEnabled: groups.work,
      },
      select: { peopleEnabled: true, hiringEnabled: true, workEnabled: true },
    });
    return { people: row.peopleEnabled, hiring: row.hiringEnabled, work: row.workEnabled };
  }

  /** REQ-01-050: 403 `PORTAL_MESSAGES.settingsForbidden` for a member without the capability. */
  async requireManager(session: SessionPayload, organizationId: string): Promise<Caller> {
    const caller = await this.requireCaller(session, organizationId);
    if (!hasCapability(caller.role, 'ManagePortalSettings')) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: PORTAL_MESSAGES.settingsForbidden,
      });
    }
    return caller;
  }

  /**
   * REQ-01-052's server half: whether the home body's `canManageSettings` should read
   * `true` for this caller. Called by the home service with the already-resolved role —
   * see this method's doc on the seam below.
   */
  canManageSettings(role: string | null | undefined): boolean {
    return hasCapability(normalizeRole(role), 'ManagePortalSettings');
  }

  /**
   * The caller's own active membership, resolved from the session. `organizationId` is
   * passed in rather than read from the path so the scope key can never be defaulted.
   * Copies `RequestTopicsService.requireCaller` (apps/api/src/requests/request-topics.service.ts:431-454)
   * exactly: reads the live `Membership` row by `accountId`, refuses a membership that is
   * missing, not `active` or in another organization, and normalizes the role with
   * `normalizeRole` before the capability is asked, so the decision is never made from a
   * role copied into the cookie.
   */
  private async requireCaller(session: SessionPayload, organizationId: string): Promise<Caller> {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: { id: true, role: true, status: true, organizationId: true, accountId: true },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.organizationId !== organizationId
    ) {
      throw new ForbiddenException();
    }
    return {
      membershipId: membership.id,
      accountId: membership.accountId,
      organizationId: membership.organizationId,
      role: normalizeRole(membership.role),
    };
  }
}

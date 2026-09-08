import { Injectable, NotFoundException } from '@nestjs/common';
import {
  PORTAL_MESSAGES,
  calculateAvailableDays,
  daysInMonth,
  hasCapability,
  isRequestOverdue,
  isoDate,
  localDateInTz,
  parseIsoDate,
  resolveMemberHolidayCountry,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

/**
 * Portal spec 01 (Home) — the personal half of `GET .../portal/home`. Every query below
 * scopes by the caller's own membership, resolved from the session, never from the path
 * `:orgId` (`OrgScopeGuard` has already proven it equal to `session.organizationId`).
 *
 * `ViewPortalHome` is asked here rather than by a guard: every staff role holds it
 * (`ROLE_CAPABILITIES`), so a guard would spend a query on a decision that is already
 * true. The check stays as a defensive backstop — a membership that somehow fails it is
 * refused the same bare 404 as every other unrecognized caller here (REQ-01-004).
 */

/** Mirrors `VacationService`'s fallback — the column carries `@default(20)` and is
 * never actually null, but the same defensive `??` is kept for consistency. */
const DEFAULT_VACATION_DAYS_PER_YEAR = 20;

interface CallerMembership {
  id: string;
  role: string;
  organizationId: string;
  countryCode: string | null;
  timezone: string | null;
}

export interface PortalMonthProjectRow {
  projectId: string | null;
  projectName: string;
  minutes: number;
}

export interface PortalMonthBlock {
  startDate: string;
  endDate: string;
  today: string;
  timezone: string;
  totalMinutes: number;
  daysWithEntry: number;
  byProject: PortalMonthProjectRow[];
}

export interface PortalTimeOffBlock {
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

export interface PortalHolidayRow {
  id: string;
  date: string;
  name: string;
}

export interface PortalHolidaysBlock {
  countryCode: string | null;
  upcoming: PortalHolidayRow[];
}

export interface PortalRequestItem {
  id: string;
  number: number;
  title: string;
  counterpartName: string;
  direction: 'raised' | 'assigned';
  neededBy: string | null;
  overdue: boolean;
  waitingOnMe: boolean;
}

interface PortalRequestItemInternal extends PortalRequestItem {
  lastActivityAt: string;
}

export interface PortalRequestsBlock {
  openTotal: number;
  items: PortalRequestItem[];
}

export interface PortalHomeView {
  month: PortalMonthBlock;
  timeOff: PortalTimeOffBlock | null;
  holidays: PortalHolidaysBlock;
  requests: PortalRequestsBlock;
  canManageSettings: boolean;
}

@Injectable()
export class PortalHomeService {
  constructor(private readonly prisma: PrismaService) {}

  async getHome(session: SessionPayload, organizationId: string): Promise<PortalHomeView> {
    const membership = await this.requireMembership(session, organizationId);

    if (!hasCapability(membership.role, 'ViewPortalHome')) {
      // Not a reachable state — every staff role holds this capability — but the
      // refusal discipline is "not-found, never forbidden" throughout this spec, so a
      // membership that somehow lacks it is answered the same as any other stranger.
      throw new NotFoundException();
    }

    const timezone = this.tzOf(membership);
    const today = localDateInTz(new Date().toISOString(), timezone);
    const { year, month } = parseIsoDate(today);
    const startDate = isoDate(year, month, 1);
    const endDate = isoDate(year, month, daysInMonth(year, month));

    const [monthBlock, timeOff, holidays, requests] = await Promise.all([
      this.buildMonth(membership.id, startDate, endDate, today, timezone),
      this.buildTimeOff(membership.id),
      this.buildHolidays(organizationId, membership.countryCode, today),
      this.buildRequests(organizationId, membership.id, today),
    ]);

    return {
      month: monthBlock,
      timeOff,
      holidays,
      requests,
      canManageSettings: hasCapability(membership.role, 'ManagePortalSettings'),
    };
  }

  private tzOf(membership: CallerMembership): string {
    return typeof membership.timezone === 'string' && membership.timezone.trim().length > 0
      ? membership.timezone
      : 'UTC';
  }

  private dateOnly(date: string): Date {
    return new Date(`${date}T00:00:00.000Z`);
  }

  /** The caller's own active membership — never the path `:orgId`, only the session. */
  private async requireMembership(
    session: SessionPayload,
    organizationId: string,
  ): Promise<CallerMembership> {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      select: {
        id: true,
        role: true,
        status: true,
        organizationId: true,
        countryCode: true,
        account: { select: { timezone: true } },
      },
    });
    if (!membership || membership.status !== 'active' || membership.organizationId !== organizationId) {
      throw new NotFoundException();
    }
    return {
      id: membership.id,
      role: membership.role,
      organizationId: membership.organizationId,
      countryCode: membership.countryCode,
      timezone: membership.account.timezone,
    };
  }

  /**
   * REQ-01-011/012/013/014 — the caller's tracked minutes for the month, split by
   * project. `@@index([membershipId, date])` is the index this range scan uses.
   */
  private async buildMonth(
    membershipId: string,
    startDate: string,
    endDate: string,
    today: string,
    timezone: string,
  ): Promise<PortalMonthBlock> {
    const entries = await this.prisma.timeEntry.findMany({
      where: {
        membershipId,
        date: { gte: this.dateOnly(startDate), lte: this.dateOnly(endDate) },
      },
      select: {
        projectId: true,
        durationMinutes: true,
        date: true,
        project: { select: { name: true } },
      },
    });

    let totalMinutes = 0;
    const byProject = new Map<string | null, PortalMonthProjectRow>();
    const days = new Set<string>();

    for (const entry of entries) {
      totalMinutes += entry.durationMinutes;
      days.add(entry.date.toISOString().slice(0, 10));

      const key = entry.projectId;
      const name = entry.project ? entry.project.name : PORTAL_MESSAGES.noProject;
      const existing = byProject.get(key);
      if (existing) {
        existing.minutes += entry.durationMinutes;
      } else {
        byProject.set(key, { projectId: key, projectName: name, minutes: entry.durationMinutes });
      }
    }

    const byProjectRows = Array.from(byProject.values()).sort((a, b) => {
      if (b.minutes !== a.minutes) return b.minutes - a.minutes;
      return a.projectName.localeCompare(b.projectName);
    });

    return {
      startDate,
      endDate,
      today,
      timezone,
      totalMinutes,
      daysWithEntry: days.size,
      byProject: byProjectRows,
    };
  }

  /**
   * REQ-01-015/016 — the reserve, in days only (REQ-01-053: no monetary key ever
   * enters `PortalTimeOffBlock`). `null` in full when the membership has no
   * `MemberFinancials` row. Mirrors `VacationService.buildBalance`'s arithmetic.
   */
  private async buildTimeOff(membershipId: string): Promise<PortalTimeOffBlock | null> {
    const financials = await this.prisma.memberFinancials.findUnique({ where: { membershipId } });
    if (!financials) return null;

    const currentYear = new Date().getUTCFullYear();
    const [transactions, vacationRequests] = await Promise.all([
      this.prisma.vacationReserveTransaction.findMany({
        where: { membershipId },
        select: { amount: true, createdAt: true },
      }),
      this.prisma.vacationRequest.findMany({
        where: { membershipId },
        select: { status: true, workingDays: true, deductionAmount: true, startDate: true },
      }),
    ]);

    const reserveBalance = transactions.reduce(
      (sum, t) => (t.createdAt.getUTCFullYear() === currentYear ? sum + t.amount.toNumber() : sum),
      0,
    );

    let usedDays = 0;
    let pendingDays = 0;
    let pendingHold = 0;
    for (const request of vacationRequests) {
      if (request.startDate.getUTCFullYear() !== currentYear) continue;
      if (request.status === 'approved') {
        usedDays += request.workingDays;
      } else if (request.status === 'pending') {
        pendingDays += request.workingDays;
        pendingHold += request.deductionAmount.toNumber();
      }
    }

    const availableDays = calculateAvailableDays({
      reserveBalance,
      monthlySalary: financials.monthlySalary.toNumber(),
      vacationDaysPerYear: financials.vacationDaysPerYear,
      usedDays,
      pendingHold,
    });

    return {
      availableDays,
      usedDays,
      pendingDays,
      totalDaysPerYear: financials.vacationDaysPerYear ?? DEFAULT_VACATION_DAYS_PER_YEAR,
    };
  }

  /**
   * REQ-01-017/018/019 — the next three holidays that reach the caller, whatever the
   * reserve answers. `resolveMemberHolidayCountry` is the only source of the country;
   * the organization's own country is never consulted (PATCH-012).
   */
  private async buildHolidays(
    organizationId: string,
    membershipCountry: string | null,
    today: string,
  ): Promise<PortalHolidaysBlock> {
    const countryCode = resolveMemberHolidayCountry(membershipCountry);
    const countryFilter = countryCode
      ? { OR: [{ countryCode }, { countryCode: null }] }
      : { countryCode: null };

    const holidays = await this.prisma.holiday.findMany({
      where: {
        organizationId,
        date: { gte: this.dateOnly(today) },
        ...countryFilter,
      },
      orderBy: { date: 'asc' },
      take: 3,
      select: { id: true, date: true, name: true },
    });

    return {
      countryCode,
      upcoming: holidays.map((holiday) => ({
        id: holiday.id,
        date: holiday.date.toISOString().slice(0, 10),
        name: holiday.name,
      })),
    };
  }

  /**
   * REQ-01-020/021 — at most three of the caller's own open requests, plus the total
   * matching the same filter. "Open" is the schema's literal `'open'` status, not the
   * requests area's broader `['open', 'answered']` span (N8).
   */
  private async buildRequests(
    organizationId: string,
    membershipId: string,
    today: string,
  ): Promise<PortalRequestsBlock> {
    const where = {
      organizationId,
      status: 'open',
      OR: [{ requesterMembershipId: membershipId }, { assigneeMembershipId: membershipId }],
    };

    const [openTotal, rows] = await Promise.all([
      this.prisma.request.count({ where }),
      this.prisma.request.findMany({
        where,
        select: {
          id: true,
          number: true,
          title: true,
          neededBy: true,
          lastActivityAt: true,
          requesterMembershipId: true,
          assigneeMembershipId: true,
          requester: { select: { account: { select: { firstName: true, lastName: true } } } },
          assignee: { select: { account: { select: { firstName: true, lastName: true } } } },
          assigneeClientMembership: {
            select: { account: { select: { firstName: true, lastName: true } } },
          },
        },
      }),
    ]);

    const items = rows
      .map((row) => this.toRequestItem(row, membershipId, today))
      .sort((a, b) => this.compareRequestItems(a, b))
      .slice(0, 3)
      .map(({ lastActivityAt: _lastActivityAt, ...item }) => item);

    return { openTotal, items };
  }

  private toRequestItem(
    row: {
      id: string;
      number: number;
      title: string;
      neededBy: Date | null;
      lastActivityAt: Date;
      requesterMembershipId: string;
      assigneeMembershipId: string | null;
      requester: { account: { firstName: string; lastName: string } } | null;
      assignee: { account: { firstName: string; lastName: string } } | null;
      assigneeClientMembership: { account: { firstName: string; lastName: string } } | null;
    },
    membershipId: string,
    today: string,
  ): PortalRequestItemInternal {
    const direction: 'raised' | 'assigned' =
      row.requesterMembershipId === membershipId ? 'raised' : 'assigned';
    const neededBy = row.neededBy ? row.neededBy.toISOString().slice(0, 10) : null;
    const overdue = isRequestOverdue({ neededBy, status: 'open' }, today);

    const counterpartName =
      direction === 'raised'
        ? row.assignee
          ? this.displayName(row.assignee.account)
          : row.assigneeClientMembership
            ? this.displayName(row.assigneeClientMembership.account)
            : ''
        : row.requester
          ? this.displayName(row.requester.account)
          : '';

    return {
      id: row.id,
      number: row.number,
      title: row.title,
      counterpartName,
      direction,
      neededBy,
      overdue,
      waitingOnMe: direction === 'assigned',
      lastActivityAt: row.lastActivityAt.toISOString(),
    };
  }

  private displayName(account: { firstName: string; lastName: string }): string {
    return `${account.firstName} ${account.lastName}`.trim();
  }

  /** Overdue first, then `neededBy` ascending with nulls last, then `lastActivityAt` descending. */
  private compareRequestItems(a: PortalRequestItemInternal, b: PortalRequestItemInternal): number {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.neededBy !== b.neededBy) {
      if (a.neededBy === null) return 1;
      if (b.neededBy === null) return -1;
      return a.neededBy < b.neededBy ? -1 : 1;
    }
    if (a.lastActivityAt !== b.lastActivityAt) {
      return a.lastActivityAt > b.lastActivityAt ? -1 : 1;
    }
    return 0;
  }
}

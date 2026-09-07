import { ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  TIME_OFF_CALENDAR_MAX_MEMBERS,
  TIME_OFF_CALENDAR_MESSAGES,
  TIME_OFF_CALENDAR_UNASSIGNED,
  calendarDaysBetween,
  can,
  isCalendarWeekend,
  isHolidayApplicableToMember,
  isoWeekOf,
  normalizeRole,
  resolveMemberHolidayCountry,
  resolveTimeOffCalendarTimezone,
  timeOffCalendarToday,
  validateTimeOffCalendarRange,
  validateTimeOffCalendarScope,
  type TimeOffCalendarScope,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';

interface CallerMembership {
  id: string;
  role: string;
  organizationId: string;
  accountId: string;
}

/** The parsed `GET .../time-off/calendar` query. Every field is `unknown` until validated. */
export interface TimeOffCalendarQuery {
  startDate?: unknown;
  endDate?: unknown;
  scope?: unknown;
  projectIds?: unknown;
  memberIds?: unknown;
}

/** One column of the grid (§`GET .../time-off/calendar`). */
export interface CalendarDay {
  date: string;
  isWeekend: boolean;
  isoWeek: number;
}

/** One absence band. `kind` is the constant `'vacation'` today (REQ-01-025). */
export interface CalendarAbsence {
  id: string;
  kind: 'vacation';
  status: string;
  /** The request's TRUE dates, never clipped to the window (REQ-01-022). */
  startDate: string;
  endDate: string;
  /** The value frozen at submission — never recounted over the visible part (REQ-01-024). */
  workingDays: number;
  startsBeforeWindow: boolean;
  endsAfterWindow: boolean;
}

export interface CalendarHoliday {
  id: string;
  date: string;
  name: string;
  countryCode: string | null;
  /** Computed against the rows THIS response carries and no others (REQ-01-030/031). */
  appliesToAllInView: boolean;
}

export interface CalendarMember {
  membershipId: string;
  displayName: string;
  jobTitle: string | null;
  /** The RESOLVED country (REQ-01-026), not the stored one. */
  countryCode: string | null;
  holidayIds: string[];
  absences: CalendarAbsence[];
}

export interface TimeOffCalendarResponse {
  range: { startDate: string; endDate: string; today: string; timezone: string };
  days: CalendarDay[];
  holidays: CalendarHoliday[];
  members: CalendarMember[];
  meta: { scope: TimeOffCalendarScope; memberCount: number };
}

/**
 * Time off spec 01 — the Vacation Calendar's one read. It writes nothing (§State Machine,
 * invariant 1): every rule is evaluated on read, which is why setting or clearing either
 * country repairs every reader at once and no row has to be backfilled.
 *
 * The capability check lives here rather than on a `RequireCapability` decorator because
 * the refusal must be a bare **404**, byte-identical to a wrong-organization read
 * (REQ-01-002, REQ-01-039), and `CapabilityGuard` can only answer 403 — the shape
 * `HolidaysService.requireViewCapability` already uses. Every query filters by
 * `session.organizationId`; the path `:orgId` is addressability, never a selector.
 */
@Injectable()
export class TimeOffCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  async getCalendar(
    session: SessionPayload,
    query: TimeOffCalendarQuery,
  ): Promise<TimeOffCalendarResponse> {
    const caller = await this.requireViewCapability(session);

    // §Validation Rules — evaluated in the table's order, and the FIRST failure is the
    // whole answer. Rules 1–4 first, then the scope. Rules 6 and 7 constrain nothing: an
    // empty selection under `teams` or `people` is no narrowing at all (REQ-03-001,
    // REQ-03-002), never a refusal.
    const range = validateTimeOffCalendarRange(query.startDate, query.endDate);
    if (!range.valid) throw this.refusal(range.field, range.error);
    const { startDate, endDate } = range.value;

    const scopeResult = validateTimeOffCalendarScope(query.scope);
    if (!scopeResult.valid) throw this.refusal(scopeResult.field, scopeResult.error);
    const scope = scopeResult.value;

    const projectIds = this.idList(query.projectIds);
    const memberIds = this.idList(query.memberIds);

    const memberships = await this.resolveRows(caller, scope, projectIds, memberIds);

    // Rule 8, checked last, after the rows resolve. Refused, never silently truncated.
    if (memberships.length > TIME_OFF_CALENDAR_MAX_MEMBERS) {
      throw this.refusal('scope', TIME_OFF_CALENDAR_MESSAGES.tooManyMembers);
    }

    const [organization, account] = await Promise.all([
      // Loaded ONCE per request rather than per member: the second link of the chain is a
      // property of the organization, and re-reading it per row would be the same answer N times.
      this.prisma.organization.findUnique({
        where: { id: caller.organizationId },
        select: { countryCode: true },
      }),
      this.prisma.account.findUnique({
        where: { id: caller.accountId },
        select: { timezone: true },
      }),
    ]);

    const membershipIds = memberships.map((row) => row.id);
    const [requests, holidayRows] = await Promise.all([
      this.fetchAbsences(membershipIds, startDate, endDate),
      this.fetchHolidays(caller.organizationId, startDate, endDate),
    ]);

    const absencesByMember = new Map<string, CalendarAbsence[]>();
    for (const request of requests) {
      const band: CalendarAbsence = {
        id: request.id,
        kind: 'vacation',
        status: request.status,
        startDate: this.toISODate(request.startDate),
        endDate: this.toISODate(request.endDate),
        workingDays: request.workingDays,
        startsBeforeWindow: this.toISODate(request.startDate) < startDate,
        endsAfterWindow: this.toISODate(request.endDate) > endDate,
      };
      const list = absencesByMember.get(request.membershipId);
      if (list) list.push(band);
      else absencesByMember.set(request.membershipId, [band]);
    }

    const holidays = holidayRows.map((row) => ({
      id: row.id,
      date: this.toISODate(row.date),
      name: row.name,
      countryCode: row.countryCode,
    }));

    const members: CalendarMember[] = memberships.map((row) => {
      const countryCode = resolveMemberHolidayCountry(
        row.countryCode,
        organization?.countryCode ?? null,
      );
      return {
        membershipId: row.id,
        displayName: row.displayName,
        jobTitle: row.jobTitle,
        countryCode,
        holidayIds: holidays
          .filter((holiday) => isHolidayApplicableToMember(holiday, { countryCode }))
          .map((holiday) => holiday.id),
        absences: absencesByMember.get(row.id) ?? [],
      };
    });

    // REQ-01-018, through the two shared helpers the screen also reads, so the day this
    // marks and the window that screen opens on can never be two different days, and the
    // zone this reports is the one that day was read in.
    const stated = account?.timezone ?? null;
    return {
      range: {
        startDate,
        endDate,
        today: timeOffCalendarToday(stated),
        timezone: resolveTimeOffCalendarTimezone(stated),
      },
      days: calendarDaysBetween(startDate, endDate).map((date) => ({
        date,
        isWeekend: isCalendarWeekend(date),
        isoWeek: isoWeekOf(date),
      })),
      holidays: holidays.map((holiday) => ({
        ...holiday,
        // "Every member in the current view" is a question about the rows this response
        // carries; with no rows there is nobody it applies to, so nothing shades whole.
        appliesToAllInView:
          members.length > 0 && members.every((member) => member.holidayIds.includes(holiday.id)),
      })),
      members,
      meta: { scope, memberCount: members.length },
    };
  }

  /* ---------------------------------------------------------------- *
   * Gates
   * ---------------------------------------------------------------- */

  /**
   * The caller's own active membership, from the session and never from the path. A
   * missing / removed / wrong-organization row is only reachable with a broken cookie;
   * `OrgScopeGuard` has already 404'd a cross-organization URL by this point.
   */
  private async requireViewCapability(session: SessionPayload): Promise<CallerMembership> {
    const caller = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
    });
    if (
      !caller ||
      caller.status !== 'active' ||
      caller.organizationId !== session.organizationId
    ) {
      throw new ForbiddenException();
    }
    // NORMALIZED, so a membership still storing the legacy `member` is read as `user` and
    // is answered 200 — the same reading the sidebar row is drawn from.
    if (!can(normalizeRole(caller.role), 'view-time-off-calendar')) {
      throw new NotFoundException();
    }
    return {
      id: caller.id,
      role: caller.role,
      organizationId: caller.organizationId,
      accountId: caller.accountId,
    };
  }

  /* ---------------------------------------------------------------- *
   * Rows
   * ---------------------------------------------------------------- */

  private async resolveRows(
    caller: CallerMembership,
    scope: TimeOffCalendarScope,
    projectIds: string[],
    memberIds: string[],
  ): Promise<{ id: string; displayName: string; jobTitle: string | null; countryCode: string | null }[]> {
    let idFilter: string[] | null = null;

    if (scope === 'teams') {
      const named = projectIds.filter((id) => id !== TIME_OFF_CALENDAR_UNASSIGNED);
      const wantsUnassigned = projectIds.includes(TIME_OFF_CALENDAR_UNASSIGNED);
      const ids = new Set<string>();

      if (named.length > 0) {
        // The named-project branch never consults the archived flag (Edge case 5):
        // archiving hides a project from selectors, it does not unassign anybody. The
        // project's own organization is what drops a foreign id (REQ-01-010).
        const assignments = await this.prisma.projectMember.findMany({
          where: {
            projectId: { in: named },
            project: { organizationId: caller.organizationId },
            membership: { organizationId: caller.organizationId, status: 'active' },
          },
          select: { membershipId: true },
        });
        for (const row of assignments) ids.add(row.membershipId);
      }

      if (wantsUnassigned) {
        // REQ-01-007 — "on no team" means on no NON-ARCHIVED project: a member whose only
        // project was archived has nobody to stand with and belongs in this bucket.
        const unassigned = await this.prisma.membership.findMany({
          where: {
            organizationId: caller.organizationId,
            status: 'active',
            projectMemberships: { none: { project: { status: { not: 'archived' } } } },
          },
          select: { id: true },
        });
        for (const row of unassigned) ids.add(row.id);
      }

      // REQ-03-001 — an EMPTY selection leaves `idFilter` null, which is the sentinel for
      // "no id narrowing" the `all` scope already uses. Setting it to the empty list here
      // would make the query `id: { in: [] }`, which answers zero rows: a 200 carrying the
      // empty state where every active member is the answer.
      // A Set is what collapses a member on two ticked projects to one row (Edge case 6).
      if (projectIds.length > 0) idFilter = [...ids];
    }

    // REQ-03-002 — the same rule on the other scope, for the same reason.
    if (scope === 'people' && memberIds.length > 0) {
      idFilter = memberIds;
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: caller.organizationId,
        // `removed` memberships never appear, in any scope (REQ-01-011) — and naming one
        // explicitly is not an error, it simply resolves to no row (Edge case 7).
        status: 'active',
        ...(idFilter === null ? {} : { id: { in: idFilter } }),
      },
      select: {
        id: true,
        jobTitle: true,
        countryCode: true,
        account: { select: { firstName: true, lastName: true } },
      },
    });

    return memberships
      .map((row) => ({
        id: row.id,
        displayName: `${row.account.firstName} ${row.account.lastName}`.trim(),
        jobTitle: row.jobTitle,
        countryCode: row.countryCode,
      }))
      .sort((a, b) =>
        a.displayName.localeCompare(b.displayName, 'en', { sensitivity: 'base' }) ||
        a.id.localeCompare(b.id),
      );
  }

  /* ---------------------------------------------------------------- *
   * Rows' contents
   * ---------------------------------------------------------------- */

  private fetchAbsences(membershipIds: string[], startDate: string, endDate: string) {
    if (membershipIds.length === 0) return Promise.resolve([]);
    return this.prisma.vacationRequest.findMany({
      where: {
        membershipId: { in: membershipIds },
        // `rejected` and `cancelled` are never drawn (REQ-01-021).
        status: { in: ['approved', 'pending'] },
        // Both columns are `@db.Date`, so the bounds are UTC midnights built from the raw
        // ISO strings (REQ-01-017). A timezone-shifted instant drops a boundary day for a
        // caller far enough east or west, which is exactly what TC-01-INT-10 catches.
        startDate: { lte: this.utcMidnight(endDate) },
        endDate: { gte: this.utcMidnight(startDate) },
      },
      select: {
        id: true,
        membershipId: true,
        startDate: true,
        endDate: true,
        workingDays: true,
        status: true,
      },
      orderBy: { startDate: 'asc' },
    });
  }

  private fetchHolidays(organizationId: string, startDate: string, endDate: string) {
    return this.prisma.holiday.findMany({
      // Every holiday dated inside the window and no other, whatever country it names: a
      // row the grid draws no column for is a row nothing on this screen can place.
      where: {
        organizationId,
        date: { gte: this.utcMidnight(startDate), lte: this.utcMidnight(endDate) },
      },
      select: { id: true, date: true, name: true, countryCode: true },
      orderBy: { date: 'asc' },
    });
  }

  /* ---------------------------------------------------------------- *
   * Helpers
   * ---------------------------------------------------------------- */

  /** The 422 shape every validation refusal on this route takes. */
  private refusal(field: string, message: string): UnprocessableEntityException {
    return new UnprocessableEntityException({
      error: 'validation_error',
      fields: { [field]: message },
    });
  }

  /** `projectIds=a&projectIds=b`, `projectIds[]=a`, or a single value — one shape out. */
  private idList(input: unknown): string[] {
    const values = Array.isArray(input) ? input : input === undefined || input === null ? [] : [input];
    return values
      .filter((value): value is string => typeof value === 'string')
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
  }

  private utcMidnight(iso: string): Date {
    return new Date(`${iso}T00:00:00.000Z`);
  }

  /** A `@db.Date` column comes back as UTC midnight; slicing keeps it a calendar day. */
  private toISODate(value: Date): string {
    return value.toISOString().slice(0, 10);
  }

}

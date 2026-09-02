import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  REPORT_CURRENCY_CODE,
  REPORT_PDF_RATE_LIMIT_PER_MINUTE,
  REPORT_PDF_ROW_BUDGET,
  REPORTS_MESSAGES,
  buildHolidayRow,
  buildVacationRow,
  can,
  coerceQueryBoolean,
  intersectReportColumns,
  isHolidayApplicableToMember,
  isZeroTotal,
  pdfReportFilename,
  resolveRateAtDate,
  toHours,
  toMoney,
  validateBillableFilter,
  validateCuidList,
  validateReportRange,
  weightedAverageRate,
  type AmountRow,
  type ReportBillableFilter,
  type ReportColumn,
  type ReportOwnerScope,
  type Role,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PdfRenderer } from '../pdf/pdf-renderer';
import { PrismaService } from '../prisma.service';
import { renderAmountsOwedHtml, renderTimeAndActivityHtml } from './reports.pdf-template';

/** The raw query strings straight from Express — every field is `unknown`. */
export interface AmountsOwedQueryInput {
  startDate?: unknown;
  endDate?: unknown;
  memberIds?: unknown;
  projectIds?: unknown;
  clientIds?: unknown;
  sumDateRanges?: unknown;
  detailedReports?: unknown;
}

interface Caller {
  membershipId: string;
  accountId: string;
  role: Role;
  organizationId: string;
  organizationName: string;
  timezone: string;
  countryCode: string | null;
  displayName: string;
}

interface ParsedQuery {
  startDate: string;
  endDate: string;
  /** UTC-midnight of `startDate`, tz-shifted (spec §Query shape req 2). */
  startUtc: Date;
  /** UTC-midnight of `endDate + 1`, tz-shifted. */
  endUtcExclusive: Date;
  /**
   * UTC-midnight of `startDate` (tz-agnostic) — the actual DB bound for
   * `@db.Date` columns. Postgres compares a DATE column against a TIMESTAMPTZ
   * by casting the RHS to DATE (truncating the time), so a tz-shifted bound
   * like `2026-07-31 22:00 UTC` would round to `2026-07-31` and misclassify
   * a `2026-08-31` row. For date-only entries the calendar day is the unit;
   * a member's `2026-08-31` entry is in-range when the caller asked for
   * `2026-08-31`, regardless of the caller's timezone.
   */
  startDateOnly: Date;
  /** UTC-midnight of `endDate + 1` (tz-agnostic) — same reasoning. */
  endDateOnlyExclusive: Date;
  memberIds: string[];
  projectIds: string[];
  clientIds: string[];
  sumDateRanges: boolean;
  detailedReports: boolean;
}

export interface AmountsOwedRow {
  member: string;
  activity: string;
  hours: string;
  rate: string;
  amount: string;
  kind: 'project' | 'holiday' | 'vacation';
}

export interface AmountsOwedGroup {
  id: string;
  title: string;
  rows: AmountsOwedRow[];
  total: { hours: string; amount: string };
}

export interface AmountsOwedResponse {
  headers: { title: string; value: string }[];
  groups: AmountsOwedGroup[];
  summary: { label: string; value: string }[];
  meta: {
    currencyCode: string;
    timezone: string;
    startDate: string;
    endDate: string;
  };
}

/** Time & Activity query envelope — same as Amounts Owed plus `columns[]` and `billable`. */
export interface TimeAndActivityQueryInput extends AmountsOwedQueryInput {
  columns?: unknown;
  billable?: unknown;
}

/** A single per-member row inside a project group. Keys are optional so denied
 *  columns are simply absent from the payload (spec req 11 — never null-blanked). */
export interface TimeAndActivityRow {
  member: string;
  client?: string;
  time: string;
  billableTime?: string;
  nonBillableTime?: string;
  billedAmount?: string;
  spent?: string;
  notes?: string;
  details?: TimeAndActivityDayDetail[];
}

/** Per-day breakdown when `detailedReports=true`. */
export interface TimeAndActivityDayDetail {
  date: string;
  time: string;
  billableTime?: string;
  nonBillableTime?: string;
  billedAmount?: string;
  spent?: string;
}

export interface TimeAndActivityGroup {
  id: string;
  title: string;
  rows: TimeAndActivityRow[];
  total: {
    time: string;
    billableTime?: string;
    nonBillableTime?: string;
    billedAmount?: string;
    spent?: string;
  };
}

export interface TimeAndActivityResponse {
  headers: { title: string; value: string }[];
  groups: TimeAndActivityGroup[];
  summary: { label: string; value: string }[];
  meta: {
    currencyCode: string;
    timezone: string;
    startDate: string;
    endDate: string;
  };
}

/** Ordered header dictionary — the response only exposes keys projected by grants. */
const T_AND_A_HEADER_BY_COLUMN: Record<ReportColumn, { title: string; value: string }> = {
  Project: { title: 'Project', value: 'project' },
  Time: { title: 'Time', value: 'time' },
  Member: { title: 'Member', value: 'member' },
  Client: { title: 'Client', value: 'client' },
  'Billable Time': { title: 'Billable Time', value: 'billableTime' },
  'Non-Billable Time': { title: 'Non-Billable', value: 'nonBillableTime' },
  'Billed Amount': { title: 'Billed Amount', value: 'billedAmount' },
  Spent: { title: 'Spent', value: 'spent' },
  Notes: { title: 'Notes', value: 'notes' },
};

/** Max characters shown in the concatenated notes summary (spec §Row `notes`). */
const T_AND_A_NOTES_MAX = 120;

/**
 * Header shape is fixed for Amounts Owed (spec §API Contracts) — no column
 * permission filter applies here; that only concerns Time & Activity.
 */
const AMOUNTS_OWED_HEADERS: { title: string; value: string }[] = [
  { title: 'Member', value: 'member' },
  { title: 'Activity', value: 'activity' },
  { title: 'Hours', value: 'hours' },
  { title: 'Rate', value: 'rate' },
  { title: 'Amount', value: 'amount' },
];

/**
 * Spec reports/01 — the Amounts Owed report family. Capability checks live here
 * because this resource mixes 404 (missing `view-*`, per §Owner scope 7) and 403
 * (missing `export-reports`, per §Security). Every Prisma query scopes by
 * `session.organizationId` and never by the path `orgId`.
 */
@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  /**
   * A minimal in-memory ring counter keyed by session account id. Sufficient
   * for a single-instance dev/test topology; when the API scales horizontally
   * this must move to the shared rate-limit backend (spec §Security · Rate
   * limiting names 10/min per session as the target). Known-simple approach —
   * follow-up ticket to replace with the app-wide limiter.
   */
  private readonly pdfRateWindow = new Map<string, number[]>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly pdf: PdfRenderer,
  ) {}

  /**
   * `GET /organizations/:orgId/reports/amounts-owed(/my)`. Returns the JSON
   * rollup. Refusal of the capability is a 404 (spec requirement 7 —
   * org-scope-style hiding, not a 403).
   */
  async runAmountsOwed(
    session: SessionPayload,
    scope: ReportOwnerScope,
    input: AmountsOwedQueryInput,
  ): Promise<AmountsOwedResponse> {
    const startedAt = Date.now();
    const caller = await this.loadCaller(session);
    this.gateScope(caller.role, scope);

    const query = this.parseQuery(input, scope, caller);
    const response = await this.buildResponse(caller, scope, query);

    this.logFetch(caller, scope, query, response, Date.now() - startedAt);
    return response;
  }

  /**
   * `GET /organizations/:orgId/reports/amounts-owed/pdf(/my)`. Runs the same
   * aggregation, then hands the resulting HTML to the `PdfRenderer` port.
   * `export-reports` refusal is a **403** — a caller may see the JSON view but
   * not the PDF endpoint (spec §Security).
   */
  async renderAmountsOwedPdf(
    session: SessionPayload,
    scope: ReportOwnerScope,
    input: AmountsOwedQueryInput,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const startedAt = Date.now();
    const caller = await this.loadCaller(session);
    this.gateScope(caller.role, scope);
    // export-reports is a 403 refusal, distinct from the 404 view-* gate.
    if (!can(caller.role, 'export-reports')) {
      throw new ForbiddenException({ error: 'forbidden', message: REPORTS_MESSAGES.toastForbidden });
    }
    this.checkPdfRateLimit(caller.accountId);

    const query = this.parseQuery(input, scope, caller);
    const response = await this.buildResponse(caller, scope, query);

    // Spec requirement 37 — backpressure applies to PDF endpoints only. Count
    // rows *after* aggregation (empty-row filter already applied): the PDF's
    // real cost scales with what it renders.
    const rowCount = response.groups.reduce((n, g) => n + g.rows.length, 0);
    if (rowCount > REPORT_PDF_ROW_BUDGET) {
      throw new UnprocessableEntityException({
        error: 'range_too_large_for_pdf',
        message: REPORTS_MESSAGES.pdfTooLarge,
      });
    }

    const html = renderAmountsOwedHtml(response, {
      title: scope === 'my' ? 'My Amounts Owed' : 'Amounts Owed',
      organizationName: caller.organizationName,
      rangeLabel: this.formatRangeLabel(query, caller.timezone),
      generatedAt: this.formatInstantIn(new Date(), caller.timezone),
    });
    const buffer = await this.pdf.render(html);
    const filename = pdfReportFilename(
      scope === 'my' ? 'My Amounts Owed' : 'Amounts Owed',
      query.startDate,
      query.endDate,
    );

    this.logExport(caller, scope, query, response, buffer.length, Date.now() - startedAt);
    return { buffer, filename };
  }

  /* ---------------------------------------------------------------- *
   * Time & Activity endpoints
   * ---------------------------------------------------------------- */

  /**
   * `GET /organizations/:orgId/reports/time-and-activity(/my)`. Same 404-on-
   * view-refusal shape as Amounts Owed. Column projection is decided here
   * (grant lookup + intersect) so a caller who forces `?columns=Spent`
   * without the pay-rate capability gets Spent silently dropped — never
   * `null`-blanked (spec req 11).
   */
  async runTimeAndActivity(
    session: SessionPayload,
    scope: ReportOwnerScope,
    input: TimeAndActivityQueryInput,
  ): Promise<TimeAndActivityResponse> {
    const startedAt = Date.now();
    const caller = await this.loadCaller(session);
    this.gateTimeAndActivityScope(caller.role, scope);

    const query = this.parseTimeAndActivityQuery(input, scope, caller);
    const response = await this.buildTimeAndActivityResponse(caller, scope, query);

    this.logTimeAndActivityFetch(caller, scope, query, response, Date.now() - startedAt);
    return response;
  }

  /**
   * `GET /organizations/:orgId/reports/time-and-activity/pdf(/my)`.
   * `export-reports` refusal is 403 (spec §Security). Row-count backpressure
   * (spec req 37) counts rows *after* aggregation and the empty-row filter,
   * matching the Amounts Owed handler.
   */
  async renderTimeAndActivityPdf(
    session: SessionPayload,
    scope: ReportOwnerScope,
    input: TimeAndActivityQueryInput,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const startedAt = Date.now();
    const caller = await this.loadCaller(session);
    this.gateTimeAndActivityScope(caller.role, scope);
    if (!can(caller.role, 'export-reports')) {
      throw new ForbiddenException({ error: 'forbidden', message: REPORTS_MESSAGES.toastForbidden });
    }
    this.checkPdfRateLimit(caller.accountId);

    const query = this.parseTimeAndActivityQuery(input, scope, caller);
    const response = await this.buildTimeAndActivityResponse(caller, scope, query);

    const rowCount = response.groups.reduce((n, g) => n + g.rows.length, 0);
    if (rowCount > REPORT_PDF_ROW_BUDGET) {
      throw new UnprocessableEntityException({
        error: 'range_too_large_for_pdf',
        message: REPORTS_MESSAGES.pdfTooLarge,
      });
    }

    const displayName = scope === 'my' ? 'My Time & Activity' : 'Time & Activity';
    const html = renderTimeAndActivityHtml(response, {
      title: displayName,
      organizationName: caller.organizationName,
      rangeLabel: this.formatRangeLabel(query, caller.timezone),
      generatedAt: this.formatInstantIn(new Date(), caller.timezone),
    });
    const buffer = await this.pdf.render(html);
    const filename = pdfReportFilename(displayName, query.startDate, query.endDate);

    this.logTimeAndActivityExport(
      caller,
      scope,
      query,
      response,
      buffer.length,
      Date.now() - startedAt,
    );
    return { buffer, filename };
  }

  /* ---------------------------------------------------------------- *
   * Gates & caller resolution
   * ---------------------------------------------------------------- */

  /**
   * Load the caller's active membership and the org's display name — every
   * downstream query needs `caller.organizationId` (never the path `:orgId`),
   * and PDF filename generation needs the org name. Bundled into one round
   * trip to match the holidays pattern (`HolidaysService.requireCaller`).
   */
  private async loadCaller(session: SessionPayload): Promise<Caller> {
    const membership = await this.prisma.membership.findUnique({
      where: { accountId: session.accountId },
      include: {
        account: {
          select: { timezone: true, phoneCountryCode: true, firstName: true, lastName: true },
        },
        organization: { select: { name: true } },
      },
    });
    if (
      !membership ||
      membership.status !== 'active' ||
      membership.organizationId !== session.organizationId
    ) {
      throw new ForbiddenException();
    }
    return {
      membershipId: membership.id,
      accountId: membership.accountId,
      role: membership.role as Role,
      organizationId: membership.organizationId,
      organizationName: membership.organization.name,
      timezone: membership.account.timezone ?? 'UTC',
      countryCode: membership.account.phoneCountryCode ?? null,
      displayName: `${membership.account.firstName} ${membership.account.lastName}`.trim(),
    };
  }

  /** 404 for a missing `view-*` capability — spec §Owner scope requirement 7. */
  private gateScope(role: Role, scope: ReportOwnerScope): void {
    const capability = scope === 'my' ? 'view-my-amounts-owed' : 'view-amounts-owed';
    if (!can(role, capability)) {
      throw new NotFoundException();
    }
  }

  /** Same 404-on-view-refusal shape for Time & Activity (spec req 7). */
  private gateTimeAndActivityScope(role: Role, scope: ReportOwnerScope): void {
    const capability = scope === 'my' ? 'view-my-time-and-activity' : 'view-time-and-activity';
    if (!can(role, capability)) {
      throw new NotFoundException();
    }
  }

  /**
   * Simple 60-second ring per accountId (spec §Security · Rate limiting — 10/min
   * per session, PDF only). Not the app-wide limiter; see the field comment.
   */
  private checkPdfRateLimit(accountId: string): void {
    const now = Date.now();
    const window = this.pdfRateWindow.get(accountId) ?? [];
    const kept = window.filter((t) => now - t < 60_000);
    if (kept.length >= REPORT_PDF_RATE_LIMIT_PER_MINUTE) {
      throw new HttpException(
        'Too many PDF exports. Try again in a minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    kept.push(now);
    this.pdfRateWindow.set(accountId, kept);
  }

  /* ---------------------------------------------------------------- *
   * Query parsing
   * ---------------------------------------------------------------- */

  /**
   * Parse the shared query envelope (spec §Query shape). Every rule runs
   * through `@devscribed/validation` — client copies are convenience, never a
   * gate. On `scope='my'`, `memberIds[]` is discarded and replaced with
   * `[caller.membershipId]` (spec requirement 6).
   */
  private parseQuery(
    input: AmountsOwedQueryInput,
    scope: ReportOwnerScope,
    caller: Caller,
  ): ParsedQuery {
    const range = validateReportRange(input.startDate, input.endDate, caller.timezone);
    if (!range.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { [range.field]: range.error },
      });
    }

    const members =
      scope === 'my'
        ? { valid: true as const, value: [caller.membershipId] }
        : validateCuidList(input.memberIds, REPORTS_MESSAGES.invalidMemberRef);
    if (!members.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { memberIds: members.error },
      });
    }
    const projects = validateCuidList(input.projectIds, REPORTS_MESSAGES.invalidProjectRef);
    if (!projects.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { projectIds: projects.error },
      });
    }
    const clients = validateCuidList(input.clientIds, REPORTS_MESSAGES.invalidClientRef);
    if (!clients.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { clientIds: clients.error },
      });
    }

    // UTC-midnight of the local calendar day boundaries, for @db.Date filters.
    const startDateOnly = new Date(`${range.startDate}T00:00:00.000Z`);
    const [y, m, d] = range.endDate.split('-').map(Number);
    const endDayAfter = new Date(Date.UTC(y, m - 1, d + 1));
    const endIso = `${endDayAfter.getUTCFullYear()}-${String(endDayAfter.getUTCMonth() + 1).padStart(2, '0')}-${String(endDayAfter.getUTCDate()).padStart(2, '0')}`;
    const endDateOnlyExclusive = new Date(`${endIso}T00:00:00.000Z`);

    return {
      startDate: range.startDate,
      endDate: range.endDate,
      startUtc: range.startUtc,
      endUtcExclusive: range.endUtcExclusive,
      startDateOnly,
      endDateOnlyExclusive,
      memberIds: members.value,
      projectIds: projects.value,
      clientIds: clients.value,
      sumDateRanges: coerceQueryBoolean(input.sumDateRanges, false),
      detailedReports: coerceQueryBoolean(input.detailedReports, false),
    };
  }

  /* ---------------------------------------------------------------- *
   * Aggregation
   * ---------------------------------------------------------------- */

  /**
   * Materialize the response — every branch of the aggregation matrix hangs
   * off `sumDateRanges` and `detailedReports` (spec requirements 26–29). The
   * flow: intersect the caller-supplied subject with in-org memberships (spec
   * §Cross-organization protection — a cross-org id contributes nothing),
   * fetch billable entries + approved vacations + holidays in the UTC range,
   * assemble per-entry rows with per-date rate lookup, aggregate, filter.
   */
  private async buildResponse(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery,
  ): Promise<AmountsOwedResponse> {
    // Resolve the subject membership set. The path parameter is never a filter;
    // every scope key is `caller.organizationId` (never falls back on missing
    // — a missing key would silently make the report cross-org).
    const memberships = await this.resolveSubjectMemberships(caller, scope, query);
    if (memberships.length === 0) {
      return this.emptyResponse(query, caller);
    }
    const memberIdSet = new Set(memberships.map((m) => m.id));

    const [entries, vacations, holidays, financialsRows, snapshotRows] = await Promise.all([
      this.fetchTimeEntries(caller.organizationId, memberIdSet, query),
      this.fetchApprovedVacations(caller.organizationId, memberIdSet, query),
      this.fetchHolidays(caller.organizationId, query),
      this.prisma.memberFinancials.findMany({
        where: {
          membershipId: { in: [...memberIdSet] },
          membership: { organizationId: caller.organizationId },
        },
      }),
      this.prisma.memberFinancialsSnapshot.findMany({
        where: {
          membershipId: { in: [...memberIdSet] },
          membership: { organizationId: caller.organizationId },
        },
      }),
    ]);

    const financialsByMember = new Map<string, { clientHourlyRate: number; monthlySalary: number }>();
    for (const f of financialsRows) {
      financialsByMember.set(f.membershipId, {
        clientHourlyRate: f.clientHourlyRate.toNumber(),
        monthlySalary: f.monthlySalary.toNumber(),
      });
    }
    const snapshotsByMember = new Map<
      string,
      { effectiveFrom: Date; clientHourlyRate: number; monthlySalary: number }[]
    >();
    for (const s of snapshotRows) {
      const arr = snapshotsByMember.get(s.membershipId) ?? [];
      arr.push({
        effectiveFrom: s.effectiveFrom,
        clientHourlyRate: s.clientHourlyRate.toNumber(),
        monthlySalary: s.monthlySalary.toNumber(),
      });
      snapshotsByMember.set(s.membershipId, arr);
    }

    // Build per-entry raw rows before grouping — the aggregation branches
    // consume the same input.
    interface RawRow {
      membershipId: string;
      memberName: string;
      activity: string;
      /** The date-only calendar day this row belongs to (UTC midnight). */
      dayKey: string;
      hours: number;
      rate: number;
      /** `hours * rate` for project/holiday; the frozen deductionAmount for vacation. */
      amount: number;
      kind: 'project' | 'holiday' | 'vacation';
    }
    const rawRows: RawRow[] = [];

    const memberById = new Map(memberships.map((m) => [m.id, m]));

    for (const entry of entries) {
      const member = memberById.get(entry.membershipId);
      if (!member) continue;
      const rate = resolveRateAtDate(
        snapshotsByMember.get(entry.membershipId) ?? [],
        financialsByMember.get(entry.membershipId) ?? null,
        entry.date,
      );
      const hours = entry.durationMinutes / 60;
      rawRows.push({
        membershipId: entry.membershipId,
        memberName: member.displayName,
        activity: entry.projectName ?? '(No project)',
        dayKey: this.dayKey(entry.date),
        hours,
        rate: rate.billRate,
        amount: hours * rate.billRate,
        kind: 'project',
      });
    }

    for (const holiday of holidays) {
      for (const member of memberships) {
        if (!isHolidayApplicableToMember(holiday, member)) continue;
        const rate = resolveRateAtDate(
          snapshotsByMember.get(member.id) ?? [],
          financialsByMember.get(member.id) ?? null,
          holiday.date,
        );
        const row = buildHolidayRow(
          {
            name: holiday.name,
            date: holiday.date,
            paidHours: holiday.paidHours,
            countryCode: holiday.countryCode,
          },
          {
            membershipId: member.id,
            displayName: member.displayName,
            countryCode: member.countryCode,
          },
          rate.billRate,
        );
        rawRows.push({
          membershipId: member.id,
          memberName: member.displayName,
          activity: row.activity,
          dayKey: this.dayKey(holiday.date),
          hours: Number(row.hours),
          rate: Number(row.rate),
          amount: Number(row.amount),
          kind: 'holiday',
        });
      }
    }

    for (const vacation of vacations) {
      const member = memberById.get(vacation.membershipId);
      if (!member) continue;
      const rate = resolveRateAtDate(
        snapshotsByMember.get(vacation.membershipId) ?? [],
        financialsByMember.get(vacation.membershipId) ?? null,
        vacation.startDate,
      );
      const row = buildVacationRow(
        {
          startDate: vacation.startDate,
          endDate: vacation.endDate,
          status: 'approved',
          workingDays: vacation.workingDays,
          deductionAmount: vacation.deductionAmount,
        },
        {
          membershipId: member.id,
          displayName: member.displayName,
          countryCode: member.countryCode,
        },
        rate.billRate,
      );
      if (!row) continue;
      rawRows.push({
        membershipId: member.id,
        memberName: member.displayName,
        activity: row.activity,
        dayKey: this.dayKey(vacation.startDate),
        hours: Number(row.hours),
        rate: Number(row.rate),
        amount: Number(row.amount),
        kind: 'vacation',
      });
    }

    // Group according to the aggregation matrix (spec §Aggregation branches).
    const groups = this.aggregate(rawRows, query, caller);

    // Grand-total summary.
    let totalHours = 0;
    let totalAmount = 0;
    for (const g of groups) {
      totalHours += Number(g.total.hours);
      totalAmount += Number(g.total.amount);
    }

    return {
      headers: AMOUNTS_OWED_HEADERS,
      groups,
      summary: [
        { label: 'Total hours', value: toHours(totalHours) },
        { label: 'Total amount', value: toMoney(totalAmount) },
      ],
      meta: {
        currencyCode: REPORT_CURRENCY_CODE,
        timezone: caller.timezone,
        startDate: query.startDate,
        endDate: query.endDate,
      },
    };
  }

  /**
   * Aggregate rows into groups. Each aggregation branch shapes the same input:
   *  - group key: `dayKey` (per-day) or the whole range (summed).
   *  - per member: either a single total row or one row per activity.
   * When `sumDateRanges=true`, the row's display rate is the
   * `weightedAverageRate` across per-entry samples; the row's amount is the
   * SUM of `hours * rate` (spec requirement 14 / TC-01-UNIT-15), never
   * `totalHours * displayRate`.
   */
  private aggregate(
    rawRows: {
      membershipId: string;
      memberName: string;
      activity: string;
      dayKey: string;
      hours: number;
      rate: number;
      amount: number;
      kind: 'project' | 'holiday' | 'vacation';
    }[],
    query: ParsedQuery,
    caller: Caller,
  ): AmountsOwedGroup[] {
    // Group key: whole-range for sum=true, per-day for sum=false.
    interface Bucket {
      hours: number;
      amount: number;
      samples: { hours: number; rate: number }[];
      kind: 'project' | 'holiday' | 'vacation';
    }
    // groupKey -> memberId -> (activity | totalKey) -> Bucket
    const grouped = new Map<string, Map<string, Map<string, Bucket>>>();
    const memberNames = new Map<string, string>();

    for (const row of rawRows) {
      const groupKey = query.sumDateRanges ? '__range__' : row.dayKey;
      const activityKey = query.detailedReports ? row.activity : '__member_total__';

      let members = grouped.get(groupKey);
      if (!members) {
        members = new Map();
        grouped.set(groupKey, members);
      }
      let activities = members.get(row.membershipId);
      if (!activities) {
        activities = new Map();
        members.set(row.membershipId, activities);
      }
      let bucket = activities.get(activityKey);
      if (!bucket) {
        bucket = { hours: 0, amount: 0, samples: [], kind: row.kind };
        activities.set(activityKey, bucket);
      }
      bucket.hours += row.hours;
      bucket.amount += row.amount;
      bucket.samples.push({ hours: row.hours, rate: row.rate });
      memberNames.set(row.membershipId, row.memberName);
    }

    // Emit groups in a stable order — per-day: ascending date, sum: single group.
    const groupKeysOrdered = query.sumDateRanges
      ? ['__range__']
      : [...grouped.keys()].sort();

    const result: AmountsOwedGroup[] = [];
    for (const gk of groupKeysOrdered) {
      const members = grouped.get(gk);
      if (!members) continue;
      const rows: AmountsOwedRow[] = [];
      let groupHours = 0;
      let groupAmount = 0;

      // Order members by name for a deterministic response.
      const memberIdsOrdered = [...members.keys()].sort((a, b) =>
        (memberNames.get(a) ?? '').localeCompare(memberNames.get(b) ?? ''),
      );

      for (const memberId of memberIdsOrdered) {
        const activities = members.get(memberId)!;
        // Sort activity keys — deterministic for tests; the "total" key is a
        // sentinel and there is only ever one activity bucket in that mode.
        const activityKeys = [...activities.keys()].sort();
        let memberHours = 0;
        let memberAmount = 0;
        const memberRows: AmountsOwedRow[] = [];

        for (const ak of activityKeys) {
          const bucket = activities.get(ak)!;
          // Weighted-average display rate — the row's amount is the sum of
          // per-entry `hours * rate`, not `sumHours * displayRate`.
          const wr = weightedAverageRate(bucket.samples);
          const displayRate = wr.displayRate;
          memberHours += bucket.hours;
          memberAmount += bucket.amount;
          memberRows.push({
            member: memberNames.get(memberId) ?? '',
            activity: ak === '__member_total__' ? 'Total' : ak,
            hours: toHours(bucket.hours),
            rate: toMoney(displayRate),
            amount: toMoney(bucket.amount),
            kind: bucket.kind,
          });
        }

        // Spec requirement 30 — drop members whose rows sum to 0/0 inside a group.
        if (isZeroTotal({ hours: toHours(memberHours), amount: toMoney(memberAmount) })) {
          continue;
        }
        rows.push(...memberRows);
        groupHours += memberHours;
        groupAmount += memberAmount;
      }

      // Spec requirement 30 — groups whose members all drop are dropped.
      if (rows.length === 0) continue;
      if (isZeroTotal({ hours: toHours(groupHours), amount: toMoney(groupAmount) })) continue;

      result.push({
        id: query.sumDateRanges
          ? `${query.startDate}_${query.endDate}`
          : gk,
        title: query.sumDateRanges
          ? this.formatRangeLabel(query, caller.timezone)
          : this.formatDayLabel(gk, caller.timezone),
        rows,
        total: { hours: toHours(groupHours), amount: toMoney(groupAmount) },
      });
    }

    return result;
  }

  /* ---------------------------------------------------------------- *
   * Fetches
   * ---------------------------------------------------------------- */

  /**
   * The subject set: on `my`, only the caller's own membership; on `all`, the
   * org's active + removed memberships (spec requirement 5), intersected with
   * `memberIds[]` when non-empty. A `memberIds[]` cuid resolving to another
   * org is dropped by the `organizationId` scope in `where` (spec §Security ·
   * Cross-organization protection).
   */
  private async resolveSubjectMemberships(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery,
  ): Promise<{ id: string; displayName: string; countryCode: string | null }[]> {
    if (scope === 'my') {
      return [
        {
          id: caller.membershipId,
          displayName: caller.displayName,
          countryCode: caller.countryCode,
        },
      ];
    }

    const memberships = await this.prisma.membership.findMany({
      where: {
        organizationId: caller.organizationId,
        // "every active + removed member with data in the range" — spec
        // requirement 5. Historical rows survive a `status = removed` (spec 12
        // §Concurrency 25 note).
        ...(query.memberIds.length > 0 ? { id: { in: query.memberIds } } : {}),
      },
      include: {
        account: {
          select: { firstName: true, lastName: true, phoneCountryCode: true },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.id,
      displayName: `${m.account.firstName} ${m.account.lastName}`.trim(),
      countryCode: m.account.phoneCountryCode ?? null,
    }));
  }

  private async fetchTimeEntries(
    organizationId: string,
    memberIdSet: Set<string>,
    query: ParsedQuery,
  ): Promise<{
    membershipId: string;
    projectId: string | null;
    projectName: string | null;
    date: Date;
    durationMinutes: number;
  }[]> {
    // Spec requirement 17 — non-billable entries are excluded from Amounts Owed.
    const rows = await this.prisma.timeEntry.findMany({
      where: {
        organizationId,
        billable: true,
        membershipId: { in: [...memberIdSet] },
        date: { gte: query.startDateOnly, lt: query.endDateOnlyExclusive },
        ...(query.projectIds.length > 0 ? { projectId: { in: query.projectIds } } : {}),
        ...(query.clientIds.length > 0
          ? { project: { clientId: { in: query.clientIds } } }
          : {}),
      },
      include: { project: { select: { name: true } } },
    });
    return rows.map((r) => ({
      membershipId: r.membershipId,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      date: r.date,
      durationMinutes: r.durationMinutes,
    }));
  }

  private async fetchApprovedVacations(
    organizationId: string,
    memberIdSet: Set<string>,
    query: ParsedQuery,
  ): Promise<{
    membershipId: string;
    startDate: Date;
    endDate: Date;
    workingDays: number;
    deductionAmount: number;
  }[]> {
    const rows = await this.prisma.vacationRequest.findMany({
      where: {
        status: 'approved',
        membershipId: { in: [...memberIdSet] },
        membership: { organizationId },
        // Overlap: start < endDayAfter AND end >= startDay. Both bounds are
        // UTC-midnight date-only Dates so the `@db.Date` cast Postgres does
        // on the RHS does not truncate away the day we care about.
        startDate: { lt: query.endDateOnlyExclusive },
        endDate: { gte: query.startDateOnly },
      },
    });
    return rows.map((r) => ({
      membershipId: r.membershipId,
      startDate: r.startDate,
      endDate: r.endDate,
      workingDays: r.workingDays,
      deductionAmount: r.deductionAmount.toNumber(),
    }));
  }

  private async fetchHolidays(
    organizationId: string,
    query: ParsedQuery,
  ): Promise<{
    id: string;
    name: string;
    date: Date;
    paidHours: number;
    countryCode: string | null;
  }[]> {
    const rows = await this.prisma.holiday.findMany({
      where: {
        organizationId,
        date: { gte: query.startDateOnly, lt: query.endDateOnlyExclusive },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      date: r.date,
      paidHours: r.paidHours.toNumber(),
      countryCode: r.countryCode,
    }));
  }

  /* ---------------------------------------------------------------- *
   * Formatting helpers
   * ---------------------------------------------------------------- */

  private emptyResponse(query: ParsedQuery, caller: Caller): AmountsOwedResponse {
    return {
      headers: AMOUNTS_OWED_HEADERS,
      groups: [],
      summary: [
        { label: 'Total hours', value: toHours(0) },
        { label: 'Total amount', value: toMoney(0) },
      ],
      meta: {
        currencyCode: REPORT_CURRENCY_CODE,
        timezone: caller.timezone,
        startDate: query.startDate,
        endDate: query.endDate,
      },
    };
  }

  /** UTC date-only key `YYYY-MM-DD` — for the per-day group key. */
  private dayKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private formatDayLabel(dayKey: string, timezone: string): string {
    try {
      // `dayKey` is already a UTC calendar day; render it in the caller's
      // timezone at midday to avoid a boundary swap on the label.
      const iso = `${dayKey}T00:00:00.000Z`;
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(iso));
    } catch {
      return dayKey;
    }
  }

  private formatRangeLabel(query: ParsedQuery, timezone: string): string {
    const start = this.formatDayLabel(query.startDate, timezone);
    const end = this.formatDayLabel(query.endDate, timezone);
    return `${start} – ${end}`;
  }

  private formatInstantIn(instant: Date, timezone: string): string {
    try {
      return new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      }).format(instant);
    } catch {
      return instant.toISOString();
    }
  }

  /* ---------------------------------------------------------------- *
   * Logging (spec §Security · Logging)
   * ---------------------------------------------------------------- */

  private logFetch(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery,
    response: AmountsOwedResponse,
    durationMs: number,
  ): void {
    const rowCount = response.groups.reduce((n, g) => n + g.rows.length, 0);
    this.logger.log(
      JSON.stringify({
        event: 'report_fetched',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        report: 'amounts-owed',
        ownerScope: scope,
        startDate: query.startDate,
        endDate: query.endDate,
        filters: {
          memberCount: query.memberIds.length,
          projectCount: query.projectIds.length,
          clientCount: query.clientIds.length,
          sumDateRanges: query.sumDateRanges,
          detailedReports: query.detailedReports,
        },
        rowCount,
        durationMs,
      }),
    );
  }

  private logExport(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery,
    response: AmountsOwedResponse,
    bytes: number,
    durationMs: number,
  ): void {
    const rowCount = response.groups.reduce((n, g) => n + g.rows.length, 0);
    this.logger.log(
      JSON.stringify({
        event: 'report_exported',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        report: 'amounts-owed',
        ownerScope: scope,
        startDate: query.startDate,
        endDate: query.endDate,
        filters: {
          memberCount: query.memberIds.length,
          projectCount: query.projectIds.length,
          clientCount: query.clientIds.length,
          sumDateRanges: query.sumDateRanges,
          detailedReports: query.detailedReports,
        },
        rowCount,
        bytes,
        durationMs,
      }),
    );
  }

  /* ---------------------------------------------------------------- *
   * Time & Activity — query, aggregation, logging
   * ---------------------------------------------------------------- */

  /**
   * Parse the shared query envelope plus the Time & Activity extras
   * (`columns[]`, `billable`). Column intersection happens here (server-side,
   * before any Prisma projection) so denied columns cannot leak. `billable`
   * runs through the shared validator; unknown values 422 (spec req 10).
   */
  private parseTimeAndActivityQuery(
    input: TimeAndActivityQueryInput,
    scope: ReportOwnerScope,
    caller: Caller,
  ): ParsedQuery & { columns: ReportColumn[]; billable: ReportBillableFilter } {
    const base = this.parseQuery(input, scope, caller);

    const billable = validateBillableFilter(input.billable);
    if (!billable.valid) {
      throw new UnprocessableEntityException({
        error: 'validation_error',
        fields: { billable: billable.error },
      });
    }

    // Express with the default `qs` parser gives us a string for a single
    // repeat and an array for multiple; the frontend may also send nothing.
    const requestedColumns: string[] = Array.isArray(input.columns)
      ? input.columns.filter((c): c is string => typeof c === 'string')
      : typeof input.columns === 'string'
        ? [input.columns]
        : [];
    const grants = {
      billed: can(caller.role, 'view-time-and-activity-billed'),
      spent: can(caller.role, 'view-time-and-activity-spent'),
    };
    const columns = intersectReportColumns(requestedColumns, grants);

    return { ...base, columns, billable: billable.value };
  }

  /**
   * Fetch entries + rates, aggregate by (project × member), and shape the
   * response with only the projected columns. Group total sums per column;
   * denied columns are absent from every row and every total.
   *
   * Aggregation branches (spec §Aggregation branches): T&A groups by project,
   * never by date, so `sumDateRanges` collapses into the same shape as the
   * default. `detailedReports` adds a per-day `details` breakdown inside
   * each per-member row.
   */
  private async buildTimeAndActivityResponse(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery & { columns: ReportColumn[]; billable: ReportBillableFilter },
  ): Promise<TimeAndActivityResponse> {
    const memberships = await this.resolveSubjectMemberships(caller, scope, query);
    if (memberships.length === 0) {
      return this.emptyTimeAndActivityResponse(query, caller);
    }
    const memberIdSet = new Set(memberships.map((m) => m.id));

    const [entries, financialsRows, snapshotRows] = await Promise.all([
      this.fetchTimeEntriesForTimeAndActivity(caller.organizationId, memberIdSet, query),
      this.prisma.memberFinancials.findMany({
        where: {
          membershipId: { in: [...memberIdSet] },
          membership: { organizationId: caller.organizationId },
        },
      }),
      this.prisma.memberFinancialsSnapshot.findMany({
        where: {
          membershipId: { in: [...memberIdSet] },
          membership: { organizationId: caller.organizationId },
        },
      }),
    ]);

    const financialsByMember = new Map<string, { clientHourlyRate: number; monthlySalary: number }>();
    for (const f of financialsRows) {
      financialsByMember.set(f.membershipId, {
        clientHourlyRate: f.clientHourlyRate.toNumber(),
        monthlySalary: f.monthlySalary.toNumber(),
      });
    }
    const snapshotsByMember = new Map<
      string,
      { effectiveFrom: Date; clientHourlyRate: number; monthlySalary: number }[]
    >();
    for (const s of snapshotRows) {
      const arr = snapshotsByMember.get(s.membershipId) ?? [];
      arr.push({
        effectiveFrom: s.effectiveFrom,
        clientHourlyRate: s.clientHourlyRate.toNumber(),
        monthlySalary: s.monthlySalary.toNumber(),
      });
      snapshotsByMember.set(s.membershipId, arr);
    }

    const memberById = new Map(memberships.map((m) => [m.id, m]));
    const columnSet = new Set<ReportColumn>(query.columns);

    // (projectId | 'no-project') -> memberId -> aggregate bucket
    interface Bucket {
      timeHours: number;
      billableHours: number;
      nonBillableHours: number;
      billedAmount: number;
      spent: number;
      notes: string[];
      /** dayKey -> per-day roll-up (only used when detailedReports=true). */
      perDay: Map<
        string,
        {
          timeHours: number;
          billableHours: number;
          nonBillableHours: number;
          billedAmount: number;
          spent: number;
        }
      >;
    }
    interface GroupMeta {
      projectId: string;
      projectName: string;
      clientName: string;
    }
    const buckets = new Map<string, Map<string, Bucket>>();
    const groupMeta = new Map<string, GroupMeta>();

    for (const entry of entries) {
      const member = memberById.get(entry.membershipId);
      if (!member) continue;
      const projectKey = entry.projectId ?? 'no-project';
      if (!groupMeta.has(projectKey)) {
        groupMeta.set(projectKey, {
          projectId: projectKey,
          projectName: entry.projectName ?? '(No project)',
          clientName: entry.clientName ?? '',
        });
      }

      const rate = resolveRateAtDate(
        snapshotsByMember.get(entry.membershipId) ?? [],
        financialsByMember.get(entry.membershipId) ?? null,
        entry.date,
      );
      const hours = entry.durationMinutes / 60;
      const billed = entry.billable ? hours * rate.billRate : 0;
      // Pay-rate math (`payRate = monthlySalary / HOURS_PER_MONTH_FOR_PAY_RATE`)
      // applies to EVERY entry, not just billable ones — Spent is the wage cost
      // of the time the member logged, whatever its billability.
      const spent = hours * rate.payRate;

      let byMember = buckets.get(projectKey);
      if (!byMember) {
        byMember = new Map();
        buckets.set(projectKey, byMember);
      }
      let bucket = byMember.get(entry.membershipId);
      if (!bucket) {
        bucket = {
          timeHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          billedAmount: 0,
          spent: 0,
          notes: [],
          perDay: new Map(),
        };
        byMember.set(entry.membershipId, bucket);
      }
      bucket.timeHours += hours;
      if (entry.billable) bucket.billableHours += hours;
      else bucket.nonBillableHours += hours;
      bucket.billedAmount += billed;
      bucket.spent += spent;
      if (entry.task && entry.task.trim().length > 0) bucket.notes.push(entry.task.trim());

      if (query.detailedReports) {
        const dayKey = this.dayKey(entry.date);
        const day = bucket.perDay.get(dayKey) ?? {
          timeHours: 0,
          billableHours: 0,
          nonBillableHours: 0,
          billedAmount: 0,
          spent: 0,
        };
        day.timeHours += hours;
        if (entry.billable) day.billableHours += hours;
        else day.nonBillableHours += hours;
        day.billedAmount += billed;
        day.spent += spent;
        bucket.perDay.set(dayKey, day);
      }
    }

    const groups: TimeAndActivityGroup[] = [];
    // Stable order: by project title.
    const orderedProjectKeys = [...buckets.keys()].sort((a, b) => {
      const ta = groupMeta.get(a)?.projectName ?? '';
      const tb = groupMeta.get(b)?.projectName ?? '';
      return ta.localeCompare(tb);
    });

    for (const projectKey of orderedProjectKeys) {
      const byMember = buckets.get(projectKey)!;
      const meta = groupMeta.get(projectKey)!;

      const orderedMemberIds = [...byMember.keys()].sort((a, b) =>
        (memberById.get(a)?.displayName ?? '').localeCompare(
          memberById.get(b)?.displayName ?? '',
        ),
      );

      const rows: TimeAndActivityRow[] = [];
      let totalTime = 0;
      let totalBillable = 0;
      let totalNonBillable = 0;
      let totalBilled = 0;
      let totalSpent = 0;

      for (const memberId of orderedMemberIds) {
        const bucket = byMember.get(memberId)!;
        const member = memberById.get(memberId)!;

        // Empty-row filter (spec req 30) — drop members whose total time is 0.
        if (Number(toHours(bucket.timeHours)) === 0) continue;

        const row: TimeAndActivityRow = {
          member: member.displayName,
          time: toHours(bucket.timeHours),
        };
        if (columnSet.has('Client')) row.client = meta.clientName;
        if (columnSet.has('Billable Time')) row.billableTime = toHours(bucket.billableHours);
        if (columnSet.has('Non-Billable Time'))
          row.nonBillableTime = toHours(bucket.nonBillableHours);
        if (columnSet.has('Billed Amount')) row.billedAmount = toMoney(bucket.billedAmount);
        if (columnSet.has('Spent')) row.spent = toMoney(bucket.spent);
        if (columnSet.has('Notes')) row.notes = this.summarizeNotes(bucket.notes);

        if (query.detailedReports && bucket.perDay.size > 0) {
          const details: TimeAndActivityDayDetail[] = [];
          const dayKeys = [...bucket.perDay.keys()].sort();
          for (const dk of dayKeys) {
            const d = bucket.perDay.get(dk)!;
            const detail: TimeAndActivityDayDetail = {
              date: dk,
              time: toHours(d.timeHours),
            };
            if (columnSet.has('Billable Time')) detail.billableTime = toHours(d.billableHours);
            if (columnSet.has('Non-Billable Time'))
              detail.nonBillableTime = toHours(d.nonBillableHours);
            if (columnSet.has('Billed Amount')) detail.billedAmount = toMoney(d.billedAmount);
            if (columnSet.has('Spent')) detail.spent = toMoney(d.spent);
            details.push(detail);
          }
          row.details = details;
        }

        rows.push(row);
        totalTime += bucket.timeHours;
        totalBillable += bucket.billableHours;
        totalNonBillable += bucket.nonBillableHours;
        totalBilled += bucket.billedAmount;
        totalSpent += bucket.spent;
      }

      if (rows.length === 0) continue;
      if (Number(toHours(totalTime)) === 0) continue;

      const total: TimeAndActivityGroup['total'] = { time: toHours(totalTime) };
      if (columnSet.has('Billable Time')) total.billableTime = toHours(totalBillable);
      if (columnSet.has('Non-Billable Time')) total.nonBillableTime = toHours(totalNonBillable);
      if (columnSet.has('Billed Amount')) total.billedAmount = toMoney(totalBilled);
      if (columnSet.has('Spent')) total.spent = toMoney(totalSpent);

      groups.push({
        id: meta.projectId,
        title: meta.clientName ? `${meta.projectName} · ${meta.clientName}` : meta.projectName,
        rows,
        total,
      });
    }

    // Summary strip.
    let sumTime = 0;
    let sumBillable = 0;
    let sumNonBillable = 0;
    let sumBilled = 0;
    let sumSpent = 0;
    for (const g of groups) {
      sumTime += Number(g.total.time);
      if (g.total.billableTime !== undefined) sumBillable += Number(g.total.billableTime);
      if (g.total.nonBillableTime !== undefined) sumNonBillable += Number(g.total.nonBillableTime);
      if (g.total.billedAmount !== undefined) sumBilled += Number(g.total.billedAmount);
      if (g.total.spent !== undefined) sumSpent += Number(g.total.spent);
    }

    const summary: { label: string; value: string }[] = [
      { label: 'Total time', value: toHours(sumTime) },
    ];
    if (columnSet.has('Billable Time'))
      summary.push({ label: 'Billable time', value: toHours(sumBillable) });
    if (columnSet.has('Non-Billable Time'))
      summary.push({ label: 'Non-billable time', value: toHours(sumNonBillable) });
    if (columnSet.has('Billed Amount'))
      summary.push({ label: 'Billed amount', value: toMoney(sumBilled) });
    if (columnSet.has('Spent')) summary.push({ label: 'Spent', value: toMoney(sumSpent) });

    return {
      headers: query.columns.map((c) => T_AND_A_HEADER_BY_COLUMN[c]),
      groups,
      summary,
      meta: {
        currencyCode: REPORT_CURRENCY_CODE,
        timezone: caller.timezone,
        startDate: query.startDate,
        endDate: query.endDate,
      },
    };
  }

  /** Fetch entries for T&A. Applies the `billable` row filter at the query. */
  private async fetchTimeEntriesForTimeAndActivity(
    organizationId: string,
    memberIdSet: Set<string>,
    query: ParsedQuery & { billable: ReportBillableFilter },
  ): Promise<{
    membershipId: string;
    projectId: string | null;
    projectName: string | null;
    clientName: string | null;
    date: Date;
    durationMinutes: number;
    billable: boolean;
    task: string | null;
  }[]> {
    const rows = await this.prisma.timeEntry.findMany({
      where: {
        organizationId,
        membershipId: { in: [...memberIdSet] },
        date: { gte: query.startDateOnly, lt: query.endDateOnlyExclusive },
        ...(query.projectIds.length > 0 ? { projectId: { in: query.projectIds } } : {}),
        ...(query.clientIds.length > 0
          ? { project: { clientId: { in: query.clientIds } } }
          : {}),
        ...(query.billable === 'billable' ? { billable: true } : {}),
        ...(query.billable === 'non-billable' ? { billable: false } : {}),
      },
      include: {
        project: { select: { name: true, client: { select: { name: true } } } },
      },
    });
    return rows.map((r) => ({
      membershipId: r.membershipId,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      clientName: r.project?.client?.name ?? null,
      date: r.date,
      durationMinutes: r.durationMinutes,
      billable: r.billable,
      task: r.task,
    }));
  }

  /** Comma-join tasks and truncate at ~120 chars (spec §Row `notes`). */
  private summarizeNotes(tasks: readonly string[]): string {
    if (tasks.length === 0) return '';
    const dedup: string[] = [];
    const seen = new Set<string>();
    for (const t of tasks) {
      if (!seen.has(t)) {
        seen.add(t);
        dedup.push(t);
      }
    }
    const joined = dedup.join(', ');
    if (joined.length <= T_AND_A_NOTES_MAX) return joined;
    return joined.slice(0, T_AND_A_NOTES_MAX - 1).trimEnd() + '…';
  }

  private emptyTimeAndActivityResponse(
    query: ParsedQuery & { columns: ReportColumn[] },
    caller: Caller,
  ): TimeAndActivityResponse {
    const columnSet = new Set<ReportColumn>(query.columns);
    const summary: { label: string; value: string }[] = [
      { label: 'Total time', value: toHours(0) },
    ];
    if (columnSet.has('Billable Time'))
      summary.push({ label: 'Billable time', value: toHours(0) });
    if (columnSet.has('Non-Billable Time'))
      summary.push({ label: 'Non-billable time', value: toHours(0) });
    if (columnSet.has('Billed Amount'))
      summary.push({ label: 'Billed amount', value: toMoney(0) });
    if (columnSet.has('Spent')) summary.push({ label: 'Spent', value: toMoney(0) });

    return {
      headers: query.columns.map((c) => T_AND_A_HEADER_BY_COLUMN[c]),
      groups: [],
      summary,
      meta: {
        currencyCode: REPORT_CURRENCY_CODE,
        timezone: caller.timezone,
        startDate: query.startDate,
        endDate: query.endDate,
      },
    };
  }

  private logTimeAndActivityFetch(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery & { columns: ReportColumn[]; billable: ReportBillableFilter },
    response: TimeAndActivityResponse,
    durationMs: number,
  ): void {
    const rowCount = response.groups.reduce((n, g) => n + g.rows.length, 0);
    this.logger.log(
      JSON.stringify({
        event: 'report_fetched',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        report: 'time-and-activity',
        ownerScope: scope,
        startDate: query.startDate,
        endDate: query.endDate,
        filters: {
          memberCount: query.memberIds.length,
          projectCount: query.projectIds.length,
          clientCount: query.clientIds.length,
          sumDateRanges: query.sumDateRanges,
          detailedReports: query.detailedReports,
          billable: query.billable,
          columns: query.columns.map((c) => String(c)),
        },
        rowCount,
        durationMs,
      }),
    );
  }

  private logTimeAndActivityExport(
    caller: Caller,
    scope: ReportOwnerScope,
    query: ParsedQuery & { columns: ReportColumn[]; billable: ReportBillableFilter },
    response: TimeAndActivityResponse,
    bytes: number,
    durationMs: number,
  ): void {
    const rowCount = response.groups.reduce((n, g) => n + g.rows.length, 0);
    this.logger.log(
      JSON.stringify({
        event: 'report_exported',
        actorAccountId: caller.accountId,
        organizationId: caller.organizationId,
        report: 'time-and-activity',
        ownerScope: scope,
        startDate: query.startDate,
        endDate: query.endDate,
        filters: {
          memberCount: query.memberIds.length,
          projectCount: query.projectIds.length,
          clientCount: query.clientIds.length,
          sumDateRanges: query.sumDateRanges,
          detailedReports: query.detailedReports,
          billable: query.billable,
          columns: query.columns.map((c) => String(c)),
        },
        rowCount,
        bytes,
        durationMs,
      }),
    );
  }
}

// Referenced only to keep `AmountRow` in the module graph for tests that import it.
export type { AmountRow };

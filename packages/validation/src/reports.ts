/**
 * Reports validation — specs/reports/01-reports.md.
 *
 * Pure isomorphic helpers shared by the NestJS API (which re-runs every rule
 * server-side on every report request) and by the report screens (whose copy is
 * a convenience, never a gate). No I/O; the current wall clock is never read.
 *
 * Every amount is quantized to two decimals via {@link toMoney}; every hours
 * total via {@link toHours}. The Prisma `Decimal` columns for money and hours
 * are converted to `number` at the service boundary (see `vacation-requests`),
 * and downstream math uses plain JS numbers with an explicit quantize step. A
 * dedicated Decimal library is deliberately not pulled in for this — the
 * arithmetic is `hours * rate` and a running sum, which two-decimal
 * quantization at the boundary handles without cumulative FP drift.
 */

import { REPORTS_MESSAGES } from './reports-messages';
import { zonedWallClockToUtc } from './index';
export { REPORTS_MESSAGES } from './reports-messages';

/**
 * Number of "billable hours in a month" the pay-rate math divides by:
 * `payRate = monthlySalary / HOURS_PER_MONTH_FOR_PAY_RATE`. Constant from
 * Teammerly parity (spec requirement 13). Not `BILLABLE_HOURS_PER_YEAR / 12`
 * because Teammerly picked 168, not 173.33 — reports must match the pay slip.
 */
export const HOURS_PER_MONTH_FOR_PAY_RATE = 168;

/**
 * Widest range a report accepts (spec requirement 3). One year plus a week
 * covers "the whole of 2026" queries submitted a few days into 2027, without
 * enabling multi-year sweeps that would blow past the PDF budget.
 */
export const REPORT_MAX_RANGE_DAYS = 370;

/**
 * PDF backpressure — a range whose aggregation produces more rows than this
 * returns 422 `range_too_large_for_pdf` (spec requirement 37).
 */
export const REPORT_PDF_ROW_BUDGET = 3000;

/** Rate limit for PDF endpoints — a fresh Playwright launch is expensive (spec §Security · Rate limiting). */
export const REPORT_PDF_RATE_LIMIT_PER_MINUTE = 10;

/** Currency emitted on every response's `meta.currencyCode` in v1 (spec §Currency). */
export const REPORT_CURRENCY_CODE = 'USD';

/**
 * The full column set Time & Activity supports (spec requirement 8). Two of
 * these — `Billed Amount` and `Spent` — are permission-gated; the other three
 * optional columns require only the base `View*TimeAndActivity` capability.
 */
export const REPORT_COLUMNS = [
  'Project',
  'Time',
  'Member',
  'Client',
  'Billable Time',
  'Non-Billable Time',
  'Billed Amount',
  'Spent',
  'Notes',
] as const;
export type ReportColumn = (typeof REPORT_COLUMNS)[number];

/**
 * Always shown; the request cannot deselect them and the response cannot omit
 * them (spec requirement 9). Named as a separate constant so a future spec can
 * change the default set in one place.
 */
export const REPORT_ALWAYS_SHOWN_COLUMNS: readonly ReportColumn[] = ['Project', 'Time', 'Member'];

/** Columns whose visibility is gated by capabilities beyond the base `View*`. */
export const REPORT_COLUMN_CAPABILITY: Partial<Record<ReportColumn, 'billed' | 'spent'>> = {
  'Billed Amount': 'billed',
  Spent: 'spent',
};

/** The three reports (spec §Summary). */
export type ReportKind = 'amounts-owed' | 'time-and-activity' | 'time-off';

/** Owner scope on every endpoint (spec §Owner scope). */
export type ReportOwnerScope = 'all' | 'my';

/** ISO calendar date, no time component (spec §Query shape). */
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Membership / Project / Client ids. The schema currently uses `@default(uuid())`
 * for every primary key that reaches these filters (see `apps/api/prisma/schema.prisma`),
 * so the accepted shape is a lowercase hyphenated UUID. A shorter cuid form is
 * also accepted so a future migration to cuid-based ids does not silently start
 * 422-ing every filter. Rejects anything else (empty string, whitespace, upper
 * case, wrong length).
 */
const ID_PATTERN = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-z0-9]{7,32})$/;

// ────────────────────────────────────────────────────────────────────────────
// Range validation (spec Validation Rules 1–4)
// ────────────────────────────────────────────────────────────────────────────

export type RangeValidation =
  | {
      valid: true;
      startDate: string;
      endDate: string;
      /** Inclusive lower bound in UTC (start-of-day in the caller's timezone). */
      startUtc: Date;
      /** Exclusive upper bound in UTC (start-of-day of `endDate + 1` in the caller's timezone). */
      endUtcExclusive: Date;
    }
  | { valid: false; error: string; field: 'startDate' | 'endDate' | 'range' };

/** Days between two ISO dates, inclusive of both endpoints (spec requirement 3). */
function inclusiveDayCount(startY: number, startM: number, startD: number, endY: number, endM: number, endD: number): number {
  const start = Date.UTC(startY, startM - 1, startD);
  const end = Date.UTC(endY, endM - 1, endD);
  return Math.floor((end - start) / 86_400_000) + 1;
}

function parseIsoDate(input: unknown): { y: number; m: number; d: number } | null {
  if (typeof input !== 'string' || !ISO_DATE_PATTERN.test(input)) return null;
  const [y, m, d] = input.split('-').map(Number);
  // Reject calendar-impossible dates (e.g. 2026-02-30) — Date normalises them silently.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/**
 * Validate a report date range and produce the UTC boundaries the service uses
 * for its Prisma `date >= startUtc AND date < endUtcExclusive` filter (spec
 * requirements 1–3). `endDate` is inclusive by intent, so the upper bound is
 * the start-of-day of the *next* day in the caller's timezone — exclusive.
 */
export function validateReportRange(
  startInput: unknown,
  endInput: unknown,
  timezone: string,
): RangeValidation {
  if (typeof startInput !== 'string' || startInput.trim().length === 0) {
    return { valid: false, field: 'startDate', error: REPORTS_MESSAGES.startDateRequired };
  }
  if (typeof endInput !== 'string' || endInput.trim().length === 0) {
    return { valid: false, field: 'endDate', error: REPORTS_MESSAGES.endDateRequired };
  }
  const start = parseIsoDate(startInput);
  if (!start) return { valid: false, field: 'startDate', error: REPORTS_MESSAGES.startDateInvalid };
  const end = parseIsoDate(endInput);
  if (!end) return { valid: false, field: 'endDate', error: REPORTS_MESSAGES.endDateInvalid };

  const days = inclusiveDayCount(start.y, start.m, start.d, end.y, end.m, end.d);
  if (days <= 0) {
    return { valid: false, field: 'range', error: REPORTS_MESSAGES.endBeforeStart };
  }
  if (days > REPORT_MAX_RANGE_DAYS) {
    return { valid: false, field: 'range', error: REPORTS_MESSAGES.rangeTooWide };
  }

  const tz = typeof timezone === 'string' && timezone.length > 0 ? timezone : 'UTC';
  const startUtc = zonedWallClockToUtc(startInput, '00:00', tz);
  // Exclusive upper bound = start-of-day of endDate + 1 (spec requirement 2:
  // `endDate` is inclusive; its end-of-day in the caller's timezone becomes
  // the upper UTC boundary).
  const dayAfterEnd = new Date(Date.UTC(end.y, end.m - 1, end.d + 1));
  const dayAfterEndIso = `${dayAfterEnd.getUTCFullYear()}-${String(dayAfterEnd.getUTCMonth() + 1).padStart(2, '0')}-${String(dayAfterEnd.getUTCDate()).padStart(2, '0')}`;
  const endUtcExclusive = zonedWallClockToUtc(dayAfterEndIso, '00:00', tz);

  return {
    valid: true,
    startDate: startInput,
    endDate: endInput,
    startUtc,
    endUtcExclusive,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Cuid list validation (memberIds, projectIds, clientIds — spec §Validation Rules 5–6)
// ────────────────────────────────────────────────────────────────────────────

export function validateCuidList(
  input: unknown,
  message: string,
): { valid: true; value: string[] } | { valid: false; error: string } {
  if (input === undefined || input === null) return { valid: true, value: [] };
  const arr = Array.isArray(input) ? input : [input];
  const value: string[] = [];
  for (const item of arr) {
    if (typeof item !== 'string' || !ID_PATTERN.test(item)) {
      return { valid: false, error: message };
    }
    value.push(item);
  }
  return { valid: true, value };
}

// ────────────────────────────────────────────────────────────────────────────
// Boolean coercion for query params (spec §Validation Rules 8)
// ────────────────────────────────────────────────────────────────────────────

export function coerceQueryBoolean(input: unknown, fallback = false): boolean {
  if (typeof input === 'boolean') return input;
  if (input === undefined || input === null) return fallback;
  if (typeof input === 'string') {
    const s = input.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0' || s === '') return false;
  }
  return fallback;
}

// ────────────────────────────────────────────────────────────────────────────
// Column intersection (spec §Column permission filter — requirements 8–11)
// ────────────────────────────────────────────────────────────────────────────

export interface ReportColumnGrants {
  billed: boolean;
  spent: boolean;
}

/**
 * Server-side column projection resolver (spec requirement 11). Takes the
 * caller's requested columns, intersects with capability grants, and unions
 * with the always-shown defaults. Unknown items in `requested` are silently
 * dropped (spec Validation Rule 7 — client and server column lists may drift
 * on the always-shown defaults). Order matches {@link REPORT_COLUMNS} so the
 * response `headers` array is deterministic regardless of caller ordering.
 */
export function intersectReportColumns(
  requested: readonly string[] | undefined,
  grants: ReportColumnGrants,
): ReportColumn[] {
  const requestedSet = new Set<string>(
    (requested ?? []).filter((c): c is string => typeof c === 'string'),
  );
  const alwaysShown = new Set<ReportColumn>(REPORT_ALWAYS_SHOWN_COLUMNS);
  const result: ReportColumn[] = [];
  for (const col of REPORT_COLUMNS) {
    if (alwaysShown.has(col)) {
      result.push(col);
      continue;
    }
    if (!requestedSet.has(col)) continue;
    const gate = REPORT_COLUMN_CAPABILITY[col];
    if (gate === 'billed' && !grants.billed) continue;
    if (gate === 'spent' && !grants.spent) continue;
    result.push(col);
  }
  return result;
}

// ────────────────────────────────────────────────────────────────────────────
// PDF filename (spec requirement 35)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Filename-hostile characters. The final filename is emitted with SPACES for
 * readability (`Amounts Owed 2026-09-02.pdf`) — spaces are fine on every OS
 * we ship to. Path separators (`/`, `\`), colons and other reserved
 * characters get replaced with a hyphen so a report type someone renames to
 * something exotic still yields a saveable file.
 */
const FILENAME_HOSTILE_PATTERN = /[\\/:*?"<>|\r\n\t]+/g;
const REPORT_FILENAME_MAX = 200;

/**
 * Compose the PDF filename per the user-facing format:
 *   - Single-day range: `{Report Display Name} {startYYYY-MM-DD}.pdf`
 *   - Multi-day range:  `{Report Display Name} {startYYYY-MM-DD}_to_{endYYYY-MM-DD}.pdf`
 *
 * The organization name is intentionally NOT included — the person saving
 * the file is already inside their organization; adding the org to every
 * filename is noise. If a future spec introduces cross-org sharing, the
 * PDF's *header* is the right place to name the org, not the filename.
 *
 * `reportType` is the display name (`"Amounts Owed"`, `"Time & Activity"`,
 * `"Time Off"`), not a CamelCase code. Filesystem-hostile characters in the
 * display name are replaced with a hyphen; multiple spaces collapse to one;
 * length is clamped to 200 characters (dates are always kept, the name is
 * what gets truncated).
 */
export function pdfReportFilename(
  reportType: string,
  startDate: string,
  endDate: string,
): string {
  const cleanName = (reportType ?? '')
    .replace(FILENAME_HOSTILE_PATTERN, '-')
    .replace(/\s+/g, ' ')
    .trim();
  const name = cleanName.length > 0 ? cleanName : 'Report';
  const dates = startDate === endDate ? startDate : `${startDate}_to_${endDate}`;
  const suffix = ` ${dates}.pdf`;
  const filename = `${name}${suffix}`;
  if (filename.length <= REPORT_FILENAME_MAX) return filename;
  const cap = Math.max(1, REPORT_FILENAME_MAX - suffix.length);
  return `${name.slice(0, cap)}${suffix}`;
}

// ────────────────────────────────────────────────────────────────────────────
// Money and hours quantization
// ────────────────────────────────────────────────────────────────────────────

/**
 * Round half-away-from-zero to two decimals. Matches Postgres `Decimal(n,2)`
 * behavior for the values reports emit; avoids the "banker's rounding" quirk
 * of `Number.prototype.toFixed` for `.5` boundaries.
 */
function roundHalfAway(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** decimals;
  return Math.sign(value) * Math.round(Math.abs(value) * factor) / factor;
}

export function toMoney(value: number): string {
  return roundHalfAway(value, 2).toFixed(2);
}

export function toHours(value: number): string {
  return roundHalfAway(value, 2).toFixed(2);
}

// ────────────────────────────────────────────────────────────────────────────
// Rate lookup (spec §Rate lookup — requirements 12–14)
// ────────────────────────────────────────────────────────────────────────────

export interface RateSnapshot {
  effectiveFrom: Date;
  clientHourlyRate: number;
  monthlySalary: number;
}

export interface LiveMemberFinancials {
  clientHourlyRate: number;
  monthlySalary: number;
}

export interface ResolvedRate {
  billRate: number;
  payRate: number;
}

/**
 * Resolve the rate in effect on `date` for a member: the newest snapshot with
 * `effectiveFrom <= date`, falling back to the live `MemberFinancials` if no
 * snapshot precedes the date (spec requirement 12). If neither is available,
 * both rates are 0 — a member with no financials contributes 0.00 to every
 * amount but is still present in the aggregation for hour totals.
 */
export function resolveRateAtDate(
  snapshots: readonly RateSnapshot[],
  live: LiveMemberFinancials | null,
  date: Date,
): ResolvedRate {
  let picked: RateSnapshot | null = null;
  for (const snap of snapshots) {
    if (snap.effectiveFrom.getTime() > date.getTime()) continue;
    if (!picked || snap.effectiveFrom.getTime() > picked.effectiveFrom.getTime()) {
      picked = snap;
    }
  }
  const source = picked ?? live;
  if (!source) return { billRate: 0, payRate: 0 };
  const billRate = Number(source.clientHourlyRate) || 0;
  const monthlySalary = Number(source.monthlySalary) || 0;
  const payRate = monthlySalary > 0 ? monthlySalary / HOURS_PER_MONTH_FOR_PAY_RATE : 0;
  return { billRate, payRate };
}

// ────────────────────────────────────────────────────────────────────────────
// Weighted-average rate (spec requirement 14)
// ────────────────────────────────────────────────────────────────────────────

export interface RateSample {
  hours: number;
  rate: number;
}

export interface WeightedRate {
  totalHours: number;
  totalAmount: number;
  /**
   * The display rate: `totalAmount / totalHours`, or `0` if `totalHours` is 0.
   * Never `sumHours * displayRate` — the row's `amount` is the sum of
   * `hours * rate` per entry, and the display rate is derived from it.
   */
  displayRate: number;
}

export function weightedAverageRate(samples: readonly RateSample[]): WeightedRate {
  let totalHours = 0;
  let totalAmount = 0;
  for (const s of samples) {
    totalHours += s.hours;
    totalAmount += s.hours * s.rate;
  }
  const displayRate = totalHours > 0 ? totalAmount / totalHours : 0;
  return { totalHours, totalAmount, displayRate };
}

// ────────────────────────────────────────────────────────────────────────────
// Holiday row generator (spec requirement 18)
// ────────────────────────────────────────────────────────────────────────────

export interface HolidayInput {
  name: string;
  date: Date;
  paidHours: number;
  /** ISO 3166-1 alpha-2 uppercase, or null for global. */
  countryCode: string | null;
}

export interface HolidayMemberInput {
  membershipId: string;
  displayName: string;
  /** Member's country per spec org/03 §14–15 (nullable). */
  countryCode: string | null;
}

export interface AmountRow {
  membershipId: string;
  member: string;
  activity: string;
  date: Date;
  hours: string;
  rate: string;
  amount: string;
  kind: 'project' | 'holiday' | 'vacation';
}

/**
 * `null` countryCode on the holiday means global — applies to every member
 * (spec requirement 18 / TC-01-INT-14). Otherwise only members with a
 * matching country code get the row.
 */
export function isHolidayApplicableToMember(
  holiday: Pick<HolidayInput, 'countryCode'>,
  member: Pick<HolidayMemberInput, 'countryCode'>,
): boolean {
  if (holiday.countryCode === null) return true;
  if (member.countryCode === null) return false;
  return holiday.countryCode.toUpperCase() === member.countryCode.toUpperCase();
}

export function buildHolidayRow(
  holiday: HolidayInput,
  member: HolidayMemberInput,
  billRate: number,
): AmountRow {
  const hours = Number(holiday.paidHours) || 0;
  const amount = hours * billRate;
  return {
    membershipId: member.membershipId,
    member: member.displayName,
    activity: `Holiday · ${holiday.name}`,
    date: holiday.date,
    hours: toHours(hours),
    rate: toMoney(billRate),
    amount: toMoney(amount),
    kind: 'holiday',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Vacation row generator (spec requirements 22–23)
// ────────────────────────────────────────────────────────────────────────────

export type VacationStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface VacationInput {
  startDate: Date;
  endDate: Date;
  status: VacationStatus;
  workingDays: number;
  /** Frozen deduction — never recomputed by the report (spec requirement 22). */
  deductionAmount: number;
}

/**
 * Only approved vacation requests produce an Amounts Owed row (spec
 * requirement 23). Pending / rejected / cancelled return `null` — the caller
 * skips them without adding a row. Time Off report handles the other statuses
 * with a different projection (spec requirement 24–25).
 */
export function buildVacationRow(
  vacation: VacationInput,
  member: HolidayMemberInput,
  billRate: number,
): AmountRow | null {
  if (vacation.status !== 'approved') return null;
  const hours = (Number(vacation.workingDays) || 0) * 8;
  const amount = Number(vacation.deductionAmount) || 0;
  return {
    membershipId: member.membershipId,
    member: member.displayName,
    activity: 'Vacation (approved)',
    date: vacation.startDate,
    hours: toHours(hours),
    rate: toMoney(billRate),
    amount: toMoney(amount),
    kind: 'vacation',
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Empty-row filter (spec requirement 30)
// ────────────────────────────────────────────────────────────────────────────

export function isZeroTotal(total: { hours: string; amount: string }): boolean {
  return Number(total.hours) === 0 && Number(total.amount) === 0;
}

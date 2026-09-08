/**
 * Portal spec 01 (Home) — the shapes `GET .../portal/home` and `GET .../portal/news`
 * answer (`01-home.contracts.md` §Routes), and the small formatting helpers the panels
 * share. No user-facing message lives here — those are `PORTAL_MESSAGES`, imported from
 * `@devscribed/validation` at each call site.
 */

export interface PortalMonthProject {
  projectId: string | null;
  /** Already labelled by the server — `PORTAL_MESSAGES.noProject` for the no-project row. */
  projectName: string;
  minutes: number;
}

export interface PortalMonth {
  startDate: string;
  endDate: string;
  /** The caller's own today, resolved in `Account.timezone` (REQ-01-010). */
  today: string;
  timezone: string;
  totalMinutes: number;
  daysWithEntry: number;
  byProject: PortalMonthProject[];
}

/** `null` in full when the membership has no `MemberFinancials` row (REQ-01-016). */
export interface PortalTimeOff {
  availableDays: number;
  usedDays: number;
  pendingDays: number;
  totalDaysPerYear: number;
}

export interface PortalHolidayItem {
  id: string;
  date: string;
  name: string;
}

/** `countryCode` is `null` when nobody has stated one — REQ-01-019 answers only the
 *  global rows then, and `upcoming` carries them. */
export interface PortalHolidays {
  countryCode: string | null;
  upcoming: PortalHolidayItem[];
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

export interface PortalRequests {
  openTotal: number;
  items: PortalRequestItem[];
}

export interface PortalHomeResponse {
  month: PortalMonth;
  timeOff: PortalTimeOff | null;
  holidays: PortalHolidays;
  requests: PortalRequests;
  canManageSettings: boolean;
}

export type PortalFeedKind =
  | 'member-joined'
  | 'member-anniversary'
  | 'vacancy-opened'
  | 'project-started';

export type PortalFeedGroup = 'people' | 'hiring' | 'work';

export interface PortalFeedSubject {
  kind: 'member' | 'vacancy' | 'project';
  id: string;
  name: string;
  initials: string | null;
}

/** `detail`'s shape depends on `kind` — see §Routes for the fields each one carries. */
export interface PortalFeedEntry {
  id: string;
  kind: PortalFeedKind;
  group: PortalFeedGroup;
  occurredAt: string;
  subject: PortalFeedSubject;
  detail: Record<string, unknown>;
}

export interface PortalNewsResponse {
  entries: PortalFeedEntry[];
  /** Absent when no page follows (REQ-01-025). */
  nextCursor?: string;
}

/** `17.5` stays `"17.5"`; `20` stays `"20"` — a reserve is not a decimal display by default. */
export function formatDays(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** `'2026-11-01'` → the UTC midnight it names, for pure calendar-date arithmetic. */
function parseIsoDate(ymd: string): Date {
  const [year, month, day] = ymd.split('-').map((part) => Number(part));
  return new Date(Date.UTC(year, month - 1, day));
}

/**
 * `'2026-11-01'` → `'Sunday, 1 November'`, the greeting's date.
 *
 * It is formatted from `month.today` — the server's answer, resolved in the caller's own
 * `Account.timezone` (REQ-01-010) — and never from `new Date()` here. A browser clock is a
 * second source for a value the body already carries, and the two disagree for exactly the
 * caller a timezone exists for: at 09:00 in Auckland the browser's UTC date is still
 * yesterday, and the greeting would name a different day than the month below it was
 * computed for.
 */
export function formatGreetingDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(parseIsoDate(ymd));
}

/** `'2026-11-01'` → `'1 Nov'`, the short form the holiday and request rows both use. */
export function formatShortDate(ymd: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(parseIsoDate(ymd));
}

/** Whole days `to - from`, both `'YYYY-MM-DD'`. Positive when `to` is later. */
export function daysBetween(fromYmd: string, toYmd: string): number {
  const ms = parseIsoDate(toYmd).getTime() - parseIsoDate(fromYmd).getTime();
  return Math.round(ms / 86_400_000);
}

/** `'in 54 days'` / `'tomorrow'` / `'today'` — the holiday row's trailing text. */
export function awayLabel(todayYmd: string, targetYmd: string): string {
  const diff = daysBetween(todayYmd, targetYmd);
  if (diff <= 0) return 'today';
  if (diff === 1) return 'tomorrow';
  return `in ${diff} days`;
}

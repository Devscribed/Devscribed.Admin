/**
 * Calendar arithmetic for the Time Tracking views (spec 12). Everything is expressed as
 * `YYYY-MM-DD` strings and computed via UTC-midnight `Date`s, so month/week stepping never
 * drifts across daylight-saving boundaries or the viewer's local timezone. The week start
 * is parameterized by `weekStartsOn` (0 = Sunday, 1 = Monday — the account's
 * `firstDayOfWeek` preference, spec 06): the weekly columns, the monthly grid's first
 * column + header order, and the week-range label all shift with it.
 */

/** Which weekday a week begins on: 0 = Sunday, 1 = Monday (the only two valid values). */
export type WeekStart = 0 | 1;

/** Map the account's `firstDayOfWeek` preference ("Monday" default, or "Sunday") to a
 * `WeekStart`. Anything other than "Sunday" falls back to Monday. */
export function weekStartFromPreference(firstDayOfWeek: string): WeekStart {
  return firstDayOfWeek === 'Sunday' ? 0 : 1;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];
const WEEKDAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/** Today in the viewer's local calendar, as `YYYY-MM-DD`. Drives the default period and the
 * `validateTimeEntry` "today" reference. */
export function todayISO(): string {
  const now = new Date();
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Compose a `YYYY-MM-DD` from y / 0-based month / day. */
function toISO(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

/** Parse `YYYY-MM-DD` into a UTC-midnight `Date`. */
function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromDate(d: Date): string {
  return toISO(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** Add `n` days (may be negative). */
export function addDays(iso: string, n: number): string {
  const d = parse(iso);
  d.setUTCDate(d.getUTCDate() + n);
  return fromDate(d);
}

/** Add `n` calendar months, clamping the day to the target month's length. */
export function addMonths(iso: string, n: number): string {
  const d = parse(iso);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return fromDate(d);
}

/** 0 = Monday … 6 = Sunday. Date-intrinsic (independent of the week start) — drives the
 * weekday abbreviation and the weekend test. */
export function weekdayMon0(iso: string): number {
  return (parse(iso).getUTCDay() + 6) % 7;
}

/** The date's 0-based offset from the start of its week, given `weekStartsOn`
 * (0 = Sunday-first, 1 = Monday-first). Monday-first reduces to `weekdayMon0`. */
function weekOffset(iso: string, weekStartsOn: WeekStart): number {
  return (parse(iso).getUTCDay() - weekStartsOn + 7) % 7;
}

/** Saturday/Sunday — a property of the date itself, so it is unaffected by the week start. */
export function isWeekend(iso: string): boolean {
  return weekdayMon0(iso) >= 5;
}

/** The first day (per `weekStartsOn`) of the week containing `iso`. */
export function startOfWeek(iso: string, weekStartsOn: WeekStart = 1): string {
  return addDays(iso, -weekOffset(iso, weekStartsOn));
}

export function endOfWeek(iso: string, weekStartsOn: WeekStart = 1): string {
  return addDays(startOfWeek(iso, weekStartsOn), 6);
}

export function startOfMonth(iso: string): string {
  const d = parse(iso);
  return toISO(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

export function endOfMonth(iso: string): string {
  const d = parse(iso);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return toISO(d.getUTCFullYear(), d.getUTCMonth(), last);
}

/** The seven `YYYY-MM-DD` dates of the week containing `iso`, ordered from `weekStartsOn`. */
export function weekDates(iso: string, weekStartsOn: WeekStart = 1): string[] {
  const first = startOfWeek(iso, weekStartsOn);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** The seven weekday abbreviations in header order for the given week start
 * (Mon…Sun for Monday-first, Sun…Sat for Sunday-first). */
export function weekdayAbbrHeaders(weekStartsOn: WeekStart = 1): string[] {
  return Array.from({ length: 7 }, (_, i) => {
    const utcDay = (weekStartsOn + i) % 7; // 0 = Sun … 6 = Sat
    return WEEKDAY_ABBR[(utcDay + 6) % 7]; // convert to Mon0-indexed abbreviation
  });
}

/** One cell of the monthly grid: its date and whether it belongs to the displayed month. */
export interface MonthCell {
  date: string;
  inMonth: boolean;
}

/**
 * The 6-week (42-cell) monthly grid for the month containing `iso`, starting on the first
 * week day (per `weekStartsOn`) on or before the 1st. Leading/trailing cells belong to the
 * adjacent months (rendered "—" and never fetched — spec 12 resolved data note 4).
 */
export function monthGrid(iso: string, weekStartsOn: WeekStart = 1): MonthCell[] {
  const first = startOfMonth(iso);
  const monthIndex = parse(first).getUTCMonth();
  const gridStart = startOfWeek(first, weekStartsOn);
  return Array.from({ length: 42 }, (_, i) => {
    const date = addDays(gridStart, i);
    return { date, inMonth: parse(date).getUTCMonth() === monthIndex };
  });
}

export function dayNumber(iso: string): number {
  return parse(iso).getUTCDate();
}

/** "August 2026" — the monthly period label. */
export function formatMonthLabel(iso: string): string {
  const d = parse(iso);
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "Aug 24 – 30, 2026" (or spanning months/years) — the weekly period label. */
export function formatWeekLabel(iso: string, weekStartsOn: WeekStart = 1): string {
  const start = parse(startOfWeek(iso, weekStartsOn));
  const end = parse(endOfWeek(iso, weekStartsOn));
  const sMonth = MONTH_ABBR[start.getUTCMonth()];
  const eMonth = MONTH_ABBR[end.getUTCMonth()];
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sMonth === eMonth && sameYear;
  if (sameMonth) {
    return `${sMonth} ${start.getUTCDate()} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  }
  const left = `${sMonth} ${start.getUTCDate()}${sameYear ? '' : `, ${start.getUTCFullYear()}`}`;
  const right = `${eMonth} ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
  return `${left} – ${right}`;
}

/** "Tue, Aug 25, 2026", with a " · Today" suffix when the day is today. */
export function formatDayLabel(iso: string, today: string): string {
  const d = parse(iso);
  const label = `${WEEKDAY_ABBR[weekdayMon0(iso)]}, ${MONTH_ABBR[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return iso === today ? `${label} · Today` : label;
}

/** "Mon 24" — a weekly-table column header. */
export function formatDayColHeader(iso: string): string {
  return `${WEEKDAY_ABBR[weekdayMon0(iso)]} ${dayNumber(iso)}`;
}

export function weekdayFull(iso: string): string {
  return WEEKDAY_FULL[weekdayMon0(iso)];
}

/*
 * Wall-clock rendering of an entry's UTC instant now goes through the shared
 * `formatWallClockInTz(instantISO, tz)` in `@devscribed/validation` (spec 12 change —
 * per-account-timezone display, UTC fallback), so the API and the web app format instants
 * with one implementation. The old `formatUtcHHMM` (UTC-component-only) is retired.
 */

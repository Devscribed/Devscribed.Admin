/**
 * Time off spec 01 — Vacation Calendar. Every rule the calendar's read and its screen
 * both need, in the one place both re-run them: the messages, the two bounds, the scope
 * union, the range validator, the three window presets and the band's accessible name.
 *
 * The range validator here is deliberately NOT `validateReportRange`. That one resolves a
 * range into a timezone-shifted instant, which is right for an hour-grained report and
 * wrong here: a vacation's dates and a holiday's date are calendar days (REQ-01-017), and
 * comparing a calendar day against an instant drops a boundary day for a caller far enough
 * east or west. Everything below compares raw `YYYY-MM-DD` strings, which sort
 * lexicographically in calendar order and carry no zone at all.
 */

import { PROFILE_MESSAGES, validateCountryCode } from './autofill';
import { validateHolidayCountryCode } from './holidays';
import { todayInTimeZone } from './requests';

/**
 * §Error Messages, verbatim. The seven above the line are 422 bodies; the four below it
 * are drawn by a screen and reach no route, and live here so no screen writes them inline.
 */
export const TIME_OFF_CALENDAR_MESSAGES = {
  rangeRequired: 'Choose a start and an end date.',
  rangeInverted: 'The end date must be on or after the start date.',
  rangeTooWide: 'Choose a range of 92 days or fewer.',
  scopeInvalid: 'Choose All, Teams, or People.',
  teamsRequired: 'Choose at least one team.',
  peopleRequired: 'Choose at least one person.',
  tooManyMembers: 'This view covers more than 100 people. Narrow the scope to see the calendar.',

  emptyStateTitle: 'Nobody to show',
  emptyStateBody: 'No active member matches this scope.',
  orgCountryHint: "Members without a country of their own get this country's holidays.",
  memberCountryDefaultOption: "Use the organization's country",
} as const;

/** Validation Rule 4 — the inclusive span the endpoint answers (REQ-01-016). */
export const TIME_OFF_CALENDAR_MAX_RANGE_DAYS = 92;

/** Validation Rule 8 — the row cap, checked after the rows resolve (REQ-01-013). */
export const TIME_OFF_CALENDAR_MAX_MEMBERS = 100;

/** Which slice of the organization the grid draws (REQ-01-005 … REQ-01-008). */
export type TimeOffCalendarScope = 'all' | 'teams' | 'people';

export const TIME_OFF_CALENDAR_SCOPES: readonly TimeOffCalendarScope[] = ['all', 'teams', 'people'];

/**
 * The sentinel that ticks "Unassigned" in the teams picker (REQ-01-007). It is a value in
 * `projectIds`, not a mode: `projectIds=none` alone is a selection and is answered, and
 * `none` beside a real project id returns the union of both.
 */
export const TIME_OFF_CALENDAR_UNASSIGNED = 'none';

/** The three window presets the screen offers (REQ-01-019). */
export type TimeOffCalendarWindow = 'week' | '2weeks' | 'month';

/** The account preference the two week-based presets are computed from (spec 06). */
export type TimeOffCalendarWeekStart = 'Monday' | 'Sunday';

export interface TimeOffCalendarRange {
  startDate: string;
  endDate: string;
}

export type TimeOffCalendarRangeField = 'startDate' | 'endDate' | 'range';

export type TimeOffCalendarRangeResult =
  | { valid: true; value: TimeOffCalendarRange }
  | { valid: false; field: TimeOffCalendarRangeField; error: string };

export type TimeOffCalendarScopeResult =
  | { valid: true; value: TimeOffCalendarScope }
  | { valid: false; field: 'scope'; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** A strict `YYYY-MM-DD`, rejected when it names a day the calendar does not have. */
function isCalendarDate(input: unknown): input is string {
  if (typeof input !== 'string' || !ISO_DATE.test(input)) return false;
  const [year, month, day] = input.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function utcMidnight(iso: string): Date {
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function toISO(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Add `n` calendar days to a `YYYY-MM-DD`, through UTC midnight so no zone shifts it. */
export function addCalendarDays(iso: string, n: number): string {
  const date = utcMidnight(iso);
  date.setUTCDate(date.getUTCDate() + n);
  return toISO(date);
}

/** The inclusive number of calendar days between two `YYYY-MM-DD` dates. */
export function calendarDaySpan(startDate: string, endDate: string): number {
  const ms = utcMidnight(endDate).getTime() - utcMidnight(startDate).getTime();
  return Math.round(ms / 86_400_000) + 1;
}

/** Every `YYYY-MM-DD` in an inclusive range, in order. */
export function calendarDaysBetween(startDate: string, endDate: string): string[] {
  const days: string[] = [];
  for (let day = startDate; day <= endDate; day = addCalendarDays(day, 1)) days.push(day);
  return days;
}

/** Saturday or Sunday — a property of the date itself (REQ-01-032). */
export function isCalendarWeekend(iso: string): boolean {
  const weekday = utcMidnight(iso).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/** The ISO-8601 week number of a calendar date — restarts correctly across a year end. */
export function isoWeekOf(iso: string): number {
  const date = utcMidnight(iso);
  // Thursday decides which year the week belongs to, which is the whole of ISO-8601's rule.
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const firstDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * 86_400_000));
}

/**
 * Validation Rules 1–4, **in the table's order, first failure only** (§Validation Rules).
 * A request that is both inverted and 200 days long is refused with `rangeInverted` and
 * nothing else, because the banner draws one message either way and the reader fixes the
 * thing they can see.
 */
export function validateTimeOffCalendarRange(
  startDate: unknown,
  endDate: unknown,
): TimeOffCalendarRangeResult {
  if (!isCalendarDate(startDate)) {
    return { valid: false, field: 'startDate', error: TIME_OFF_CALENDAR_MESSAGES.rangeRequired };
  }
  if (!isCalendarDate(endDate)) {
    return { valid: false, field: 'endDate', error: TIME_OFF_CALENDAR_MESSAGES.rangeRequired };
  }
  if (endDate < startDate) {
    return { valid: false, field: 'range', error: TIME_OFF_CALENDAR_MESSAGES.rangeInverted };
  }
  if (calendarDaySpan(startDate, endDate) > TIME_OFF_CALENDAR_MAX_RANGE_DAYS) {
    return { valid: false, field: 'range', error: TIME_OFF_CALENDAR_MESSAGES.rangeTooWide };
  }
  return { valid: true, value: { startDate, endDate } };
}

/** Validation Rule 5 — an absent or unrecognized scope is refused, never defaulted. */
export function validateTimeOffCalendarScope(input: unknown): TimeOffCalendarScopeResult {
  if (typeof input === 'string' && (TIME_OFF_CALENDAR_SCOPES as readonly string[]).includes(input)) {
    return { valid: true, value: input as TimeOffCalendarScope };
  }
  return { valid: false, field: 'scope', error: TIME_OFF_CALENDAR_MESSAGES.scopeInvalid };
}

/**
 * The range a preset covers for the calendar month or week holding `anchor` (REQ-01-019).
 * `Week` and `2 weeks` start on the caller's `firstDayOfWeek`; `Month` runs first to last
 * day of the anchor's calendar month whatever the week starts on, because a month is not
 * a week.
 */
export function timeOffCalendarWindowRange(
  window: TimeOffCalendarWindow,
  anchor: string,
  firstDayOfWeek: TimeOffCalendarWeekStart,
): TimeOffCalendarRange {
  if (window === 'month') {
    const date = utcMidnight(anchor);
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
    return { startDate: toISO(first), endDate: toISO(last) };
  }
  const weekStartsOn = firstDayOfWeek === 'Sunday' ? 0 : 1;
  const offset = (utcMidnight(anchor).getUTCDay() - weekStartsOn + 7) % 7;
  const startDate = addCalendarDays(anchor, -offset);
  return { startDate, endDate: addCalendarDays(startDate, window === 'week' ? 6 : 13) };
}

/**
 * REQ-01-049 — where back and forward land. `Week` and `2 weeks` move one preset length,
 * `Month` moves a whole calendar month, so every range a step produces is a range the
 * preset itself produces. Returns the new anchor; the range is that anchor's window.
 */
export function stepTimeOffCalendarAnchor(
  window: TimeOffCalendarWindow,
  anchor: string,
  direction: -1 | 1,
): string {
  if (window === 'week') return addCalendarDays(anchor, 7 * direction);
  if (window === '2weeks') return addCalendarDays(anchor, 14 * direction);
  const date = utcMidnight(anchor);
  // Anchor on the 1st before stepping: a 31st stepped into a 30-day month would otherwise
  // overflow into the month after the one the reader asked for.
  const stepped = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + direction, 1));
  return toISO(stepped);
}

const BAND_KIND_LABELS: Record<string, string> = { vacation: 'Vacation' };

/**
 * The band's accessible name (§UI Description, Keyboard) — one builder, so no screen
 * writes the string inline and the two treatments cannot describe themselves differently.
 */
export function timeOffBandAccessibleName(band: {
  kind: string;
  status: string;
  startDate: string;
  endDate: string;
  workingDays: number;
}): string {
  const kind = BAND_KIND_LABELS[band.kind] ?? band.kind;
  return `${kind} · ${band.status} · ${band.startDate} – ${band.endDate} · ${band.workingDays} working days`;
}


/**
 * Validation Rule 9 — the write rule for the two country columns this spec adds, and the
 * only rule either country write runs.
 *
 * **Two tests, not one.** The uppercase shape, so `pl` is refused rather than upcased and
 * one value does not behave differently here and on the holiday form beside it; and
 * membership of the assigned alpha-2 list, so `XX` is refused as well. A holiday's own
 * country is a label that reaches nobody when it names no country, which is why
 * `validateHolidayCountryCode` is right to accept it there — but these two columns are the
 * INPUT to REQ-01-026's resolution, and an unusable one removes holiday pay in silence
 * while the page reads the value back as set.
 *
 * The message is `PROFILE_MESSAGES.country.invalid` ("Enter a valid country"), which is
 * true of everything this refuses; `HOLIDAY_MESSAGES.countryCodeInvalid` ("Country code
 * must be 2 uppercase letters.") is false of `XX`.
 *
 * Empty, `null` and `undefined` all normalize to `null`, which is what clears the column
 * (REQ-01-034, REQ-01-043). The stored value is the submitted one, never a normalized one.
 */
export function validateStatedCountryCode(
  input: unknown,
): { valid: true; value: string | null } | { valid: false; error: string } {
  const shape = validateHolidayCountryCode(input);
  if (!shape.valid) return { valid: false, error: PROFILE_MESSAGES.country.invalid };
  if (shape.value === null) return { valid: true, value: null };
  const assigned = validateCountryCode(shape.value);
  if (!assigned.valid) return { valid: false, error: PROFILE_MESSAGES.country.invalid };
  return { valid: true, value: shape.value };
}

/**
 * REQ-01-018's fallback, as its own question: **which zone** is today read in. The caller's
 * when `Account.timezone` names one the runtime can read, UTC when it is absent, empty or
 * unrecognized — the third limb being a stale profile value, which must not 500 a read.
 *
 * The endpoint answers `range.timezone` with this, so a body can never name a zone it did
 * not read today in.
 *
 * Constructing the formatter is the whole probe: it throws on a zone the runtime does not
 * know and produces no date, so nothing here restates how a day is formatted — that is
 * `todayInTimeZone`'s, and it has one implementation.
 */
export function resolveTimeOffCalendarTimezone(timezone: string | null | undefined): string {
  if (!timezone || timezone.trim().length === 0) return 'UTC';
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: timezone });
    return timezone;
  } catch {
    return 'UTC';
  }
}

/**
 * REQ-01-018's today, and **the single definition of it**: the endpoint marks `range.today`
 * with it and the screen's `Today` control lands with it, so the two cannot disagree. A
 * screen resolving today from the browser's clock opens on a window that does not hold the
 * caller's today, and the marker then falls in no column at all.
 *
 * Formatted through the shipped `todayInTimeZone`, never beside it.
 */
export function timeOffCalendarToday(
  timezone: string | null | undefined,
  instant: Date = new Date(),
): string {
  return todayInTimeZone(resolveTimeOffCalendarTimezone(timezone), instant);
}

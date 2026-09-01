/**
 * Holiday validation — specs/organization/03-holidays.md §Validation Rules.
 *
 * Shared verbatim by the NestJS API (which re-runs every rule server-side on POST and
 * PATCH) and by the Settings › Holidays modal (whose copy is a convenience, never a
 * gate). Pure functions only: no dates from the host clock, no I/O.
 */

import { HOLIDAY_MESSAGES } from './holiday-messages';
import type { FieldResult, NumericFieldResult } from './index';

/** Max length of a holiday name in Unicode codepoints (spec Validation Rule 4). */
export const HOLIDAY_NAME_MAX = 120;

/** Inclusive bounds of `paidHours` (spec requirement 3 / Validation Rule 7). */
export const HOLIDAY_PAID_HOURS_MIN = 0;
export const HOLIDAY_PAID_HOURS_MAX = 24;

/** The default the Add modal pre-fills and the column default (spec requirement 3). */
export const HOLIDAY_PAID_HOURS_DEFAULT = 8;

/**
 * Allowed character class for a holiday name (spec requirement 2): letters of any
 * script (`\p{L}`), digits (`\p{N}`), space, hyphen, ampersand, period, comma,
 * apostrophe, parentheses, forward slash. Anchored with the `u` flag, so anything
 * else — `<`, `@`, an emoji — fails.
 */
const HOLIDAY_NAME_PATTERN = /^[\p{L}\p{N} \-&.,'()/]+$/u;

/** Strict ISO calendar date. A time component fails here rather than being truncated. */
const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/** ISO 3166-1 alpha-2, uppercase only (spec Validation Rule 8). */
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

/**
 * Holiday name (spec Validation Rules 3–5): trim first, then required → too long →
 * disallowed characters. Length is measured in Unicode codepoints so an astral
 * character counts once, matching `validateClientName`.
 */
export function validateHolidayName(name: unknown): FieldResult {
  const value = typeof name === 'string' ? name.trim() : '';
  if (value.length === 0) return { valid: false, error: HOLIDAY_MESSAGES.nameRequired };
  if ([...value].length > HOLIDAY_NAME_MAX) {
    return { valid: false, error: HOLIDAY_MESSAGES.nameTooLong };
  }
  if (!HOLIDAY_NAME_PATTERN.test(value)) {
    return { valid: false, error: HOLIDAY_MESSAGES.nameInvalidChars };
  }
  return { valid: true, value };
}

/**
 * Paid hours (spec requirement 3 / Validation Rules 6–7). Required; a blank string,
 * `null`, `undefined` or a non-numeric value is "required", not "out of range", so the
 * member who left the field alone is told to fill it rather than to pick a smaller
 * number. Accepted values are `0.00`–`24.00` inclusive and are quantized to two
 * decimals — the column is `Decimal(4,2)`, so a third decimal would be silently
 * rounded by Postgres anyway and rounding here keeps client and server agreed.
 */
export function validatePaidHours(input: unknown): NumericFieldResult {
  if (input === null || input === undefined) {
    return { valid: false, error: HOLIDAY_MESSAGES.paidHoursRequired };
  }
  if (typeof input === 'string' && input.trim().length === 0) {
    return { valid: false, error: HOLIDAY_MESSAGES.paidHoursRequired };
  }
  if (typeof input !== 'number' && typeof input !== 'string') {
    return { valid: false, error: HOLIDAY_MESSAGES.paidHoursRequired };
  }
  const parsed = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(parsed)) {
    return { valid: false, error: HOLIDAY_MESSAGES.paidHoursRequired };
  }
  if (parsed < HOLIDAY_PAID_HOURS_MIN || parsed > HOLIDAY_PAID_HOURS_MAX) {
    return { valid: false, error: HOLIDAY_MESSAGES.paidHoursOutOfRange };
  }
  return { valid: true, value: Math.round(parsed * 100) / 100 };
}

/**
 * Country code (spec requirement 4 / Validation Rule 8), which the spec's test cases
 * name `validateCountryCode`. It is spelled with the `Holiday` prefix because the
 * barrel already exports an `validateCountryCode` from `autofill.ts` with different
 * semantics — that one upcases `'by'` and returns `''` for absent — and two exports
 * of one name through `export *` resolve to neither.
 *
 * Absent means "applies to every country", so `null`, `undefined` and the empty
 * string are all valid and normalize to `null`. Anything present must be exactly two
 * uppercase letters — lowercase is rejected rather than upcased, because the stored
 * value is what the uniqueness index compares.
 */
export function validateHolidayCountryCode(
  input: unknown,
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (input === null || input === undefined) return { valid: true, value: null };
  if (typeof input !== 'string') {
    return { valid: false, error: HOLIDAY_MESSAGES.countryCodeInvalid };
  }
  if (input.trim().length === 0) return { valid: true, value: null };
  if (!COUNTRY_CODE_PATTERN.test(input)) {
    return { valid: false, error: HOLIDAY_MESSAGES.countryCodeInvalid };
  }
  return { valid: true, value: input };
}

/**
 * Holiday date (spec requirement 1 / Validation Rules 1–2). Strictly `YYYY-MM-DD`:
 * an ISO instant such as `2026-05-01T00:00:00Z` is rejected rather than truncated,
 * because a holiday is a calendar-day fact and accepting an instant is what starts
 * the timezone drift the spec's requirement 6 rules out. The day is checked against
 * the real calendar, so `2026-02-30` fails.
 */
export function validateHolidayDate(input: unknown): FieldResult {
  const value = typeof input === 'string' ? input.trim() : '';
  if (value.length === 0) return { valid: false, error: HOLIDAY_MESSAGES.dateRequired };
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return { valid: false, error: HOLIDAY_MESSAGES.dateInvalid };
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return { valid: false, error: HOLIDAY_MESSAGES.dateInvalid };
  }
  // Round-trip through UTC: an out-of-calendar day (2026-02-30) rolls forward and the
  // components no longer match what was typed.
  const asDate = new Date(Date.UTC(year, month - 1, day));
  if (
    asDate.getUTCFullYear() !== year ||
    asDate.getUTCMonth() !== month - 1 ||
    asDate.getUTCDate() !== day
  ) {
    return { valid: false, error: HOLIDAY_MESSAGES.dateInvalid };
  }
  return { valid: true, value };
}

/**
 * Which holidays a member sees (spec requirement 14): a row is visible when it is
 * global (`countryCode === null`) or its country equals the member's resolved country.
 * The server applies this for `scope=mine`; the web layer uses the same predicate when
 * it counts holidays inside a vacation range.
 */
export function holidayAppliesTo(
  holidayCountryCode: string | null | undefined,
  memberCountryCode: string | null | undefined,
): boolean {
  if (holidayCountryCode === null || holidayCountryCode === undefined) return true;
  return !!memberCountryCode && holidayCountryCode === memberCountryCode;
}

/**
 * Count the holidays whose date falls inside an inclusive `YYYY-MM-DD` range — the
 * `{n}` of the vacation hint (requirement 13). Pure string comparison: ISO dates sort
 * lexicographically, so no `Date` is constructed and no host timezone can shift a day.
 * Returns 0 when the range is inverted or either endpoint is blank.
 */
export function countHolidaysInRange(
  holidays: ReadonlyArray<{ date: string }>,
  start: string,
  end: string,
): number {
  if (!start || !end || end < start) return 0;
  return holidays.filter((h) => h.date >= start && h.date <= end).length;
}

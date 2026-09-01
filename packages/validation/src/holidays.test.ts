import { describe, expect, it } from 'vitest';
import {
  calculateWorkingDays,
  can,
  countHolidaysInRange,
  holidayAppliesTo,
  HOLIDAY_MESSAGES,
  validateHolidayCountryCode,
  validateHolidayDate,
  validateHolidayName,
  validatePaidHours,
} from './index';
import { hasCapability } from './roles';

// specs/organization/03-holidays.md §Test Cases — Unit.

describe('TC-03-UNIT-01/02: holiday name validation', () => {
  it('TC-03-UNIT-01: empty name is required', () => {
    expect(validateHolidayName('')).toEqual({
      valid: false,
      error: 'Holiday name is required.',
    });
    expect(validateHolidayName('   ')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.nameRequired,
    });
  });

  it('TC-03-UNIT-02: 121 characters is too long, 120 is accepted', () => {
    expect(validateHolidayName('a'.repeat(121))).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.nameTooLong,
    });
    expect(validateHolidayName('a'.repeat(120))).toEqual({
      valid: true,
      value: 'a'.repeat(120),
    });
  });

  it('trims and accepts the spec’s allowed character set', () => {
    expect(validateHolidayName("  New Year's Day (Observed)  ")).toEqual({
      valid: true,
      value: "New Year's Day (Observed)",
    });
    expect(validateHolidayName('Каляды')).toEqual({ valid: true, value: 'Каляды' });
  });

  it('rejects characters outside the allowed set', () => {
    expect(validateHolidayName('<script>')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.nameInvalidChars,
    });
  });
});

describe('TC-03-UNIT-03..06: paidHours boundaries', () => {
  it('TC-03-UNIT-03: 0 is valid', () => {
    expect(validatePaidHours(0)).toEqual({ valid: true, value: 0 });
  });

  it('TC-03-UNIT-04: 24 is valid', () => {
    expect(validatePaidHours(24)).toEqual({ valid: true, value: 24 });
  });

  it('TC-03-UNIT-05: 24.01 is out of range', () => {
    expect(validatePaidHours(24.01)).toEqual({
      valid: false,
      error: 'Paid hours must be between 0 and 24.',
    });
  });

  it('TC-03-UNIT-06: a negative value is out of range', () => {
    expect(validatePaidHours(-1)).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.paidHoursOutOfRange,
    });
  });

  it('a missing or blank value is required, not out of range', () => {
    expect(validatePaidHours(undefined)).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.paidHoursRequired,
    });
    expect(validatePaidHours(null)).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.paidHoursRequired,
    });
    expect(validatePaidHours('')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.paidHoursRequired,
    });
    expect(validatePaidHours('abc')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.paidHoursRequired,
    });
  });

  it('accepts a half-day as a form string and quantizes to two decimals', () => {
    expect(validatePaidHours('4.5')).toEqual({ valid: true, value: 4.5 });
    expect(validatePaidHours(8.125)).toEqual({ valid: true, value: 8.13 });
  });
});

// The spec writes these three cases as `validateCountryCode`; the exported name
// carries the `Holiday` prefix because `autofill.ts` already owns that spelling with
// different semantics (see the note on the function).
describe('TC-03-UNIT-07..09: countryCode', () => {
  it('TC-03-UNIT-07: BY is valid', () => {
    expect(validateHolidayCountryCode('BY')).toEqual({ valid: true, value: 'BY' });
  });

  it('TC-03-UNIT-08: lowercase is a format error', () => {
    expect(validateHolidayCountryCode('by')).toEqual({
      valid: false,
      error: 'Country code must be 2 uppercase letters.',
    });
  });

  it('TC-03-UNIT-09: null is valid and means "all countries"', () => {
    expect(validateHolidayCountryCode(null)).toEqual({ valid: true, value: null });
    expect(validateHolidayCountryCode(undefined)).toEqual({ valid: true, value: null });
    expect(validateHolidayCountryCode('')).toEqual({ valid: true, value: null });
  });

  it('rejects a code that is not exactly two letters', () => {
    expect(validateHolidayCountryCode('BLR')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.countryCodeInvalid,
    });
    expect(validateHolidayCountryCode('B1')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.countryCodeInvalid,
    });
  });
});

describe('holiday date parsing (§Security — strict ISO, time components rejected)', () => {
  it('accepts a plain calendar date', () => {
    expect(validateHolidayDate('2026-05-01')).toEqual({ valid: true, value: '2026-05-01' });
  });

  it('requires the field', () => {
    expect(validateHolidayDate('')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.dateRequired,
    });
    expect(validateHolidayDate(undefined)).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.dateRequired,
    });
  });

  it('rejects an instant, a non-calendar day and a malformed string', () => {
    expect(validateHolidayDate('2026-05-01T00:00:00Z')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.dateInvalid,
    });
    expect(validateHolidayDate('2026-02-30')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.dateInvalid,
    });
    expect(validateHolidayDate('01/05/2026')).toEqual({
      valid: false,
      error: HOLIDAY_MESSAGES.dateInvalid,
    });
  });
});

describe('requirement 14 — country resolution predicate', () => {
  it('a global holiday applies to everyone, including a member with no country', () => {
    expect(holidayAppliesTo(null, 'BY')).toBe(true);
    expect(holidayAppliesTo(null, null)).toBe(true);
  });

  it('a country-scoped holiday applies only to that country', () => {
    expect(holidayAppliesTo('BY', 'BY')).toBe(true);
    expect(holidayAppliesTo('BY', 'US')).toBe(false);
    expect(holidayAppliesTo('BY', null)).toBe(false);
  });
});

describe('requirement 13 — counting holidays inside a vacation range', () => {
  const holidays = [{ date: '2026-05-01' }, { date: '2026-05-09' }, { date: '2026-07-04' }];

  it('counts inclusive endpoints', () => {
    expect(countHolidaysInRange(holidays, '2026-05-01', '2026-05-09')).toBe(2);
    expect(countHolidaysInRange(holidays, '2026-05-02', '2026-05-08')).toBe(0);
  });

  it('returns 0 for an inverted or incomplete range', () => {
    expect(countHolidaysInRange(holidays, '2026-05-09', '2026-05-01')).toBe(0);
    expect(countHolidaysInRange(holidays, '', '2026-05-09')).toBe(0);
  });
});

describe('TC-03-UNIT-10: vacation math is unchanged by a holiday (requirement 12)', () => {
  it('a Mon–Fri range containing a Wednesday holiday still counts 5 working days', () => {
    // 2026-05-04 (Mon) .. 2026-05-08 (Fri); 2026-05-06 is a Wednesday holiday.
    expect(calculateWorkingDays('2026-05-04', '2026-05-08')).toBe(5);
  });
});

describe('§New Capabilities — holidays in both capability unions', () => {
  it('admin holds view, manage and delete', () => {
    expect(can('admin', 'view-holidays')).toBe(true);
    expect(can('admin', 'manage-holidays')).toBe(true);
    expect(can('admin', 'delete-holidays')).toBe(true);
    expect(hasCapability('admin', 'ViewHolidays')).toBe(true);
    expect(hasCapability('admin', 'ManageHolidays')).toBe(true);
    expect(hasCapability('admin', 'DeleteHolidays')).toBe(true);
  });

  it('manager may view and manage but never delete', () => {
    expect(can('manager', 'view-holidays')).toBe(true);
    expect(can('manager', 'manage-holidays')).toBe(true);
    expect(can('manager', 'delete-holidays')).toBe(false);
    expect(hasCapability('manager', 'DeleteHolidays')).toBe(false);
  });

  it('user and viewer hold none of the three', () => {
    for (const role of ['user', 'viewer'] as const) {
      expect(can(role, 'view-holidays')).toBe(false);
      expect(can(role, 'manage-holidays')).toBe(false);
      expect(can(role, 'delete-holidays')).toBe(false);
    }
    // `member` is today's database spelling of `user` (roles.ts LEGACY_ALIASES).
    expect(hasCapability('member', 'ViewHolidays')).toBe(false);
  });
});

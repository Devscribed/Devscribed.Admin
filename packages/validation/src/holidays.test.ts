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

/**
 * The spec's Error Messages table and Validation Rules list, verbatim.
 *
 * Everything downstream — the 422 field map, the 409 body, the toasts, the calendar
 * tooltip, the vacation hint — asserts `HOLIDAY_MESSAGES.*`, which on its own only
 * certifies whatever the constant happens to say. This is the one place the strings
 * are compared to the spec's literal text, so a reworded constant fails here rather
 * than silently redefining what every other test is checking.
 */
describe('§Error Messages / §Validation Rules — the tabulated text, verbatim', () => {
  it('matches the Validation Rules list', () => {
    expect(HOLIDAY_MESSAGES.dateRequired).toBe('Date is required.');
    expect(HOLIDAY_MESSAGES.dateInvalid).toBe('Invalid date.');
    expect(HOLIDAY_MESSAGES.nameRequired).toBe('Holiday name is required.');
    expect(HOLIDAY_MESSAGES.nameTooLong).toBe('Holiday name cannot exceed 120 characters.');
    expect(HOLIDAY_MESSAGES.nameInvalidChars).toBe(
      'Holiday name contains disallowed characters.',
    );
    expect(HOLIDAY_MESSAGES.paidHoursRequired).toBe('Paid hours is required.');
    expect(HOLIDAY_MESSAGES.paidHoursOutOfRange).toBe('Paid hours must be between 0 and 24.');
    expect(HOLIDAY_MESSAGES.countryCodeInvalid).toBe(
      'Country code must be 2 uppercase letters.',
    );
    expect(HOLIDAY_MESSAGES.duplicate).toBe('A holiday already exists on this date.');
  });

  it('matches the Error Messages table', () => {
    expect(HOLIDAY_MESSAGES.toastCreated).toBe('Holiday added.');
    expect(HOLIDAY_MESSAGES.toastUpdated).toBe('Holiday updated.');
    expect(HOLIDAY_MESSAGES.toastDeleted).toBe('Holiday deleted.');
    expect(HOLIDAY_MESSAGES.deleteForbidden).toBe(
      "You don't have permission to delete holidays.",
    );
    expect(HOLIDAY_MESSAGES.deleteConfirmPast('Labour Day', '2026-05-01')).toBe(
      'Delete Labour Day on 2026-05-01? Amounts Owed reports run after now will no ' +
        'longer include it. Reports already exported as PDF are unchanged.',
    );
    expect(HOLIDAY_MESSAGES.deleteConfirmFuture('Labour Day', '2026-05-01')).toBe(
      'Delete Labour Day on 2026-05-01?',
    );
    // The "Confirm buttons" row is two labels and a tone: "Cancel" / "Delete holiday"
    // (danger). The tone is the DS `Button` variant, not a string.
    expect(HOLIDAY_MESSAGES.deleteConfirmCancel).toBe('Cancel');
    expect(HOLIDAY_MESSAGES.deleteConfirmConfirm).toBe('Delete holiday');
    expect(HOLIDAY_MESSAGES.emptyState(2026)).toBe(
      'No holidays for 2026 yet. Add holidays so paid public days appear on Amounts ' +
        'Owed reports and the Time Tracking calendar.',
    );
    expect(HOLIDAY_MESSAGES.emptyStateCountry('BY', 2026)).toBe(
      'No holidays for BY in 2026.',
    );
    // §Screens draws that row as a title plus a subtitle. Both halves are pinned here
    // too, because the card renders the halves and never the whole — an assertion on
    // `emptyState` alone would not notice a reworded title reaching the screen.
    expect(HOLIDAY_MESSAGES.emptyStateTitle(2026)).toBe('No holidays for 2026 yet.');
    expect(HOLIDAY_MESSAGES.emptyStateBody).toBe(
      'Add holidays so paid public days appear on Amounts Owed reports and the ' +
        'Time Tracking calendar.',
    );
    expect(HOLIDAY_MESSAGES.vacationHint(2)).toBe(
      'Note: 2 paid holiday(s) fall in this range. Vacation is deducted for the ' +
        'working days; holidays are paid separately in Amounts Owed.',
    );
    expect(HOLIDAY_MESSAGES.calendarTooltip('Victory Day')).toBe(
      '★ Holiday · Victory Day',
    );
  });

  it('composes the empty-state row from exactly the two halves the card renders', () => {
    // The card prints the title and the subtitle; the table names the whole. If these
    // ever stop composing, one of the two is wrong and the screen silently disagrees
    // with the spec's table — which is how the first sentence came to be printed twice.
    for (const year of [2025, 2026, 2027]) {
      expect(HOLIDAY_MESSAGES.emptyState(year)).toBe(
        `${HOLIDAY_MESSAGES.emptyStateTitle(year)} ${HOLIDAY_MESSAGES.emptyStateBody}`,
      );
    }
    // …and the title is not itself the whole, which is the defect this pins shut.
    expect(HOLIDAY_MESSAGES.emptyStateTitle(2026)).not.toBe(HOLIDAY_MESSAGES.emptyState(2026));
  });

  it('matches the §Accessibility live-region announcement', () => {
    expect(HOLIDAY_MESSAGES.calendarAnnouncement('Victory Day', 8)).toBe(
      'Holiday: Victory Day. Paid hours: 8.',
    );
  });
});

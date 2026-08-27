import { describe, expect, it } from 'vitest';
import {
  calculateAvailableDays,
  calculateDeductionAmount,
  calculateWorkingDays,
  can,
  datesOverlap,
  isValidReviewDecision,
  REQUEST_MESSAGES,
  validateReviewerComment,
  validateVacationRequestDates,
} from './index';

// TC-09-UNIT-01: Working days calculation
describe('TC-09-UNIT-01 calculateWorkingDays', () => {
  it('case 1: 2025-07-14 (Mon) → 2025-07-25 (Fri) = 10', () => {
    expect(calculateWorkingDays('2025-07-14', '2025-07-25')).toBe(10);
  });

  it('case 2: single day 2025-07-14 (Mon) = 1', () => {
    expect(calculateWorkingDays('2025-07-14', '2025-07-14')).toBe(1);
  });

  it('case 3: weekend 2025-07-12 (Sat) → 2025-07-13 (Sun) = 0', () => {
    expect(calculateWorkingDays('2025-07-12', '2025-07-13')).toBe(0);
  });

  it('case 4: cross-year 2025-12-29 (Mon) → 2026-01-02 (Fri) = 5', () => {
    expect(calculateWorkingDays('2025-12-29', '2026-01-02')).toBe(5);
  });

  it('returns 0 when end is before start', () => {
    expect(calculateWorkingDays('2025-07-25', '2025-07-14')).toBe(0);
  });

  it('accepts Date objects as well as strings', () => {
    expect(
      calculateWorkingDays(
        new Date('2025-07-14T00:00:00.000Z'),
        new Date('2025-07-25T00:00:00.000Z'),
      ),
    ).toBe(10);
  });
});

// TC-09-UNIT-02: Available days with pending hold
describe('TC-09-UNIT-02 calculateAvailableDays with pendingHold', () => {
  const base = { monthlySalary: 3000, vacationDaysPerYear: 20 };

  // `calculateAvailableDays` rounds the daily salary to cents (138.46) before dividing
  // the reserve into whole days — matching the spec's worked example, which computes
  // floor(276.92 / 138.46) = 2. (The per-request deductionAmount keeps full precision;
  // see the calculateDeductionAmount cases below → 692.31 / 1384.62.)
  it('case 1: reserve 1661.54, hold 1384.62, used 5 → 2', () => {
    expect(
      calculateAvailableDays({
        ...base,
        reserveBalance: 1661.54,
        usedDays: 5,
        pendingHold: 1384.62,
      }),
    ).toBe(2);
  });

  it('case 2: reserve 1661.54, hold 0, used 5 → 12', () => {
    expect(
      calculateAvailableDays({ ...base, reserveBalance: 1661.54, usedDays: 5, pendingHold: 0 }),
    ).toBe(12);
  });

  it('case 3: reserve 2769.23, hold 0, used 18 → 2 (capped by annual limit)', () => {
    expect(
      calculateAvailableDays({ ...base, reserveBalance: 2769.23, usedDays: 18, pendingHold: 0 }),
    ).toBe(2);
  });
});

// Backward-compatibility: omitting pendingHold reproduces the spec-08 values exactly.
describe('calculateAvailableDays remains backward-compatible with spec 08', () => {
  const base = { monthlySalary: 3000, vacationDaysPerYear: 20 };

  it('TC-08-UNIT-02 case 1: reserve 1661.54, used 0 → 12 (no pendingHold)', () => {
    expect(calculateAvailableDays({ ...base, reserveBalance: 1661.54, usedDays: 0 })).toBe(12);
  });

  it('TC-08-UNIT-02 case 3: reserve 2769.23, used 18 → 2 (no pendingHold)', () => {
    expect(calculateAvailableDays({ ...base, reserveBalance: 2769.23, usedDays: 18 })).toBe(2);
  });

  it('a pendingHold of 0 equals omitting it', () => {
    expect(
      calculateAvailableDays({ ...base, reserveBalance: 1661.54, usedDays: 0, pendingHold: 0 }),
    ).toBe(calculateAvailableDays({ ...base, reserveBalance: 1661.54, usedDays: 0 }));
  });
});

// TC-09-UNIT-03: Overlap detection (existing request A: 2025-07-14 → 2025-07-18)
describe('TC-09-UNIT-03 datesOverlap', () => {
  const aStart = '2025-07-14';
  const aEnd = '2025-07-18';

  it('case 1: B 07-18 → 07-25 shares last day of A → overlap', () => {
    expect(datesOverlap(aStart, aEnd, '2025-07-18', '2025-07-25')).toBe(true);
  });

  it('case 2: C 07-21 → 07-25 → no overlap', () => {
    expect(datesOverlap(aStart, aEnd, '2025-07-21', '2025-07-25')).toBe(false);
  });

  it('case 3: D 07-10 → 07-16 overlaps start of A → overlap', () => {
    expect(datesOverlap(aStart, aEnd, '2025-07-10', '2025-07-16')).toBe(true);
  });

  it('case 4: E 07-15 → 07-17 fully inside A → overlap', () => {
    expect(datesOverlap(aStart, aEnd, '2025-07-15', '2025-07-17')).toBe(true);
  });
});

// Deduction amount (spec 09 requirement 6)
describe('calculateDeductionAmount', () => {
  it('10 working days @ salary 3000 → 1384.62', () => {
    expect(calculateDeductionAmount(10, 3000)).toBe(1384.62);
  });

  it('5 working days @ salary 3000 → 692.31', () => {
    expect(calculateDeductionAmount(5, 3000)).toBe(692.31);
  });
});

// Date-field + cross-year validation (spec 09 Validation Rules 1–3)
describe('validateVacationRequestDates', () => {
  const today = '2025-07-01';

  it('accepts a valid future same-year range', () => {
    const result = validateVacationRequestDates(
      { startDate: '2025-07-14', endDate: '2025-07-25' },
      today,
    );
    expect(result).toEqual({ valid: true, fieldErrors: {}, crossYear: false });
  });

  it('accepts a request starting exactly today', () => {
    const result = validateVacationRequestDates(
      { startDate: today, endDate: '2025-07-04' },
      today,
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a past start date with startInPast', () => {
    const result = validateVacationRequestDates(
      { startDate: '2025-06-30', endDate: '2025-07-04' },
      today,
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.startDate).toBe(REQUEST_MESSAGES.startInPast);
  });

  it('rejects an end before start with endBeforeStart', () => {
    const result = validateVacationRequestDates(
      { startDate: '2025-07-25', endDate: '2025-07-14' },
      today,
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.endDate).toBe(REQUEST_MESSAGES.endBeforeStart);
  });

  it('flags a cross-year range via the crossYear flag, not a field error', () => {
    const result = validateVacationRequestDates(
      { startDate: '2025-12-29', endDate: '2026-01-02' },
      today,
    );
    expect(result.crossYear).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.fieldErrors).toEqual({});
  });

  it('rejects a missing start date', () => {
    const result = validateVacationRequestDates({ endDate: '2025-07-25' }, today);
    expect(result.fieldErrors.startDate).toBe(REQUEST_MESSAGES.startInPast);
  });
});

// Reviewer comment (spec 09 Validation Rule 6)
describe('validateReviewerComment', () => {
  it('accepts null (comment omitted) → value null', () => {
    expect(validateReviewerComment(null)).toEqual({ valid: true, value: null });
  });

  it('accepts undefined → value null', () => {
    expect(validateReviewerComment(undefined)).toEqual({ valid: true, value: null });
  });

  it('accepts exactly 500 characters', () => {
    const comment = 'a'.repeat(500);
    expect(validateReviewerComment(comment)).toEqual({ valid: true, value: comment });
  });

  it('rejects 501 characters with commentTooLong', () => {
    expect(validateReviewerComment('a'.repeat(501))).toEqual({
      valid: false,
      error: REQUEST_MESSAGES.commentTooLong,
    });
  });
});

// Review decision guard (spec 09 Error Messages)
describe('isValidReviewDecision', () => {
  it('accepts "approved" and "rejected"', () => {
    expect(isValidReviewDecision('approved')).toBe(true);
    expect(isValidReviewDecision('rejected')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidReviewDecision('cancelled')).toBe(false);
    expect(isValidReviewDecision('')).toBe(false);
    expect(isValidReviewDecision(null)).toBe(false);
    expect(isValidReviewDecision(undefined)).toBe(false);
  });
});

// Spec 09 templated message builders — exact strings (en-dash is load-bearing)
describe('REQUEST_MESSAGES builders', () => {
  it('insufficientBalance interpolates {n} and keeps "day(s)"', () => {
    expect(REQUEST_MESSAGES.insufficientBalance(2)).toBe(
      'Insufficient vacation balance. You have 2 day(s) available.',
    );
  });

  it('overlap interpolates dates with an en-dash separator', () => {
    expect(REQUEST_MESSAGES.overlap('2025-07-14', '2025-07-25')).toBe(
      'This request overlaps with an existing vacation request (2025-07-14 – 2025-07-25)',
    );
  });
});

// Spec 09 capabilities via can(...)
describe('spec 09 vacation-request capabilities', () => {
  it('submit-vacation-request: admin/manager/user yes, viewer no', () => {
    expect(can('admin', 'submit-vacation-request')).toBe(true);
    expect(can('manager', 'submit-vacation-request')).toBe(true);
    expect(can('user', 'submit-vacation-request')).toBe(true);
    expect(can('viewer', 'submit-vacation-request')).toBe(false);
  });

  it('review-vacation-requests: admin/manager yes, user/viewer no', () => {
    expect(can('admin', 'review-vacation-requests')).toBe(true);
    expect(can('manager', 'review-vacation-requests')).toBe(true);
    expect(can('user', 'review-vacation-requests')).toBe(false);
    expect(can('viewer', 'review-vacation-requests')).toBe(false);
  });

  it('cancel-own-vacation-request: admin/manager/user yes, viewer no', () => {
    expect(can('admin', 'cancel-own-vacation-request')).toBe(true);
    expect(can('manager', 'cancel-own-vacation-request')).toBe(true);
    expect(can('user', 'cancel-own-vacation-request')).toBe(true);
    expect(can('viewer', 'cancel-own-vacation-request')).toBe(false);
  });

  it('cancel-any-vacation-request: admin/manager yes, user/viewer no', () => {
    expect(can('admin', 'cancel-any-vacation-request')).toBe(true);
    expect(can('manager', 'cancel-any-vacation-request')).toBe(true);
    expect(can('user', 'cancel-any-vacation-request')).toBe(false);
    expect(can('viewer', 'cancel-any-vacation-request')).toBe(false);
  });
});

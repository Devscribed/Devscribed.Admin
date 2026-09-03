import { describe, expect, it } from 'vitest';
import {
  ACCRUAL_MESSAGES,
  accrualDescription,
  billingPeriodLabel,
  calculateAvailableDays,
  calculateMonthlyCredit,
  can,
  prorateCredit,
  validateAccrualRun,
  workingDaysFromDateToMonthEnd,
  workingDaysInMonth,
} from './index';

// TC-08-UNIT-01: Auto-accrual credit calculation
describe('TC-08-UNIT-01 calculateMonthlyCredit', () => {
  it('case 1: rate=40, reserve=3.33 → 230.88', () => {
    expect(calculateMonthlyCredit(40, 3.33)).toBe(230.88);
  });

  it('case 2: rate=60, reserve=5.00 → 520.00', () => {
    expect(calculateMonthlyCredit(60, 5.0)).toBe(520.0);
  });

  it('rounds strictly to two decimal places', () => {
    const value = calculateMonthlyCredit(40, 3.33);
    expect(Math.round(value * 100) / 100).toBe(value);
  });
});

// TC-08-UNIT-01 case 3: pro-rating
describe('TC-08-UNIT-01 prorateCredit', () => {
  it('case 3: (230.88, 10 of 22 working days) → 104.95', () => {
    expect(prorateCredit(230.88, 10, 22)).toBe(104.95);
  });

  it('a full month (config days === month days) leaves the credit unchanged', () => {
    expect(prorateCredit(230.88, 22, 22)).toBe(230.88);
  });

  it('guards a zero denominator → 0 (never Infinity/NaN)', () => {
    expect(prorateCredit(230.88, 10, 0)).toBe(0);
  });
});

// TC-08-UNIT-02: Available days calculation
describe('TC-08-UNIT-02 calculateAvailableDays', () => {
  const base = { monthlySalary: 3000, vacationDaysPerYear: 20 };

  it('case 1: reserve 1661.54 → 12', () => {
    expect(calculateAvailableDays({ ...base, reserveBalance: 1661.54, usedDays: 0 })).toBe(12);
  });

  it('case 2: reserve 0 → 0', () => {
    expect(calculateAvailableDays({ ...base, reserveBalance: 0, usedDays: 0 })).toBe(0);
  });

  it('case 3: reserve 2769.23, usedDays 18 → 2 (capped by annual limit)', () => {
    expect(calculateAvailableDays({ ...base, reserveBalance: 2769.23, usedDays: 18 })).toBe(2);
  });

  it('case 4: negative reserve -100 → 0 (floored at zero)', () => {
    expect(calculateAvailableDays({ ...base, reserveBalance: -100, usedDays: 0 })).toBe(0);
  });

  it('guards a zero salary (divide-by-zero) → 0', () => {
    expect(
      calculateAvailableDays({ reserveBalance: 5000, monthlySalary: 0, vacationDaysPerYear: 20, usedDays: 0 }),
    ).toBe(0);
  });
});

// Working-days counting (weekdays only, no holidays)
describe('workingDaysInMonth / workingDaysFromDateToMonthEnd', () => {
  it('June 2025 has 21 working days', () => {
    expect(workingDaysInMonth(2025, 6)).toBe(21);
  });

  // NOTE: the spec (TC-08-INT-02 preconditions) claims June 15 → 12 working days,
  // but June 15 2025 is a Sunday, so counting weekdays inclusively from the 15th
  // yields 11 (June's 21 total minus the 10 weekdays before the 15th). The
  // implementation is calendar-correct; the spec value is internally inconsistent
  // (21 total and "12 from the 15th" cannot both hold). Asserting the correct 11.
  it('from June 15 2025 (a Sunday) to month end → 11 working days', () => {
    expect(workingDaysFromDateToMonthEnd(2025, 6, 15)).toBe(11);
  });

  it('a 31-day month: July 2025 has 23 working days', () => {
    expect(workingDaysInMonth(2025, 7)).toBe(23);
  });

  it('February 2025 has 20 working days', () => {
    expect(workingDaysInMonth(2025, 2)).toBe(20);
  });

  it('from day 1 equals the whole-month count', () => {
    expect(workingDaysFromDateToMonthEnd(2025, 6, 1)).toBe(workingDaysInMonth(2025, 6));
  });
});

// Deterministic labels
describe('billingPeriodLabel / accrualDescription', () => {
  it('(2025, 6) → "June 2025"', () => {
    expect(billingPeriodLabel(2025, 6)).toBe('June 2025');
  });

  it('(2025, 6) → "June 2025 accrual"', () => {
    expect(accrualDescription(2025, 6)).toBe('June 2025 accrual');
  });

  it('covers January and December endpoints', () => {
    expect(billingPeriodLabel(2025, 1)).toBe('January 2025');
    expect(billingPeriodLabel(2025, 12)).toBe('December 2025');
  });
});

// Manual-accrual request validation
describe('validateAccrualRun', () => {
  const now = { year: 2025, month: 7 };

  it('accepts a valid past period', () => {
    expect(validateAccrualRun({ month: 6, year: 2025 }, now)).toEqual({
      valid: true,
      value: { month: 6, year: 2025 },
    });
  });

  it('accepts the current period', () => {
    expect(validateAccrualRun({ month: 7, year: 2025 }, now).valid).toBe(true);
  });

  it('accepts a prior-year period', () => {
    expect(validateAccrualRun({ month: 12, year: 2024 }, now).valid).toBe(true);
  });

  it('rejects month 0 as invalid_month', () => {
    expect(validateAccrualRun({ month: 0, year: 2025 }, now)).toEqual({
      valid: false,
      error: 'invalid_month',
      message: ACCRUAL_MESSAGES.invalidMonth,
    });
  });

  it('rejects month 13 as invalid_month', () => {
    expect(validateAccrualRun({ month: 13, year: 2025 }, now).error).toBe('invalid_month');
  });

  it('rejects a non-integer month as invalid_month', () => {
    expect(validateAccrualRun({ month: 6.5, year: 2025 }, now).error).toBe('invalid_month');
  });

  it('rejects a future month in the current year as future_period (TC-08-INT-09)', () => {
    expect(validateAccrualRun({ month: 8, year: 2025 }, now)).toEqual({
      valid: false,
      error: 'future_period',
      message: ACCRUAL_MESSAGES.futurePeriod,
    });
  });

  it('rejects a future year as future_period', () => {
    expect(validateAccrualRun({ month: 1, year: 2026 }, now).error).toBe('future_period');
  });

  it('coerces numeric strings from a JSON body', () => {
    expect(validateAccrualRun({ month: '6', year: '2025' }, now)).toEqual({
      valid: true,
      value: { month: 6, year: 2025 },
    });
  });
});

// Capability matrix — spec 08's run-accrual (admin only)
describe('spec 08 run-accrual capability', () => {
  it('admin can run accrual', () => {
    expect(can('admin', 'run-accrual')).toBe(true);
  });

  it('manager, user, viewer cannot run accrual', () => {
    expect(can('manager', 'run-accrual')).toBe(false);
    expect(can('user', 'run-accrual')).toBe(false);
    expect(can('viewer', 'run-accrual')).toBe(false);
  });
});

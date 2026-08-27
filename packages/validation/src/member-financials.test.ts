import { describe, expect, it } from 'vitest';
import {
  calculateReservePercent,
  can,
  isValidCurrency,
  validateClientHourlyRate,
  validateCurrency,
  validateMemberFinancials,
  validateMonthlySalary,
  validateVacationDaysPerYear,
  validateVacationReservePercent,
} from './index';

// TC-07-UNIT-01: Auto-calculate reserve percentage
describe('TC-07-UNIT-01 auto-calculate reserve percentage', () => {
  it('computes 3.33 for salary=3000, rate=40, days=20', () => {
    expect(
      calculateReservePercent({ monthlySalary: 3000, clientHourlyRate: 40, vacationDaysPerYear: 20 }),
    ).toBe(3.33);
  });

  it('computes 3.70 for salary=5000, rate=60, days=20', () => {
    expect(
      calculateReservePercent({ monthlySalary: 5000, clientHourlyRate: 60, vacationDaysPerYear: 20 }),
    ).toBe(3.7);
  });

  it('computes 2.66 for salary=2000, rate=25, days=15', () => {
    expect(
      calculateReservePercent({ monthlySalary: 2000, clientHourlyRate: 25, vacationDaysPerYear: 15 }),
    ).toBe(2.66);
  });

  // TC-07-INT-05 math: updating salary to 4000 recomputes the auto-percent to 4.44.
  it('computes 4.44 for salary=4000, rate=40, days=20 (recalculation)', () => {
    expect(
      calculateReservePercent({ monthlySalary: 4000, clientHourlyRate: 40, vacationDaysPerYear: 20 }),
    ).toBe(4.44);
  });

  it('rounds strictly to two decimal places', () => {
    const value = calculateReservePercent({
      monthlySalary: 3000,
      clientHourlyRate: 40,
      vacationDaysPerYear: 20,
    });
    expect(Math.round(value * 100) / 100).toBe(value);
  });
});

// Validation Rule 1 — MonthlySalary
describe('validateMonthlySalary (range 0.01–999,999.99, ≤2 dp)', () => {
  it('accepts the minimum 0.01', () => {
    expect(validateMonthlySalary(0.01)).toEqual({ valid: true, value: 0.01 });
  });

  it('accepts the maximum 999999.99', () => {
    expect(validateMonthlySalary(999999.99)).toEqual({ valid: true, value: 999999.99 });
  });

  it('rejects 0 (TC-07-INT-03 step 1)', () => {
    expect(validateMonthlySalary(0)).toEqual({
      valid: false,
      error: 'Monthly salary must be between 0.01 and 999,999.99',
    });
  });

  it('rejects 1000000 (TC-07-INT-03 step 2)', () => {
    expect(validateMonthlySalary(1000000).valid).toBe(false);
  });

  it('rejects more than two decimal places', () => {
    expect(validateMonthlySalary(3000.001).valid).toBe(false);
  });

  it('rejects a blank / missing value', () => {
    expect(validateMonthlySalary('').valid).toBe(false);
    expect(validateMonthlySalary(undefined).valid).toBe(false);
  });

  it('accepts a numeric string from the web form', () => {
    expect(validateMonthlySalary('3000.00')).toEqual({ valid: true, value: 3000 });
  });
});

// Validation Rule 2 — ClientHourlyRate
describe('validateClientHourlyRate (range 0.01–9,999.99, ≤2 dp)', () => {
  it('accepts the boundaries', () => {
    expect(validateClientHourlyRate(0.01).valid).toBe(true);
    expect(validateClientHourlyRate(9999.99).valid).toBe(true);
  });

  it('rejects -5 (TC-07-INT-03 step 3)', () => {
    expect(validateClientHourlyRate(-5)).toEqual({
      valid: false,
      error: 'Client hourly rate must be between 0.01 and 9,999.99',
    });
  });

  it('rejects just over the max', () => {
    expect(validateClientHourlyRate(10000).valid).toBe(false);
  });

  it('rejects three decimal places', () => {
    expect(validateClientHourlyRate('40.001').valid).toBe(false);
  });
});

// Validation Rule 3 — VacationDaysPerYear
describe('validateVacationDaysPerYear (integer 1–365)', () => {
  it('accepts the boundaries 1 and 365', () => {
    expect(validateVacationDaysPerYear(1).valid).toBe(true);
    expect(validateVacationDaysPerYear(365).valid).toBe(true);
  });

  it('rejects 0 (TC-07-INT-03 step 4)', () => {
    expect(validateVacationDaysPerYear(0)).toEqual({
      valid: false,
      error: 'Vacation days per year must be between 1 and 365',
    });
  });

  it('rejects 366', () => {
    expect(validateVacationDaysPerYear(366).valid).toBe(false);
  });

  it('rejects a non-integer', () => {
    expect(validateVacationDaysPerYear(20.5).valid).toBe(false);
  });

  it('accepts an integer string', () => {
    expect(validateVacationDaysPerYear('20')).toEqual({ valid: true, value: 20 });
  });
});

// Validation Rule 4 — Currency
describe('isValidCurrency / validateCurrency', () => {
  it('accepts USD', () => {
    expect(isValidCurrency('USD')).toBe(true);
    expect(validateCurrency('USD')).toEqual({ valid: true, value: 'USD' });
  });

  it('rejects "XXXX" (TC-07-INT-03 step 5)', () => {
    expect(isValidCurrency('XXXX')).toBe(false);
    expect(validateCurrency('XXXX')).toEqual({ valid: false, error: 'Invalid currency code' });
  });

  it('rejects lowercase and unknown three-letter codes', () => {
    expect(isValidCurrency('usd')).toBe(false);
    expect(isValidCurrency('ZZZ')).toBe(false);
  });

  it('rejects an empty currency', () => {
    expect(validateCurrency('').valid).toBe(false);
  });
});

// Validation Rule 5 — VacationReservePercent (manual)
describe('validateVacationReservePercent (range 0.01–99.99, ≤2 dp)', () => {
  it('accepts the boundaries', () => {
    expect(validateVacationReservePercent(0.01).valid).toBe(true);
    expect(validateVacationReservePercent(99.99).valid).toBe(true);
  });

  it('rejects 100 (TC-07-INT-03 step 6)', () => {
    expect(validateVacationReservePercent(100)).toEqual({
      valid: false,
      error: 'Reserve percentage must be between 0.01 and 99.99',
    });
  });

  it('rejects 0', () => {
    expect(validateVacationReservePercent(0).valid).toBe(false);
  });
});

// Composite validator + manual-vs-auto skip behavior
describe('validateMemberFinancials composite', () => {
  const validAuto = {
    monthlySalary: 3000,
    clientHourlyRate: 40,
    vacationDaysPerYear: 20,
    currency: 'USD',
    isReservePercentManual: false,
  };

  it('passes a valid auto-mode payload', () => {
    const result = validateMemberFinancials(validAuto);
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual({});
    expect(result.firstInvalidField).toBeNull();
    expect(result.value.monthlySalary).toBe(3000);
    expect(result.value.currency).toBe('USD');
    expect(result.value.vacationReservePercent).toBeNull();
  });

  it('skips the reserve-percent rule entirely in auto mode', () => {
    // A junk percent in auto mode must not produce an error — it is ignored.
    const result = validateMemberFinancials({ ...validAuto, vacationReservePercent: 999 });
    expect(result.valid).toBe(true);
    expect(result.errors.vacationReservePercent).toBeUndefined();
  });

  it('enforces the reserve-percent rule in manual mode', () => {
    const result = validateMemberFinancials({
      ...validAuto,
      isReservePercentManual: true,
      vacationReservePercent: 100,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.vacationReservePercent).toBe(
      'Reserve percentage must be between 0.01 and 99.99',
    );
  });

  it('accepts a valid manual percent', () => {
    const result = validateMemberFinancials({
      ...validAuto,
      isReservePercentManual: true,
      vacationReservePercent: 5.0,
    });
    expect(result.valid).toBe(true);
    expect(result.value.vacationReservePercent).toBe(5);
  });

  it('requires the manual percent when manual mode is on but none is supplied', () => {
    const result = validateMemberFinancials({ ...validAuto, isReservePercentManual: true });
    expect(result.valid).toBe(false);
    expect(result.errors.vacationReservePercent).toBeDefined();
  });

  it('collects all field errors and reports firstInvalidField in field order', () => {
    const result = validateMemberFinancials({
      monthlySalary: 0,
      clientHourlyRate: -5,
      vacationDaysPerYear: 0,
      currency: 'XXXX',
      isReservePercentManual: false,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.monthlySalary).toBe('Monthly salary must be between 0.01 and 999,999.99');
    expect(result.errors.clientHourlyRate).toBe(
      'Client hourly rate must be between 0.01 and 9,999.99',
    );
    expect(result.errors.vacationDaysPerYear).toBe('Vacation days per year must be between 1 and 365');
    expect(result.errors.currency).toBe('Invalid currency code');
    expect(result.firstInvalidField).toBe('monthlySalary');
  });

  it('is robust to numeric strings from the web form', () => {
    const result = validateMemberFinancials({
      monthlySalary: '3000.00',
      clientHourlyRate: '40',
      vacationDaysPerYear: '20',
      currency: 'USD',
      isReservePercentManual: false,
    });
    expect(result.valid).toBe(true);
    expect(result.value.monthlySalary).toBe(3000);
    expect(result.value.vacationDaysPerYear).toBe(20);
  });
});

// Capability matrix — spec 07's three new capabilities across all four roles
describe('spec 07 capability matrix', () => {
  it('view-vacation: admin/manager only', () => {
    expect(can('admin', 'view-vacation')).toBe(true);
    expect(can('manager', 'view-vacation')).toBe(true);
    expect(can('user', 'view-vacation')).toBe(false);
    expect(can('viewer', 'view-vacation')).toBe(false);
  });

  it('view-own-vacation-balance: admin/manager/user, not viewer', () => {
    expect(can('admin', 'view-own-vacation-balance')).toBe(true);
    expect(can('manager', 'view-own-vacation-balance')).toBe(true);
    expect(can('user', 'view-own-vacation-balance')).toBe(true);
    expect(can('viewer', 'view-own-vacation-balance')).toBe(false);
  });

  it('edit-member-financials: admin/manager only', () => {
    expect(can('admin', 'edit-member-financials')).toBe(true);
    expect(can('manager', 'edit-member-financials')).toBe(true);
    expect(can('user', 'edit-member-financials')).toBe(false);
    expect(can('viewer', 'edit-member-financials')).toBe(false);
  });
});

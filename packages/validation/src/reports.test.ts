import { describe, expect, it } from 'vitest';
import {
  HOURS_PER_MONTH_FOR_PAY_RATE,
  REPORT_MAX_RANGE_DAYS,
  REPORTS_MESSAGES,
  buildHolidayRow,
  buildVacationRow,
  intersectReportColumns,
  isHolidayApplicableToMember,
  isZeroTotal,
  pdfReportFilename,
  resolveRateAtDate,
  validateCuidList,
  validateReportRange,
  weightedAverageRate,
} from './index';
import { hasCapability } from './roles';

// specs/reports/01-reports.md §Test Cases — Unit.

describe('TC-01-UNIT: capabilities matrix (spec §Roles & Permission Matrix)', () => {
  it('admin gets every reporting capability including Spent', () => {
    for (const cap of [
      'ViewAmountsOwed',
      'ViewMyAmountsOwed',
      'ViewTimeAndActivity',
      'ViewMyTimeAndActivity',
      'ViewTimeOff',
      'ViewMyTimeOff',
      'ViewTimeAndActivityBilled',
      'ViewTimeAndActivitySpent',
      'ExportReports',
    ] as const) {
      expect(hasCapability('admin', cap)).toBe(true);
    }
  });

  it('manager gets All variants and Billed but NOT Spent', () => {
    expect(hasCapability('manager', 'ViewAmountsOwed')).toBe(true);
    expect(hasCapability('manager', 'ViewTimeAndActivity')).toBe(true);
    expect(hasCapability('manager', 'ViewTimeAndActivityBilled')).toBe(true);
    expect(hasCapability('manager', 'ViewTimeAndActivitySpent')).toBe(false);
    expect(hasCapability('manager', 'ExportReports')).toBe(true);
  });

  it('user gets only My variants + ExportReports', () => {
    expect(hasCapability('user', 'ViewAmountsOwed')).toBe(false);
    expect(hasCapability('user', 'ViewMyAmountsOwed')).toBe(true);
    expect(hasCapability('user', 'ViewMyTimeAndActivity')).toBe(true);
    expect(hasCapability('user', 'ViewMyTimeOff')).toBe(true);
    expect(hasCapability('user', 'ExportReports')).toBe(true);
  });

  it('viewer sees only own time-off and cannot export', () => {
    expect(hasCapability('viewer', 'ViewMyTimeOff')).toBe(true);
    expect(hasCapability('viewer', 'ViewMyAmountsOwed')).toBe(false);
    expect(hasCapability('viewer', 'ViewTimeOff')).toBe(false);
    expect(hasCapability('viewer', 'ExportReports')).toBe(false);
  });
});

describe('TC-01-UNIT-01..03: validateReportRange (spec Validation Rules 1–4)', () => {
  it('TC-01-UNIT-01: happy — produces UTC bounds in the caller timezone', () => {
    const result = validateReportRange('2026-08-01', '2026-08-31', 'Europe/Warsaw');
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    // Europe/Warsaw is UTC+2 in August (CEST). Start-of-day 2026-08-01 CEST =
    // 2026-07-31T22:00:00Z. End-of-day 2026-08-31 CEST = start-of-day
    // 2026-09-01 CEST = 2026-08-31T22:00:00Z.
    expect(result.startUtc.toISOString()).toBe('2026-07-31T22:00:00.000Z');
    expect(result.endUtcExclusive.toISOString()).toBe('2026-08-31T22:00:00.000Z');
    expect(result.startDate).toBe('2026-08-01');
    expect(result.endDate).toBe('2026-08-31');
  });

  it('TC-01-UNIT-01 (UTC): identity when the caller timezone is UTC', () => {
    const result = validateReportRange('2026-08-01', '2026-08-31', 'UTC');
    expect(result.valid).toBe(true);
    if (!result.valid) return;
    expect(result.startUtc.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(result.endUtcExclusive.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('TC-01-UNIT-02: end before start returns end-before-start error', () => {
    const result = validateReportRange('2026-08-31', '2026-08-01', 'UTC');
    expect(result).toEqual({
      valid: false,
      field: 'range',
      error: REPORTS_MESSAGES.endBeforeStart,
    });
  });

  it('TC-01-UNIT-03: range wider than 370 days returns rangeTooWide', () => {
    // 400 days = > 370.
    const result = validateReportRange('2025-01-01', '2026-02-04', 'UTC');
    expect(result).toEqual({
      valid: false,
      field: 'range',
      error: REPORTS_MESSAGES.rangeTooWide,
    });
  });

  it('accepts exactly REPORT_MAX_RANGE_DAYS days as the upper bound', () => {
    // 2025-01-01 → 2026-01-05 = 370 days inclusive.
    const result = validateReportRange('2025-01-01', '2026-01-05', 'UTC');
    expect(result.valid).toBe(true);
    expect(REPORT_MAX_RANGE_DAYS).toBe(370);
  });

  it('rejects a blank startDate as "required", not "invalid"', () => {
    const result = validateReportRange('', '2026-08-31', 'UTC');
    expect(result).toEqual({
      valid: false,
      field: 'startDate',
      error: REPORTS_MESSAGES.startDateRequired,
    });
  });

  it('rejects a malformed date as "invalid"', () => {
    const result = validateReportRange('2026-8-1', '2026-08-31', 'UTC');
    expect(result).toEqual({
      valid: false,
      field: 'startDate',
      error: REPORTS_MESSAGES.startDateInvalid,
    });
  });

  it('rejects a calendar-impossible date (2026-02-30)', () => {
    const result = validateReportRange('2026-02-30', '2026-03-01', 'UTC');
    expect(result.valid).toBe(false);
    if (result.valid) return;
    expect(result.field).toBe('startDate');
  });
});

describe('TC-01-UNIT-04..06: intersectReportColumns (spec §Column permission filter)', () => {
  it('TC-01-UNIT-04: deny Spent — defaults union-ed, Spent dropped', () => {
    const cols = intersectReportColumns(
      ['Client', 'Spent'],
      { billed: true, spent: false },
    );
    expect(cols).toEqual(['Project', 'Time', 'Member', 'Client']);
  });

  it('TC-01-UNIT-05: allow Spent — Spent stays in the projection', () => {
    const cols = intersectReportColumns(
      ['Client', 'Spent'],
      { billed: true, spent: true },
    );
    expect(cols).toEqual(['Project', 'Time', 'Member', 'Client', 'Spent']);
  });

  it('TC-01-UNIT-06: default columns cannot be removed — Project/Time/Member always shown', () => {
    const cols = intersectReportColumns(['Client'], { billed: false, spent: false });
    expect(cols).toEqual(['Project', 'Time', 'Member', 'Client']);
  });

  it('unknown items are silently dropped', () => {
    const cols = intersectReportColumns(
      ['Client', 'GarbageColumn', 'Spent'],
      { billed: false, spent: false },
    );
    expect(cols).toEqual(['Project', 'Time', 'Member', 'Client']);
  });

  it('order matches REPORT_COLUMNS regardless of caller ordering', () => {
    const a = intersectReportColumns(
      ['Notes', 'Billed Amount', 'Client'],
      { billed: true, spent: true },
    );
    const b = intersectReportColumns(
      ['Client', 'Notes', 'Billed Amount'],
      { billed: true, spent: true },
    );
    expect(a).toEqual(b);
    expect(a).toEqual(['Project', 'Time', 'Member', 'Client', 'Billed Amount', 'Notes']);
  });

  it('Billed Amount gated by billed grant', () => {
    const cols = intersectReportColumns(
      ['Billed Amount'],
      { billed: false, spent: true },
    );
    expect(cols).toEqual(['Project', 'Time', 'Member']);
  });
});

describe('TC-01-UNIT-07..10: resolveRateAtDate (spec §Rate lookup)', () => {
  it('TC-01-UNIT-07: snapshot before + live matches — uses snapshot rate', () => {
    const rate = resolveRateAtDate(
      [{ effectiveFrom: new Date('2026-01-01'), clientHourlyRate: 45, monthlySalary: 5000 }],
      { clientHourlyRate: 45, monthlySalary: 5000 },
      new Date('2026-03-15'),
    );
    expect(rate.billRate).toBe(45);
  });

  it('TC-01-UNIT-08: snapshot before, live differs — picks newest snapshot ≤ date', () => {
    const snapshots = [
      { effectiveFrom: new Date('2026-01-01'), clientHourlyRate: 45, monthlySalary: 5000 },
      { effectiveFrom: new Date('2026-06-01'), clientHourlyRate: 55, monthlySalary: 6000 },
    ];
    const live = { clientHourlyRate: 55, monthlySalary: 6000 };
    expect(resolveRateAtDate(snapshots, live, new Date('2026-03-15')).billRate).toBe(45);
    expect(resolveRateAtDate(snapshots, live, new Date('2026-07-15')).billRate).toBe(55);
  });

  it('TC-01-UNIT-09: no snapshot precedes date — falls back to live', () => {
    const snapshots = [{ effectiveFrom: new Date('2026-04-01'), clientHourlyRate: 60, monthlySalary: 7000 }];
    const live = { clientHourlyRate: 50, monthlySalary: 5000 };
    expect(resolveRateAtDate(snapshots, live, new Date('2026-03-15')).billRate).toBe(50);
  });

  it('TC-01-UNIT-10: zero salary → payRate = 0', () => {
    const rate = resolveRateAtDate(
      [],
      { clientHourlyRate: 50, monthlySalary: 0 },
      new Date('2026-03-15'),
    );
    expect(rate.payRate).toBe(0);
  });

  it('salary → payRate = salary / HOURS_PER_MONTH_FOR_PAY_RATE (168)', () => {
    const rate = resolveRateAtDate(
      [],
      { clientHourlyRate: 50, monthlySalary: 8400 },
      new Date('2026-03-15'),
    );
    expect(HOURS_PER_MONTH_FOR_PAY_RATE).toBe(168);
    expect(rate.payRate).toBe(50);
  });

  it('empty snapshots and null live → both rates 0', () => {
    const rate = resolveRateAtDate([], null, new Date('2026-03-15'));
    expect(rate).toEqual({ billRate: 0, payRate: 0 });
  });
});

describe('TC-01-UNIT-15: weightedAverageRate (spec requirement 14)', () => {
  it('weighted average: 10h @50 + 30h @55 → total 40h / €2150 / rate 53.75', () => {
    const w = weightedAverageRate([
      { hours: 10, rate: 50 },
      { hours: 30, rate: 55 },
    ]);
    expect(w.totalHours).toBe(40);
    expect(w.totalAmount).toBe(2150);
    expect(w.displayRate).toBe(53.75);
  });

  it('zero hours → displayRate 0, no divide-by-zero', () => {
    const w = weightedAverageRate([]);
    expect(w.totalHours).toBe(0);
    expect(w.totalAmount).toBe(0);
    expect(w.displayRate).toBe(0);
  });
});

describe('TC-01-UNIT-14: pdfReportFilename (spec requirement 35)', () => {
  it('TC-01-UNIT-14: multi-day range → `{Display Name} {start}_to_{end}.pdf`', () => {
    expect(pdfReportFilename('Amounts Owed', '2026-08-01', '2026-08-31')).toBe(
      'Amounts Owed 2026-08-01_to_2026-08-31.pdf',
    );
    expect(pdfReportFilename('Time & Activity', '2026-08-01', '2026-08-31')).toBe(
      'Time & Activity 2026-08-01_to_2026-08-31.pdf',
    );
  });

  it('single-day range → `{Display Name} {date}.pdf` (no `_to_` when start = end)', () => {
    expect(pdfReportFilename('Amounts Owed', '2026-09-02', '2026-09-02')).toBe(
      'Amounts Owed 2026-09-02.pdf',
    );
  });

  it('replaces filesystem-hostile characters with a hyphen', () => {
    // `/` and `:` are always dangerous on Windows and darwin; `<` too. Result
    // is still readable — the hostile char becomes a legible hyphen, not `_`.
    expect(pdfReportFilename('Foo/Bar: Report', '2026-08-01', '2026-08-31')).toBe(
      'Foo-Bar- Report 2026-08-01_to_2026-08-31.pdf',
    );
  });

  it('falls back to "Report" when the display name is blank or whitespace', () => {
    expect(pdfReportFilename('   ', '2026-08-01', '2026-08-31')).toBe(
      'Report 2026-08-01_to_2026-08-31.pdf',
    );
    expect(pdfReportFilename('', '2026-08-01', '2026-08-31')).toBe(
      'Report 2026-08-01_to_2026-08-31.pdf',
    );
  });

  it('clamps to 200 characters — the dates always survive, the name is truncated', () => {
    const longName = 'A'.repeat(300);
    const out = pdfReportFilename(longName, '2026-08-01', '2026-08-31');
    expect(out.length).toBeLessThanOrEqual(200);
    expect(out.endsWith(' 2026-08-01_to_2026-08-31.pdf')).toBe(true);
  });
});

describe('TC-01-UNIT-16: buildHolidayRow (spec requirement 18)', () => {
  it('TC-01-UNIT-16: BY member + BY holiday + rate 50 → 8.00 hours @ 50 = 400.00', () => {
    const row = buildHolidayRow(
      {
        name: 'Independence Day',
        date: new Date('2026-07-04'),
        paidHours: 8,
        countryCode: 'BY',
      },
      { membershipId: 'm1', displayName: 'Alex', countryCode: 'BY' },
      50,
    );
    expect(row).toMatchObject({
      membershipId: 'm1',
      member: 'Alex',
      activity: 'Holiday · Independence Day',
      hours: '8.00',
      rate: '50.00',
      amount: '400.00',
      kind: 'holiday',
    });
  });

  it('isHolidayApplicableToMember: global (null) applies to everyone', () => {
    expect(
      isHolidayApplicableToMember({ countryCode: null }, { countryCode: 'BY' }),
    ).toBe(true);
    expect(isHolidayApplicableToMember({ countryCode: null }, { countryCode: null })).toBe(true);
  });

  it('isHolidayApplicableToMember: mismatched countries excluded (case-insensitive match)', () => {
    expect(isHolidayApplicableToMember({ countryCode: 'BY' }, { countryCode: 'US' })).toBe(false);
    expect(isHolidayApplicableToMember({ countryCode: 'by' }, { countryCode: 'BY' })).toBe(true);
  });

  it('isHolidayApplicableToMember: country-scoped holiday needs a member country', () => {
    expect(isHolidayApplicableToMember({ countryCode: 'BY' }, { countryCode: null })).toBe(false);
  });
});

describe('TC-01-UNIT-17/18: buildVacationRow (spec requirements 22–23)', () => {
  const member = { membershipId: 'm1', displayName: 'Alex', countryCode: 'BY' };

  it('TC-01-UNIT-17: approved → row with hours = workingDays × 8 and amount = frozen deduction', () => {
    const row = buildVacationRow(
      {
        startDate: new Date('2026-02-15'),
        endDate: new Date('2026-02-28'),
        status: 'approved',
        workingDays: 10,
        deductionAmount: 2307.69,
      },
      member,
      55,
    );
    expect(row).toMatchObject({
      activity: 'Vacation (approved)',
      hours: '80.00',
      rate: '55.00',
      amount: '2307.69',
      kind: 'vacation',
    });
  });

  it('TC-01-UNIT-18: pending / rejected / cancelled → null (no row)', () => {
    const base = {
      startDate: new Date('2026-02-15'),
      endDate: new Date('2026-02-28'),
      workingDays: 10,
      deductionAmount: 2307.69,
    };
    expect(buildVacationRow({ ...base, status: 'pending' }, member, 55)).toBeNull();
    expect(buildVacationRow({ ...base, status: 'rejected' }, member, 55)).toBeNull();
    expect(buildVacationRow({ ...base, status: 'cancelled' }, member, 55)).toBeNull();
  });
});

describe('validateCuidList (spec Validation Rules 5–6)', () => {
  // Kept exported under the historical name; accepts both cuid and uuid shapes
  // now (schema uses `@default(uuid())` for every primary key that reaches
  // these filters). See ID_PATTERN in reports.ts.

  it('accepts a real Prisma uuid (hyphenated, lowercase)', () => {
    expect(validateCuidList('4f6c7b1a-9e2b-4d3f-8a12-6c1a2b3d4e5f', 'x')).toEqual({
      valid: true,
      value: ['4f6c7b1a-9e2b-4d3f-8a12-6c1a2b3d4e5f'],
    });
  });

  it('accepts a cuid2-ish alphanumeric id', () => {
    expect(validateCuidList('cly12345abcd', 'x')).toEqual({ valid: true, value: ['cly12345abcd'] });
  });

  it('rejects an uppercase / bogus / wrong-length string with the given message', () => {
    expect(validateCuidList('AAAA', REPORTS_MESSAGES.invalidMemberRef)).toEqual({
      valid: false,
      error: REPORTS_MESSAGES.invalidMemberRef,
    });
    expect(validateCuidList('1234-5678', REPORTS_MESSAGES.invalidMemberRef)).toEqual({
      valid: false,
      error: REPORTS_MESSAGES.invalidMemberRef,
    });
  });

  it('accepts an array and preserves order', () => {
    const a = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    const b = 'cly1234567';
    expect(validateCuidList([a, b], 'x')).toEqual({ valid: true, value: [a, b] });
  });

  it('undefined / null → empty list (spec: absent filter means "all")', () => {
    expect(validateCuidList(undefined, 'x')).toEqual({ valid: true, value: [] });
    expect(validateCuidList(null, 'x')).toEqual({ valid: true, value: [] });
  });
});

describe('TC-01-UNIT-13: isZeroTotal (spec requirement 30, empty-row filter)', () => {
  it('true when both hours and amount are 0', () => {
    expect(isZeroTotal({ hours: '0.00', amount: '0.00' })).toBe(true);
    expect(isZeroTotal({ hours: '0', amount: '0' })).toBe(true);
  });

  it('false when either is non-zero', () => {
    expect(isZeroTotal({ hours: '1.00', amount: '0.00' })).toBe(false);
    expect(isZeroTotal({ hours: '0.00', amount: '5.00' })).toBe(false);
  });
});

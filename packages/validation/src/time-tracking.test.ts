import { describe, expect, it } from 'vitest';
import {
  can,
  computeDurationFromRange,
  formatElapsed,
  computeTimerStopMinutes,
  formatDurationHuman,
  formatHoursOneDecimal,
  formatWallClockInTz,
  gmtLabel,
  localDateInTz,
  minutesOfDayInTz,
  timerStoppedToast,
  tzOffsetMinutes,
  validateTimeEntry,
  validateTimeEntryRange,
  validateTimerMeta,
  zonedWallClockToUtc,
  TIME_TRACKING_MESSAGES,
} from './index';

// A fixed reference "today" so the date-window rules are deterministic — never
// call new Date() at an assertion boundary; the API passes the member's today.
const TODAY = '2026-08-27';

// --- TC-12-UNIT-01: duration from an HH:MM range ---------------------------
describe('computeDurationFromRange', () => {
  it('09:00 → 11:30 is 150 minutes', () => {
    expect(computeDurationFromRange('09:00', '11:30')).toBe(150);
  });

  it('09:00 → 09:01 is 1 minute', () => {
    expect(computeDurationFromRange('09:00', '09:01')).toBe(1);
  });

  it('00:00 → 23:59 is 1439 minutes', () => {
    expect(computeDurationFromRange('00:00', '23:59')).toBe(1439);
  });
});

// --- TC-12-UNIT-02: elapsed formatting -------------------------------------
describe('formatElapsed', () => {
  it('0 seconds → "00:00:00"', () => {
    expect(formatElapsed(0)).toBe('00:00:00');
  });

  it('3661 seconds → "01:01:01"', () => {
    expect(formatElapsed(3661)).toBe('01:01:01');
  });

  it('86399 seconds → "23:59:59"', () => {
    expect(formatElapsed(86399)).toBe('23:59:59');
  });

  it('does not cap hours at 24 (25h → "25:00:00")', () => {
    expect(formatElapsed(90000)).toBe('25:00:00');
  });
});

// --- TC-12-UNIT-03: timer-stop minutes -------------------------------------
describe('computeTimerStopMinutes', () => {
  it('30_000ms → 1 minute (ceil, minimum 1)', () => {
    expect(computeTimerStopMinutes(30_000)).toBe(1);
  });

  it('61_000ms → 2 minutes', () => {
    expect(computeTimerStopMinutes(61_000)).toBe(2);
  });

  it('7_200_000ms → 120 minutes', () => {
    expect(computeTimerStopMinutes(7_200_000)).toBe(120);
  });

  it('0ms → 1 minute (minimum floor)', () => {
    expect(computeTimerStopMinutes(0)).toBe(1);
  });
});

// --- Human duration + one-decimal hours ------------------------------------
describe('formatDurationHuman', () => {
  it('150 → "2h 30m"', () => {
    expect(formatDurationHuman(150)).toBe('2h 30m');
  });

  it('60 → "1h 0m"', () => {
    expect(formatDurationHuman(60)).toBe('1h 0m');
  });

  it('5 → "0h 5m"', () => {
    expect(formatDurationHuman(5)).toBe('0h 5m');
  });
});

describe('formatHoursOneDecimal', () => {
  it('480 → "8.0"', () => {
    expect(formatHoursOneDecimal(480)).toBe('8.0');
  });

  it('150 → "2.5"', () => {
    expect(formatHoursOneDecimal(150)).toBe('2.5');
  });

  it('0 → "0.0"', () => {
    expect(formatHoursOneDecimal(0)).toBe('0.0');
  });
});

describe('timerStoppedToast', () => {
  it('interpolates the human duration with an em-dash', () => {
    expect(timerStoppedToast('2h 15m')).toBe('Timer stopped — 2h 15m logged');
  });
});

// --- Capabilities (spec 12 Roles & Permission Matrix) ----------------------
describe('spec 12 time-tracking capabilities', () => {
  it('view-time-tracking: admin/manager/user yes, viewer no', () => {
    expect(can('admin', 'view-time-tracking')).toBe(true);
    expect(can('manager', 'view-time-tracking')).toBe(true);
    expect(can('user', 'view-time-tracking')).toBe(true);
    expect(can('viewer', 'view-time-tracking')).toBe(false);
  });

  it('manage-own-time-entries: admin/manager/user yes, viewer no', () => {
    expect(can('admin', 'manage-own-time-entries')).toBe(true);
    expect(can('manager', 'manage-own-time-entries')).toBe(true);
    expect(can('user', 'manage-own-time-entries')).toBe(true);
    expect(can('viewer', 'manage-own-time-entries')).toBe(false);
  });

  it('manage-all-time-entries: admin/manager only', () => {
    expect(can('admin', 'manage-all-time-entries')).toBe(true);
    expect(can('manager', 'manage-all-time-entries')).toBe(true);
    expect(can('user', 'manage-all-time-entries')).toBe(false);
    expect(can('viewer', 'manage-all-time-entries')).toBe(false);
  });

  it('use-timer: admin/manager/user yes, viewer no', () => {
    expect(can('admin', 'use-timer')).toBe(true);
    expect(can('manager', 'use-timer')).toBe(true);
    expect(can('user', 'use-timer')).toBe(true);
    expect(can('viewer', 'use-timer')).toBe(false);
  });
});

// --- validateTimeEntry -----------------------------------------------------
describe('validateTimeEntry', () => {
  it('accepts a happy time-range entry and computes the duration', () => {
    const result = validateTimeEntry(
      {
        date: '2026-08-25',
        startTime: '09:00',
        endTime: '11:30',
        task: 'API development',
        description: 'Working on endpoints',
      },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: true,
      value: {
        date: '2026-08-25',
        startTime: '09:00',
        endTime: '11:30',
        durationMinutes: 150,
        task: 'API development',
        description: 'Working on endpoints',
      },
    });
  });

  it('accepts a happy duration-only entry (start/end null)', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 60, task: 'Meeting' },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: true,
      value: {
        date: '2026-08-25',
        startTime: null,
        endTime: null,
        durationMinutes: 60,
        task: 'Meeting',
        description: null,
      },
    });
  });

  it('trims task and description, collapsing whitespace-only to null', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 30, task: '  Coding  ', description: '   ' },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: true,
      value: {
        date: '2026-08-25',
        startTime: null,
        endTime: null,
        durationMinutes: 30,
        task: 'Coding',
        description: null,
      },
    });
  });

  it('rejects a missing date (required)', () => {
    const result = validateTimeEntry({ durationMinutes: 60 }, { today: TODAY });
    expect(result).toEqual({
      valid: false,
      errors: { date: TIME_TRACKING_MESSAGES.dateRequired },
    });
  });

  it('rejects a future date', () => {
    const result = validateTimeEntry(
      { date: '2026-08-28', durationMinutes: 60 },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { date: TIME_TRACKING_MESSAGES.dateFuture },
    });
  });

  it('rejects a date more than 90 days in the past (91 days)', () => {
    // 2026-08-27 minus 91 days = 2026-05-28.
    const result = validateTimeEntry(
      { date: '2026-05-28', durationMinutes: 60 },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { date: TIME_TRACKING_MESSAGES.dateTooOld },
    });
  });

  it('accepts a date exactly 90 days in the past', () => {
    // 2026-08-27 minus 90 days = 2026-05-29.
    const result = validateTimeEntry(
      { date: '2026-05-29', durationMinutes: 60 },
      { today: TODAY },
    );
    expect(result.valid).toBe(true);
  });

  it('rejects durationMinutes of 0 (min 1)', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 0 },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { durationMinutes: TIME_TRACKING_MESSAGES.durationMin },
    });
  });

  it('rejects durationMinutes of 1441 (max 1440)', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 1441 },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { durationMinutes: TIME_TRACKING_MESSAGES.durationMax },
    });
  });

  it('rejects a missing duration in duration-only mode', () => {
    const result = validateTimeEntry({ date: '2026-08-25' }, { today: TODAY });
    expect(result).toEqual({
      valid: false,
      errors: { durationMinutes: TIME_TRACKING_MESSAGES.durationRequired },
    });
  });

  it('rejects a start time with no end time', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', startTime: '09:00' },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { endTime: TIME_TRACKING_MESSAGES.endTimeRequired },
    });
  });

  it('rejects an end time not after the start time', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', startTime: '11:00', endTime: '09:00' },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { endTime: TIME_TRACKING_MESSAGES.endBeforeStart },
    });
  });

  it('rejects a 201-character task', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 60, task: 'a'.repeat(201) },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { task: TIME_TRACKING_MESSAGES.taskTooLong },
    });
  });

  it('rejects a 501-character description', () => {
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 60, description: 'a'.repeat(501) },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { description: TIME_TRACKING_MESSAGES.descriptionTooLong },
    });
  });

  it('accepts a 200-emoji task exactly at the codepoint limit (TC-12-INT-28)', () => {
    const task = '😀'.repeat(200); // 200 codepoints, 800 UTF-8 bytes
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 60, task },
      { today: TODAY },
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a 201-emoji task (codepoint counting, not UTF-16 units)', () => {
    const task = '😀'.repeat(201);
    const result = validateTimeEntry(
      { date: '2026-08-25', durationMinutes: 60, task },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: { task: TIME_TRACKING_MESSAGES.taskTooLong },
    });
  });

  it('collects multiple field errors at once', () => {
    const result = validateTimeEntry(
      { date: '2026-08-28', startTime: '09:00', task: 'a'.repeat(201) },
      { today: TODAY },
    );
    expect(result).toEqual({
      valid: false,
      errors: {
        date: TIME_TRACKING_MESSAGES.dateFuture,
        endTime: TIME_TRACKING_MESSAGES.endTimeRequired,
        task: TIME_TRACKING_MESSAGES.taskTooLong,
      },
    });
  });
});

// --- validateTimeEntryRange ------------------------------------------------
describe('validateTimeEntryRange', () => {
  it('rejects a missing from date', () => {
    expect(validateTimeEntryRange(undefined, '2026-08-27')).toEqual({
      valid: false,
      errors: { from: TIME_TRACKING_MESSAGES.queryFromRequired },
    });
  });

  it('rejects a missing to date', () => {
    expect(validateTimeEntryRange('2026-08-01', undefined)).toEqual({
      valid: false,
      errors: { to: TIME_TRACKING_MESSAGES.queryToRequired },
    });
  });

  it('rejects from after to (invalid_range)', () => {
    expect(validateTimeEntryRange('2026-08-27', '2026-08-01')).toEqual({
      valid: false,
      error: 'invalid_range',
      message: TIME_TRACKING_MESSAGES.queryInvalidRange,
    });
  });

  it('accepts an inclusive 31-day span', () => {
    // 2026-08-01 .. 2026-08-31 = 31 days inclusive.
    expect(validateTimeEntryRange('2026-08-01', '2026-08-31')).toEqual({ valid: true });
  });

  it('rejects a 32-day span (range_too_large)', () => {
    // 2026-08-01 .. 2026-09-01 = 32 days inclusive.
    expect(validateTimeEntryRange('2026-08-01', '2026-09-01')).toEqual({
      valid: false,
      error: 'range_too_large',
      message: TIME_TRACKING_MESSAGES.queryRangeTooLarge,
    });
  });

  it('accepts a same-day range', () => {
    expect(validateTimeEntryRange('2026-08-27', '2026-08-27')).toEqual({ valid: true });
  });
});

// --- timezone helpers (spec 12 change — effective-tz rendering) ------------
describe('tzOffsetMinutes', () => {
  // 2026-07-01 is summer in both hemispheres' example zones → DST offsets.
  const summer = new Date('2026-07-01T12:00:00Z');
  const winter = new Date('2026-01-01T12:00:00Z');

  it('a whole-hour positive zone (Europe/Berlin summer) → +120', () => {
    expect(tzOffsetMinutes('Europe/Berlin', summer)).toBe(120);
  });

  it('the same zone in winter → +60 (DST-aware)', () => {
    expect(tzOffsetMinutes('Europe/Berlin', winter)).toBe(60);
  });

  it('a negative zone (America/New_York summer) → -240', () => {
    expect(tzOffsetMinutes('America/New_York', summer)).toBe(-240);
  });

  it('a half-hour zone (Asia/Kolkata) → +330', () => {
    expect(tzOffsetMinutes('Asia/Kolkata', summer)).toBe(330);
  });

  it("'UTC', empty, and unknown zones → 0 (identity fallback)", () => {
    expect(tzOffsetMinutes('UTC', summer)).toBe(0);
    expect(tzOffsetMinutes('', summer)).toBe(0);
    expect(tzOffsetMinutes('Not/AZone', summer)).toBe(0);
  });
});

describe('formatWallClockInTz', () => {
  it('an instant renders at the tz-local HH:MM (09:07Z → 11:07 in Berlin summer)', () => {
    expect(formatWallClockInTz('2026-07-01T09:07:00.000Z', 'Europe/Berlin')).toBe('11:07');
  });

  it('the same instant is unshifted under the UTC fallback', () => {
    expect(formatWallClockInTz('2026-07-01T09:07:00.000Z', 'UTC')).toBe('09:07');
    expect(formatWallClockInTz('2026-07-01T09:07:00.000Z', '')).toBe('09:07');
  });

  it('a negative zone shifts backward (09:07Z → 05:07 in New York summer)', () => {
    expect(formatWallClockInTz('2026-07-01T09:07:00.000Z', 'America/New_York')).toBe('05:07');
  });
});

describe('zonedWallClockToUtc', () => {
  it('09:00 Berlin (summer) composes to 07:00Z', () => {
    expect(zonedWallClockToUtc('2026-07-01', '09:00', 'Europe/Berlin').toISOString()).toBe(
      '2026-07-01T07:00:00.000Z',
    );
  });

  it('is the identity under the UTC fallback', () => {
    expect(zonedWallClockToUtc('2026-07-01', '09:00', 'UTC').toISOString()).toBe(
      '2026-07-01T09:00:00.000Z',
    );
    expect(zonedWallClockToUtc('2026-07-01', '09:00', '').toISOString()).toBe(
      '2026-07-01T09:00:00.000Z',
    );
  });

  it('round-trips with formatWallClockInTz for a known zone', () => {
    const instant = zonedWallClockToUtc('2026-07-01', '14:30', 'America/New_York');
    expect(formatWallClockInTz(instant.toISOString(), 'America/New_York')).toBe('14:30');
  });
});

describe('minutesOfDayInTz', () => {
  it('minutes-since-local-midnight in the effective tz (11:07 Berlin → 667)', () => {
    expect(minutesOfDayInTz('2026-07-01T09:07:00.000Z', 'Europe/Berlin')).toBe(11 * 60 + 7);
  });

  it('falls back to UTC minutes for an unset zone', () => {
    expect(minutesOfDayInTz('2026-07-01T09:07:00.000Z', 'UTC')).toBe(9 * 60 + 7);
  });
});

describe('localDateInTz', () => {
  it('resolves the calendar date in the tz — a late-UTC instant is the next day in Berlin', () => {
    // 23:30Z on the 1st is 01:30 on the 2nd in Berlin (+2).
    expect(localDateInTz('2026-07-01T23:30:00.000Z', 'Europe/Berlin')).toBe('2026-07-02');
  });

  it('an early-UTC instant is the previous day in New York', () => {
    // 02:00Z on the 2nd is 22:00 on the 1st in New York (-4).
    expect(localDateInTz('2026-07-02T02:00:00.000Z', 'America/New_York')).toBe('2026-07-01');
  });

  it('falls back to the UTC date for an unset zone', () => {
    expect(localDateInTz('2026-07-01T23:30:00.000Z', 'UTC')).toBe('2026-07-01');
  });
});

describe('gmtLabel', () => {
  const summer = new Date('2026-07-01T12:00:00Z');
  it("whole-hour positive → 'GMT+2'", () => {
    expect(gmtLabel('Europe/Berlin', summer)).toBe('GMT+2');
  });
  it("negative → 'GMT-4'", () => {
    expect(gmtLabel('America/New_York', summer)).toBe('GMT-4');
  });
  it("half-hour → 'GMT+5:30'", () => {
    expect(gmtLabel('Asia/Kolkata', summer)).toBe('GMT+5:30');
  });
  it("zero offset → 'UTC'", () => {
    expect(gmtLabel('UTC', summer)).toBe('UTC');
    expect(gmtLabel('', summer)).toBe('UTC');
  });
});

// --- validateTimerMeta -----------------------------------------------------
describe('validateTimerMeta', () => {
  it('accepts empty metadata (both optional)', () => {
    expect(validateTimerMeta({})).toEqual({
      valid: true,
      value: { task: null, description: null },
    });
  });

  it('trims and normalizes present metadata', () => {
    expect(validateTimerMeta({ task: '  Coding  ', description: '  notes  ' })).toEqual({
      valid: true,
      value: { task: 'Coding', description: 'notes' },
    });
  });

  it('rejects an over-long task', () => {
    expect(validateTimerMeta({ task: 'a'.repeat(201) })).toEqual({
      valid: false,
      errors: { task: TIME_TRACKING_MESSAGES.taskTooLong },
    });
  });

  it('rejects an over-long description', () => {
    expect(validateTimerMeta({ description: 'a'.repeat(501) })).toEqual({
      valid: false,
      errors: { description: TIME_TRACKING_MESSAGES.descriptionTooLong },
    });
  });
});

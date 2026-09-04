import { describe, expect, it } from 'vitest';
import {
  bookingWindow,
  canShowNextMonth,
  canShowPreviousMonth,
  formatBookedWhen,
  formatMonthLabel,
  formatSlotTime,
  isValidTimeZone,
  isoDateInZone,
  monthMatrix,
  shiftMonth,
  zoneLabel,
  zonedTimeToUtc,
} from './hiring-time';

describe('zone arithmetic', () => {
  it('reads a wall clock in the zone it belongs to', () => {
    const instant = new Date('2026-08-26T16:00:00.000Z');

    expect(isoDateInZone(instant, 'UTC')).toBe('2026-08-26');
    expect(formatSlotTime(instant, 'Europe/Minsk')).toBe('19:00');
    expect(formatSlotTime(instant, 'America/Los_Angeles')).toBe('09:00');
    // 23:00 Minsk on the 26th is still the 26th; two hours later it is not.
    expect(isoDateInZone(new Date('2026-08-26T22:00:00.000Z'), 'Europe/Minsk')).toBe('2026-08-27');
  });

  it('resolves a wall clock back to the instant it names', () => {
    expect(zonedTimeToUtc(2026, 8, 26, 9, 0, 'UTC').toISOString()).toBe(
      '2026-08-26T09:00:00.000Z',
    );
    expect(zonedTimeToUtc(2026, 8, 26, 9, 0, 'Europe/Minsk').toISOString()).toBe(
      '2026-08-26T06:00:00.000Z',
    );
    // Summer time: Los Angeles is seven hours behind in August, eight in January.
    expect(zonedTimeToUtc(2026, 8, 26, 9, 0, 'America/Los_Angeles').toISOString()).toBe(
      '2026-08-26T16:00:00.000Z',
    );
    expect(zonedTimeToUtc(2026, 1, 26, 9, 0, 'America/Los_Angeles').toISOString()).toBe(
      '2026-01-26T17:00:00.000Z',
    );
  });

  it('rejects a zone identifier it cannot resolve', () => {
    expect(isValidTimeZone('Europe/Minsk')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus_Mons')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone(undefined)).toBe(false);
    expect(isValidTimeZone(3)).toBe(false);
  });

  it('names a zone by its offset and city', () => {
    expect(zoneLabel('Europe/Minsk', new Date('2026-08-26T12:00:00.000Z'))).toBe(
      '(UTC+03:00) Minsk',
    );
    expect(zoneLabel('America/Los_Angeles', new Date('2026-08-26T12:00:00.000Z'))).toBe(
      '(UTC-07:00) Los Angeles',
    );
    expect(zoneLabel('UTC', new Date('2026-08-26T12:00:00.000Z'))).toBe('(UTC+00:00) UTC');
  });
});

describe('bookingWindow', () => {
  /** TC-H02-UNIT-05 */
  it('clamps a day-of-month the following month does not have', () => {
    expect(bookingWindow(new Date('2026-01-31T12:00:00.000Z'), 'UTC')).toEqual({
      from: '2026-01-31',
      to: '2026-02-28',
    });
    expect(bookingWindow(new Date('2026-08-25T12:00:00.000Z'), 'UTC')).toEqual({
      from: '2026-08-25',
      to: '2026-09-25',
    });
  });

  it('crosses the year and reads “today” in the display zone', () => {
    expect(bookingWindow(new Date('2026-12-15T12:00:00.000Z'), 'UTC')).toEqual({
      from: '2026-12-15',
      to: '2027-01-15',
    });
    // 23:00 UTC is already tomorrow in Minsk, and the window starts from *their* today.
    expect(bookingWindow(new Date('2026-08-25T23:00:00.000Z'), 'Europe/Minsk').from).toBe(
      '2026-08-26',
    );
  });
});

describe('monthMatrix', () => {
  /** TC-HCAL-UNIT-01 */
  it('places days under the correct weekday, Monday first', () => {
    const august = monthMatrix(2026, 8);
    // The 1st is a Saturday: five blank cells precede it, so it sits in column six.
    expect(august[0]).toEqual([null, null, null, null, null, '2026-08-01', '2026-08-02']);

    const february = monthMatrix(2028, 2);
    const numbered = february.flat().filter(Boolean);
    expect(numbered).toHaveLength(29);
    expect(numbered.at(-1)).toBe('2028-02-29');
    expect(numbered).not.toContain('2028-02-30');

    // Leading and trailing cells carry no date at all — an adjacent month's day
    // number in the grid would be selectable-looking and out of the window.
    for (const [grid, prefix] of [
      [august, '2026-08'],
      [february, '2028-02'],
    ] as const) {
      expect(grid.every((week) => week.length === 7)).toBe(true);
      expect(grid.flat().filter((cell) => cell !== null && !cell.startsWith(prefix))).toEqual([]);
    }
  });

  it('renders whole weeks whatever the month’s shape', () => {
    for (const month of [1, 2, 5, 8, 11, 12]) {
      const grid = monthMatrix(2026, month);
      expect(grid.length).toBeGreaterThanOrEqual(4);
      expect(grid.length).toBeLessThanOrEqual(6);
    }
  });
});

describe('month navigation bounds', () => {
  /** TC-HCAL-UNIT-02 */
  it('cannot reach a month wholly in the past, or one beyond the window', () => {
    const window = bookingWindow(new Date('2026-08-25T12:00:00.000Z'), 'UTC');

    expect(canShowPreviousMonth('2026-08', window)).toBe(false);
    expect(canShowNextMonth('2026-08', window)).toBe(true);

    expect(canShowPreviousMonth('2026-09', window)).toBe(true);
    expect(canShowNextMonth('2026-09', window)).toBe(false);

    // Inside the final visible month, dates past the maximum are still out of bounds.
    expect('2026-09-26' > window.to).toBe(true);
    expect(shiftMonth('2026-09', 1)).toBe('2026-10');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('display formatting', () => {
  /** TC-HSLOT-UNIT-01 */
  it('follows the toggle rather than the data', () => {
    const afternoon = new Date('2026-08-26T14:30:00.000Z');
    const morning = new Date('2026-08-26T09:00:00.000Z');

    expect(formatSlotTime(afternoon, 'UTC')).toBe('14:30');
    expect(formatSlotTime(afternoon, 'UTC', true)).toBe('2:30 PM');
    // 24-hour zero-pads; 12-hour does not.
    expect(formatSlotTime(morning, 'UTC')).toBe('09:00');
    expect(formatSlotTime(morning, 'UTC', true)).toBe('9:00 AM');
    expect(formatSlotTime(new Date('2026-08-26T00:15:00.000Z'), 'UTC', true)).toBe('12:15 AM');
    expect(formatSlotTime(new Date('2026-08-26T12:00:00.000Z'), 'UTC', true)).toBe('12:00 PM');
  });

  it('names a month and a booked time in English, 24-hour', () => {
    expect(formatMonthLabel('2026-08')).toBe('August 2026');
    expect(formatBookedWhen(new Date('2026-08-25T11:00:00.000Z'), 'Europe/Minsk')).toBe(
      'Tuesday, 25 August 2026 at 14:00',
    );
  });
});

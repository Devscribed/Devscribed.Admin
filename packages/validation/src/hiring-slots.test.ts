import { describe, expect, it } from 'vitest';
import {
  bucketByDate,
  firstAvailableDate,
  generateSlots,
  isOfferedSlot,
  retainSelection,
  type SlotRequest,
  type WorkingHoursSpec,
} from './hiring-slots';
import { isoDateInZone } from './hiring-time';

/** Mon–Fri 09:00–17:00, the shape every mailbox in these tests reports. */
const NINE_TO_FIVE = (timeZone = 'UTC'): WorkingHoursSpec => ({
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
  timeZone,
});

/** 2026-08-26 is a Wednesday; 2026-08-29 is the Saturday that follows it. */
const WEDNESDAY = '2026-08-26';
const SATURDAY = '2026-08-29';

const request = (overrides: Partial<SlotRequest> = {}): SlotRequest => ({
  workingHours: NINE_TO_FIVE(),
  busy: [],
  durationMinutes: 60,
  from: WEDNESDAY,
  to: WEDNESDAY,
  displayTimeZone: 'UTC',
  // Well before the window, so nothing is filtered for being in the past.
  now: new Date('2026-08-01T00:00:00.000Z'),
  ...overrides,
});

const times = (slots: Date[], timeZone = 'UTC'): string[] =>
  slots.map((slot) =>
    slot.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone,
    }),
  );

describe('generateSlots', () => {
  /** TC-H02-UNIT-01 */
  it('anchors start times to the duration inside working hours', () => {
    const hourly = generateSlots(request({ durationMinutes: 60 }));
    expect(times(hourly)).toEqual([
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
      '14:00',
      '15:00',
      '16:00',
    ]);
    // The last one ends exactly at closing, never across it.
    expect(hourly.at(-1)!.toISOString()).toBe('2026-08-26T16:00:00.000Z');

    const drifting = generateSlots(request({ durationMinutes: 45 }));
    expect(times(drifting).slice(0, 3)).toEqual(['09:00', '09:45', '10:30']);
    const lastEnd = drifting.at(-1)!.getTime() + 45 * 60_000;
    expect(lastEnd).toBeLessThanOrEqual(new Date('2026-08-26T17:00:00.000Z').getTime());

    expect(generateSlots(request({ from: SATURDAY, to: SATURDAY }))).toEqual([]);
  });

  /** TC-H02-UNIT-02 */
  it('removes a slot a busy event overlaps, but not one merely adjacent to it', () => {
    const slots = times(
      generateSlots(
        request({
          busy: [
            {
              startUtc: new Date('2026-08-26T10:00:00.000Z'),
              endUtc: new Date('2026-08-26T11:00:00.000Z'),
            },
          ],
        }),
      ),
    );

    expect(slots).not.toContain('10:00');
    // 09:00 ends exactly when the event starts; 11:00 begins exactly when it ends.
    expect(slots).toContain('09:00');
    expect(slots).toContain('11:00');
  });

  /**
   * TC-H02-UNIT-03 — a `free` event never reaches this engine, because the provider
   * returns only blocking statuses. What is asserted here is the consequence: it
   * neither removes a slot nor conjures one outside working hours.
   */
  it('neither blocks nor creates availability for a non-blocking event', () => {
    const slots = times(generateSlots(request({ busy: [] })));

    expect(slots).toContain('10:00');
    expect(slots).not.toContain('19:00');
  });

  /** TC-H02-UNIT-04 */
  it('offers a slot minutes away and never one that has already started', () => {
    const slots = times(
      generateSlots(
        request({ durationMinutes: 15, now: new Date('2026-08-26T10:58:00.000Z') }),
      ),
    );

    expect(slots).toContain('11:00');
    expect(slots).not.toContain('10:45');
  });

  /** TC-H02-UNIT-06 */
  it('buckets a slot onto the display zone’s calendar date, losing none', () => {
    const slots = generateSlots(
      request({
        workingHours: NINE_TO_FIVE('America/Los_Angeles'),
        displayTimeZone: 'Europe/Minsk',
        from: '2026-08-26',
        to: '2026-08-28',
      }),
    );
    const dates = bucketByDate(slots, '2026-08-26', '2026-08-28', 'Europe/Minsk');

    // Late-afternoon Pacific lands on the following Minsk date — ten hours ahead.
    const rolled = slots.filter(
      (slot) =>
        isoDateInZone(slot, 'America/Los_Angeles') === '2026-08-26' &&
        isoDateInZone(slot, 'Europe/Minsk') === '2026-08-27',
    );
    expect(rolled.length).toBeGreaterThan(0);

    const bucketed = Object.values(dates).flat();
    expect(bucketed).toHaveLength(slots.length);
    expect(new Set(bucketed).size).toBe(slots.length);
  });

  /** TC-HSLOT-UNIT-02 */
  it('returns a flat ascending list with no entry for a busy interval', () => {
    const slots = generateSlots(
      request({
        busy: [
          {
            startUtc: new Date('2026-08-26T11:00:00.000Z'),
            endUtc: new Date('2026-08-26T14:00:00.000Z'),
          },
        ],
      }),
    );

    const ascending = [...slots].sort((a, b) => a.getTime() - b.getTime());
    expect(slots).toEqual(ascending);
    // Absent entirely — the picker has no disabled state to render.
    expect(times(slots)).toEqual(['09:00', '10:00', '14:00', '15:00', '16:00']);
  });

  it('answers nothing when working hours are unusable', () => {
    expect(generateSlots(request({ workingHours: { ...NINE_TO_FIVE(), daysOfWeek: [] } }))).toEqual(
      [],
    );
    expect(
      generateSlots(request({ workingHours: { ...NINE_TO_FIVE(), endTime: '09:00' } })),
    ).toEqual([]);
  });
});

describe('isOfferedSlot', () => {
  it('accepts an anchored start and rejects one that was never offered', () => {
    const shape = request();

    expect(isOfferedSlot(new Date('2026-08-26T10:00:00.000Z'), shape)).toBe(true);
    // Inside the day, inside working hours, off the anchor.
    expect(isOfferedSlot(new Date('2026-08-26T10:07:00.000Z'), shape)).toBe(false);
    // Outside working hours.
    expect(isOfferedSlot(new Date('2026-08-26T18:00:00.000Z'), shape)).toBe(false);
    // Outside the window.
    expect(isOfferedSlot(new Date('2026-09-30T10:00:00.000Z'), shape)).toBe(false);
    expect(isOfferedSlot(new Date('nonsense'), shape)).toBe(false);
  });

  it('ignores busy blocks — being taken is a separate question', () => {
    const taken = generateSlots(
      request({
        busy: [
          {
            startUtc: new Date('2026-08-26T10:00:00.000Z'),
            endUtc: new Date('2026-08-26T11:00:00.000Z'),
          },
        ],
      }),
    );

    expect(times(taken)).not.toContain('10:00');
    expect(isOfferedSlot(new Date('2026-08-26T10:00:00.000Z'), request())).toBe(true);
  });
});

describe('firstAvailableDate', () => {
  /** TC-HCAL-UNIT-03 */
  it('skips today and a fully booked day', () => {
    const dates = {
      // A Saturday, then the Monday that is fully booked, then the Tuesday with slots.
      '2026-08-29': [],
      '2026-08-30': [],
      '2026-08-31': [],
      '2026-09-01': ['2026-09-01T09:00:00.000Z'],
    };

    expect(firstAvailableDate(dates)).toBe('2026-09-01');
  });

  /** TC-HCAL-UNIT-04 */
  it('selects nothing when the window holds no availability', () => {
    expect(firstAvailableDate({ '2026-08-29': [], '2026-08-30': [] })).toBeNull();
    expect(firstAvailableDate({})).toBeNull();
  });
});

describe('retainSelection', () => {
  /** TC-HSLOT-UNIT-03, in the part that is not the component's own state. */
  it('keeps a slot that still exists and clears one that does not', () => {
    const slots = ['2026-08-26T09:00:00.000Z', '2026-08-26T10:00:00.000Z'];

    expect(retainSelection('2026-08-26T10:00:00.000Z', slots)).toBe('2026-08-26T10:00:00.000Z');
    // Another date's list never contains it, so choosing a date clears the time.
    expect(retainSelection('2026-08-27T10:00:00.000Z', slots)).toBeNull();
    expect(retainSelection(null, slots)).toBeNull();
  });
});

describe('bucketByDate', () => {
  it('keeps “unavailable” and “outside the window” distinguishable', () => {
    const dates = bucketByDate(
      [new Date('2026-08-26T09:00:00.000Z')],
      '2026-08-26',
      '2026-08-28',
      'UTC',
    );

    expect(Object.keys(dates)).toEqual(['2026-08-26', '2026-08-27', '2026-08-28']);
    expect(dates['2026-08-27']).toEqual([]);
    expect(dates['2026-08-29']).toBeUndefined();
  });
});

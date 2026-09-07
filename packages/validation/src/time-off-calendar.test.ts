import { describe, expect, it } from 'vitest';
import { COUNTRY_OPTIONS } from './autofill';
import {
  TIME_OFF_CALENDAR_MESSAGES,
  resolveTimeOffCalendarTimezone,
  stepTimeOffCalendarAnchor,
  stepTimeOffCalendarRange,
  timeOffCalendarAnchorFromRange,
  timeOffCalendarLatestEnd,
  timeOffCalendarRangeToday,
  timeOffCalendarToday,
  timeOffCalendarWindowRange,
  validateStatedCountryCode,
  validateTimeOffCalendarRange,
  validateTimeOffCalendarScope,
} from './time-off-calendar';

/**
 * Time off spec 01 — the range validator and the three window presets. Both are the same
 * arithmetic the endpoint and the screen run, which is why they live here and nowhere else.
 */
describe('TC-01-UNIT-02: the range rules and the window presets', () => {
  it('refuses a missing end date with the message that asks for both', () => {
    const result = validateTimeOffCalendarRange('2026-09-01', undefined);
    expect(result).toEqual({
      valid: false,
      field: 'endDate',
      error: 'Choose a start and an end date.',
    });
  });

  it('refuses an inverted range, and refuses it FIRST when it is also too wide', () => {
    expect(validateTimeOffCalendarRange('2026-09-30', '2026-09-01')).toEqual({
      valid: false,
      field: 'range',
      error: 'The end date must be on or after the start date.',
    });
    // Inverted AND 200 days apart: the first failure in the table's order is the whole
    // answer, so nothing about the width is said.
    expect(validateTimeOffCalendarRange('2026-09-30', '2026-03-01')).toEqual({
      valid: false,
      field: 'range',
      error: 'The end date must be on or after the start date.',
    });
  });

  it('refuses a 120-day range with the message that names the bound', () => {
    expect(validateTimeOffCalendarRange('2026-01-01', '2026-04-30')).toEqual({
      valid: false,
      field: 'range',
      error: 'Choose a range of 92 days or fewer.',
    });
  });

  it('accepts a month, a single day, and a 92-day span exactly', () => {
    expect(validateTimeOffCalendarRange('2026-09-01', '2026-09-30').valid).toBe(true);
    expect(validateTimeOffCalendarRange('2026-09-01', '2026-09-01').valid).toBe(true);
    // 2026-09-01 + 91 days = 2026-12-01, an inclusive span of 92.
    expect(validateTimeOffCalendarRange('2026-09-01', '2026-12-01').valid).toBe(true);
    expect(validateTimeOffCalendarRange('2026-09-01', '2026-12-02').valid).toBe(false);
  });

  it('computes each preset from the account week-start preference, anchored on a Thursday', () => {
    const anchor = '2026-09-17';
    expect(timeOffCalendarWindowRange('week', anchor, 'Monday')).toEqual({
      startDate: '2026-09-14',
      endDate: '2026-09-20',
    });
    expect(timeOffCalendarWindowRange('week', anchor, 'Sunday')).toEqual({
      startDate: '2026-09-13',
      endDate: '2026-09-19',
    });
    expect(timeOffCalendarWindowRange('2weeks', anchor, 'Monday')).toEqual({
      startDate: '2026-09-14',
      endDate: '2026-09-27',
    });
    expect(timeOffCalendarWindowRange('2weeks', anchor, 'Sunday')).toEqual({
      startDate: '2026-09-13',
      endDate: '2026-09-26',
    });
    // A month is not a week: both week starts give the whole calendar month.
    expect(timeOffCalendarWindowRange('month', anchor, 'Monday')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    expect(timeOffCalendarWindowRange('month', anchor, 'Sunday')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });

  it('steps by one preset length, and by a whole calendar month under Month', () => {
    expect(stepTimeOffCalendarAnchor('week', '2026-09-17', 1)).toBe('2026-09-24');
    expect(stepTimeOffCalendarAnchor('2weeks', '2026-09-17', -1)).toBe('2026-09-03');
    // A 31st stepped back must land in the month before, not overflow the short one.
    expect(timeOffCalendarWindowRange('month', stepTimeOffCalendarAnchor('month', '2026-10-31', -1), 'Monday')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
    expect(timeOffCalendarWindowRange('month', stepTimeOffCalendarAnchor('month', '2026-12-15', 1), 'Monday')).toEqual({
      startDate: '2027-01-01',
      endDate: '2027-01-31',
    });
  });

  it('refuses a date that is not a calendar date at all', () => {
    // REQ-01-014 refuses a value that "is not an ISO calendar date", which is a wider net
    // than "absent": a month that does not exist, a day that month does not have, a
    // free-text date, and a value that is not a string.
    for (const bad of ['2026-13-01', '2026-02-30', '2026-9-1', 'not-a-date', '2026-09-01T00:00:00Z', 12345]) {
      expect(validateTimeOffCalendarRange(bad, '2026-09-30')).toEqual({
        valid: false,
        field: 'startDate',
        error: 'Choose a start and an end date.',
      });
      expect(validateTimeOffCalendarRange('2026-09-01', bad)).toEqual({
        valid: false,
        field: 'endDate',
        error: 'Choose a start and an end date.',
      });
    }
    // A leap day the year does have is a calendar date; the same day a year later is not.
    expect(validateTimeOffCalendarRange('2028-02-29', '2028-03-01').valid).toBe(true);
    expect(validateTimeOffCalendarRange('2027-02-29', '2027-03-01').valid).toBe(false);
  });

  it('refuses an unknown scope rather than defaulting it to all', () => {
    expect(validateTimeOffCalendarScope('everyone')).toEqual({
      valid: false,
      field: 'scope',
      error: 'Choose All, Teams, or People.',
    });
    expect(validateTimeOffCalendarScope(undefined).valid).toBe(false);
    expect(validateTimeOffCalendarScope('teams')).toEqual({ valid: true, value: 'teams' });
  });

  it('carries the tabulated message text, verbatim', () => {
    expect(TIME_OFF_CALENDAR_MESSAGES.tooManyMembers).toBe(
      'This view covers more than 100 people. Narrow the scope to see the calendar.',
    );
    expect(TIME_OFF_CALENDAR_MESSAGES.emptyStateTitle).toBe('Nobody to show');
    expect(TIME_OFF_CALENDAR_MESSAGES.emptyStateBody).toBe('No active member matches this scope.');
    expect(TIME_OFF_CALENDAR_MESSAGES.orgCountryHint).toBe(
      "Members without a country of their own get this country's holidays.",
    );
    expect(TIME_OFF_CALENDAR_MESSAGES.memberCountryDefaultOption).toBe(
      "Use the organization's country",
    );
  });
});

/**
 * The write rule for the two country columns, and the reason it is not the holiday
 * validator: these columns are the input to the resolution, not a label.
 */
describe('validateStatedCountryCode — Validation Rule 9', () => {
  it('clears on empty, null and undefined', () => {
    for (const empty of [null, undefined, '', '   ']) {
      expect(validateStatedCountryCode(empty)).toEqual({ valid: true, value: null });
    }
  });

  it('accepts an assigned uppercase alpha-2 and stores what was submitted', () => {
    expect(validateStatedCountryCode('PL')).toEqual({ valid: true, value: 'PL' });
    expect(validateStatedCountryCode('BY')).toEqual({ valid: true, value: 'BY' });
  });

  it('refuses the wrong shape, and refuses XX though the shape is right', () => {
    for (const bad of ['POL', '1', 'pl', 'P', 'XX', 'YY', 'ZZ', 42, {}]) {
      expect(validateStatedCountryCode(bad)).toEqual({
        valid: false,
        error: 'Enter a valid country',
      });
    }
  });
});

/**
 * §Screens — the list the two pickers offer IS the list rule 9 accepts. Asserted here
 * rather than on a screen because it is a property of the two exports, and it is the whole
 * of what stops the pickers drifting from the write again.
 */
describe('the option list the pickers draw is the list the write accepts', () => {
  it('accepts every option COUNTRY_OPTIONS offers', () => {
    const refused = COUNTRY_OPTIONS.filter(
      (option) => !validateStatedCountryCode(option.code).valid,
    );
    expect(refused).toEqual([]);
  });

  it('does not offer the three codes the phone-derived list carries and rule 9 refuses', () => {
    for (const code of ['AC', 'TA', 'XK']) {
      expect(COUNTRY_OPTIONS.some((option) => option.code === code)).toBe(false);
      expect(validateStatedCountryCode(code).valid).toBe(false);
    }
  });
});

/**
 * REQ-01-018 — the caller's today, and the three-limbed fallback the endpoint and the
 * screen both read. One definition: a second one is how the marker and the window a reader
 * lands on drift a day apart.
 */
describe('timeOffCalendarToday / resolveTimeOffCalendarTimezone', () => {
  const instant = new Date('2026-09-30T23:00:00.000Z');

  it('answers the calendar date of the ZONE, not of the machine', () => {
    // 25 hours apart: at this instant the two are different days, which is the disagreement
    // a screen reading the browser's clock introduced.
    expect(timeOffCalendarToday('Pacific/Kiritimati', instant)).toBe('2026-10-01');
    expect(timeOffCalendarToday('Pacific/Niue', instant)).toBe('2026-09-30');
    expect(timeOffCalendarToday('UTC', instant)).toBe('2026-09-30');
  });

  it('falls back to UTC for all three limbs: absent, empty, and unrecognized', () => {
    for (const zone of [null, undefined, '', '   ', 'Mars/Olympus']) {
      expect(resolveTimeOffCalendarTimezone(zone)).toBe('UTC');
      expect(timeOffCalendarToday(zone, instant)).toBe('2026-09-30');
    }
  });

  it('answers the stated zone when the runtime can read it', () => {
    expect(resolveTimeOffCalendarTimezone('Europe/Warsaw')).toBe('Europe/Warsaw');
    expect(resolveTimeOffCalendarTimezone('Pacific/Kiritimati')).toBe('Pacific/Kiritimati');
  });
});

/**
 * Time off spec 03 — the custom Range window's arithmetic. Every rule here is one the
 * screen and the picker both run, which is why it lives beside the preset helpers rather
 * than inside the screen that draws the control.
 */
describe('time-off/03 — the custom range', () => {
  // TC-03-UNIT-11
  it('steps a custom range by its own length, in both directions, and keeps that length', () => {
    const ten = { startDate: '2026-09-14', endDate: '2026-09-23' };

    expect(stepTimeOffCalendarRange(ten, -1)).toEqual({
      startDate: '2026-09-04',
      endDate: '2026-09-13',
    });
    expect(stepTimeOffCalendarRange(ten, 1)).toEqual({
      startDate: '2026-09-24',
      endDate: '2026-10-03',
    });

    // A one-day range steps by one day, and stays one day.
    const one = { startDate: '2026-09-14', endDate: '2026-09-14' };
    expect(stepTimeOffCalendarRange(one, 1)).toEqual({
      startDate: '2026-09-15',
      endDate: '2026-09-15',
    });
    expect(stepTimeOffCalendarRange(one, -1)).toEqual({
      startDate: '2026-09-13',
      endDate: '2026-09-13',
    });
  });

  // TC-03-UNIT-12
  it('Today keeps the range length and starts it on the supplied today', () => {
    // A 10-day range that does not contain the supplied today at all.
    expect(
      timeOffCalendarRangeToday({ startDate: '2026-03-01', endDate: '2026-03-10' }, '2026-09-17'),
    ).toEqual({ startDate: '2026-09-17', endDate: '2026-09-26' });

    expect(
      timeOffCalendarRangeToday({ startDate: '2026-03-01', endDate: '2026-03-01' }, '2026-09-17'),
    ).toEqual({ startDate: '2026-09-17', endDate: '2026-09-17' });
  });

  // TC-03-UNIT-13
  it('carries the position across when the window changes between Range and a preset', () => {
    // Range → a preset: the preset opens on the window containing the range's start.
    const custom = { startDate: '2026-09-17', endDate: '2026-10-02' };
    const anchor = timeOffCalendarAnchorFromRange(custom);
    expect(anchor).toBe('2026-09-17');
    expect(timeOffCalendarWindowRange('month', anchor, 'Monday')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });

    // A preset → Range: the range is that preset's own current start and end, seeded from
    // the same builder the preset is drawn from — no second definition of a month.
    expect(timeOffCalendarWindowRange('month', '2026-09-17', 'Monday')).toEqual({
      startDate: '2026-09-01',
      endDate: '2026-09-30',
    });
  });

  it('bounds the pickable end at 91 days after the armed start, the bound being inclusive', () => {
    expect(timeOffCalendarLatestEnd('2026-09-01')).toBe('2026-12-01');
    // The bound is exactly the widest span the route accepts, and one day more is refused.
    expect(validateTimeOffCalendarRange('2026-09-01', timeOffCalendarLatestEnd('2026-09-01')).valid).toBe(
      true,
    );
    expect(
      validateTimeOffCalendarRange('2026-09-01', addDay(timeOffCalendarLatestEnd('2026-09-01'))).valid,
    ).toBe(false);
  });
});

/** One day later, read off the ISO string — the test's own arithmetic, not the module's. */
function addDay(iso: string): string {
  const date = new Date(`${iso}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

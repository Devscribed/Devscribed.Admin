import { describe, expect, it } from 'vitest';
import {
  TIME_OFF_CALENDAR_MESSAGES,
  stepTimeOffCalendarAnchor,
  timeOffCalendarWindowRange,
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
    expect(TIME_OFF_CALENDAR_MESSAGES.teamsRequired).toBe('Choose at least one team.');
    expect(TIME_OFF_CALENDAR_MESSAGES.peopleRequired).toBe('Choose at least one person.');
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

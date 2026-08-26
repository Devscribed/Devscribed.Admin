import { resolveCalendarConfig } from '../src/hiring/calendar/calendar.config';
import { toBusyIntervals, toWorkingHours } from '../src/hiring/calendar/graph-mapping';
import { toIana } from '../src/hiring/calendar/windows-zones';

/**
 * Unit tests by level, run by the API's own suite because what they cover is Graph's
 * shapes — the one thing that must never leave this module, and so the one thing the
 * shared unit package cannot be given.
 */
describe('Microsoft Graph mapping', () => {
  /** TC-H00-UNIT-01 */
  it('translates Windows time-zone identifiers to IANA', () => {
    expect(toIana('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(toIana('W. Europe Standard Time')).toBe('Europe/Berlin');
    expect(toIana('Belarus Standard Time')).toBe('Europe/Minsk');
    expect(toIana('UTC')).toBe('UTC');
    // Unrecognised falls back rather than throwing: a renamed zone must not take down
    // availability for every vacancy in the tenant.
    expect(toIana('Middle Earth Standard Time')).toBe('UTC');
    expect(toIana(null)).toBe('UTC');
    // A mailbox configured through a non-Windows client already answers in IANA.
    expect(toIana('Europe/Minsk')).toBe('Europe/Minsk');
  });

  /** TC-H00-UNIT-02 */
  it('keeps only blocking free/busy statuses', () => {
    const at = (hour: number) => ({
      dateTime: `2026-08-26T${String(hour).padStart(2, '0')}:00:00.0000000`,
      timeZone: 'UTC',
    });

    const intervals = toBusyIntervals({
      value: [
        {
          scheduleItems: [
            { status: 'busy', start: at(9), end: at(10) },
            { status: 'tentative', start: at(10), end: at(11) },
            { status: 'oof', start: at(11), end: at(12) },
            { status: 'free', start: at(12), end: at(13) },
            { status: 'workingElsewhere', start: at(13), end: at(14) },
          ],
        },
      ],
    });

    expect(intervals).toHaveLength(3);
    expect(intervals.map((interval) => interval.startUtc.toISOString())).toEqual([
      '2026-08-26T09:00:00.000Z',
      '2026-08-26T10:00:00.000Z',
      '2026-08-26T11:00:00.000Z',
    ]);
    // The two non-blocking items are absent, so neither can remove a slot.
    const covered = intervals.map((interval) => interval.startUtc.getUTCHours());
    expect(covered).not.toContain(12);
    expect(covered).not.toContain(13);
  });

  it('reads schedule times in the zone Graph reported them in', () => {
    const [interval] = toBusyIntervals({
      value: [
        {
          scheduleItems: [
            {
              status: 'busy',
              start: { dateTime: '2026-08-26T09:00:00.0000000', timeZone: 'Pacific Standard Time' },
              end: { dateTime: '2026-08-26T10:00:00.0000000', timeZone: 'Pacific Standard Time' },
            },
          ],
        },
      ],
    });

    // 09:00 Pacific in August is 16:00 UTC — the seven fractional digits and the
    // missing offset are both Graph's, not something `Date` would have parsed.
    expect(interval.startUtc.toISOString()).toBe('2026-08-26T16:00:00.000Z');
    expect(interval.endUtc.toISOString()).toBe('2026-08-26T17:00:00.000Z');
  });

  it('ignores a schedule item it cannot read rather than guessing at one', () => {
    const intervals = toBusyIntervals({
      value: [
        {
          scheduleItems: [
            { status: 'busy', start: { dateTime: 'not a time' }, end: { dateTime: 'nor this' } },
            {
              status: 'busy',
              start: { dateTime: '2026-08-26T10:00:00.0000000', timeZone: 'UTC' },
              end: { dateTime: '2026-08-26T09:00:00.0000000', timeZone: 'UTC' },
            },
          ],
        },
      ],
    });

    expect(intervals).toEqual([]);
    expect(toBusyIntervals({})).toEqual([]);
  });

  it('reads bookable hours from the mailbox and refuses to invent them', () => {
    expect(
      toWorkingHours({
        daysOfWeek: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        startTime: '09:00:00.0000000',
        endTime: '17:00:00.0000000',
        timeZone: { name: 'Pacific Standard Time' },
      }),
    ).toEqual({
      daysOfWeek: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
      timeZone: 'America/Los_Angeles',
    });

    // No default Monday-to-Friday: there is no working-hours setting in this product,
    // so a fallback here would be one — and would show times nobody agreed to.
    expect(() => toWorkingHours(undefined)).toThrow();
    expect(() => toWorkingHours({ daysOfWeek: ['monday'] })).toThrow();
  });
});

describe('Calendar configuration', () => {
  const base = { NODE_ENV: 'development' } as NodeJS.ProcessEnv;

  it('uses Graph when the tenant credentials are present, and the fake otherwise', () => {
    expect(resolveCalendarConfig(base).provider).toBe('fake');
    expect(
      resolveCalendarConfig({
        ...base,
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'client',
        GRAPH_CLIENT_SECRET: 'secret',
      }),
    ).toEqual({
      provider: 'graph',
      graph: { tenantId: 'tenant', clientId: 'client', clientSecret: 'secret' },
    });
  });

  it('reads an empty variable as an unset one', () => {
    // `.env.example` declares every hiring key and fills in only the local ones, so an
    // empty `CALENDAR_PROVIDER` must mean "decide for me", not "provider named ''".
    expect(
      resolveCalendarConfig({ ...base, CALENDAR_PROVIDER: '', GRAPH_TENANT_ID: '' }).provider,
    ).toBe('fake');
  });

  it('names the variable that is missing rather than starting half-configured', () => {
    expect(() =>
      resolveCalendarConfig({ ...base, GRAPH_TENANT_ID: 'tenant', CALENDAR_PROVIDER: 'graph' }),
    ).toThrow(/GRAPH_CLIENT_ID/);
    expect(() => resolveCalendarConfig({ ...base, CALENDAR_PROVIDER: 'ical' })).toThrow(
      /CALENDAR_PROVIDER/,
    );
  });

  /** The calendar half of TC-H00-INT-01's reasoning: no silent loss in production. */
  it('refuses production with the fake calendar', () => {
    expect(() => resolveCalendarConfig({ NODE_ENV: 'production' })).toThrow(/CALENDAR_PROVIDER/);
    expect(() =>
      resolveCalendarConfig({
        NODE_ENV: 'production',
        GRAPH_TENANT_ID: 'tenant',
        GRAPH_CLIENT_ID: 'client',
        GRAPH_CLIENT_SECRET: 'secret',
      }),
    ).not.toThrow();
  });
});

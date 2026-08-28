import { describe, expect, it } from 'vitest';
import {
  HIRING_MESSAGES,
  bookedDurationMinutes,
  cancelConfirmMessage,
  cancelledBadgeLabel,
  cancelledTooltip,
  currentTimeMessage,
  excludeOwnBooking,
  formatHistoryWhen,
  generateSlots,
  isLiveBooking,
  justBookedPath,
  managePath,
  movedMessage,
  planReschedule,
  scheduleEntryAriaLabel,
  scheduleEntryLabel,
  scheduleSummary,
  type BusyInterval,
  type ScheduleEntry,
  type WorkingHoursSpec,
} from './index';

const at = (iso: string): Date => new Date(iso);

const entry = (overrides: Partial<ScheduleEntry> = {}): ScheduleEntry => ({
  id: 'e1',
  type: 'booked',
  actor: 'candidate',
  actorName: 'Jane Doe',
  fromStartUtc: null,
  toStartUtc: '2026-08-21T09:00:00.000Z',
  timeZone: 'UTC',
  reason: null,
  createdAt: '2026-08-12T10:00:00.000Z',
  ...overrides,
});

describe('isLiveBooking', () => {
  const now = at('2026-08-25T11:00:00.000Z');

  it('is live while the interview is still ahead', () => {
    expect(isLiveBooking({ start: at('2026-08-25T11:00:01.000Z'), isCancelled: false }, now)).toBe(
      true,
    );
  });

  /**
   * No lead-time cutoff, on purpose. Booking has none either, so a cutoff here would
   * let a candidate take a slot ten minutes out and then be told it is too late to
   * release it — and a late cancellation is strictly better than a no-show (07 §14).
   */
  it('is live one second before the interview starts', () => {
    expect(isLiveBooking({ start: at('2026-08-25T11:00:00.001Z'), isCancelled: false }, now)).toBe(
      true,
    );
  });

  it('stops being live at the moment it starts, not a minute either side', () => {
    expect(isLiveBooking({ start: now, isCancelled: false }, now)).toBe(false);
    expect(isLiveBooking({ start: at('2026-08-25T10:59:59.999Z'), isCancelled: false }, now)).toBe(
      false,
    );
  });

  it('is not live once cancelled, however far ahead it is', () => {
    expect(isLiveBooking({ start: at('2026-12-01T09:00:00.000Z'), isCancelled: true }, now)).toBe(
      false,
    );
  });
});

describe('the cancelled badge', () => {
  it('names the candidate as "candidate", never by name', () => {
    // Their name is already the card's title, and repeating it reads as a bug.
    const label = cancelledBadgeLabel({
      actor: 'candidate',
      byName: 'Jane Doe',
      atUtc: '2026-08-20T09:00:00.000Z',
      reason: null,
    });
    expect(label).toBe('Cancelled by candidate');
    expect(label).not.toContain('Jane');
  });

  it('names a member by their first name alone — a board card is a glance', () => {
    expect(
      cancelledBadgeLabel({
        actor: 'member',
        byName: 'Pat Owner',
        atUtc: '2026-08-20T09:00:00.000Z',
        reason: null,
      }),
    ).toBe('Cancelled by Pat');
  });

  it('carries the whole fact in the tooltip: full name, date, and the reason', () => {
    expect(
      cancelledTooltip(
        {
          actor: 'member',
          byName: 'Pat Owner',
          atUtc: '2026-08-20T09:00:00.000Z',
          reason: 'Role filled internally.',
        },
        'UTC',
      ),
    ).toBe('Cancelled by Pat Owner on 20 Aug — Role filled internally.');
  });

  it('omits the dash when no reason was given', () => {
    expect(
      cancelledTooltip(
        { actor: 'candidate', byName: 'Jane Doe', atUtc: '2026-08-20T09:00:00.000Z', reason: null },
        'UTC',
      ),
    ).toBe('Cancelled by Jane Doe on 20 Aug');
  });

  it('falls back to the bare word when nothing recorded the cancellation', () => {
    expect(cancelledBadgeLabel(null)).toBe(HIRING_MESSAGES.board.cancelled);
    expect(cancelledTooltip(null, 'UTC')).toBe(HIRING_MESSAGES.board.cancelled);
  });
});

describe('the scheduling history', () => {
  const booked = entry();
  const firstMove = entry({
    id: 'e2',
    type: 'rescheduled',
    fromStartUtc: '2026-08-21T09:00:00.000Z',
    toStartUtc: '2026-08-24T11:00:00.000Z',
    createdAt: '2026-08-19T10:00:00.000Z',
  });
  const secondMove = entry({
    id: 'e3',
    type: 'rescheduled',
    actor: 'member',
    actorName: 'Pat Owner',
    fromStartUtc: '2026-08-24T11:00:00.000Z',
    toStartUtc: '2026-08-25T14:00:00.000Z',
    createdAt: '2026-08-22T10:00:00.000Z',
  });

  it('summarises a booking that never moved', () => {
    expect(scheduleSummary([booked], 'UTC')).toBe('Booked 12 Aug');
  });

  it('counts one move and many, so the card stays one line either way', () => {
    expect(scheduleSummary([firstMove, booked], 'UTC')).toBe('Rescheduled once · booked 12 Aug');
    expect(scheduleSummary([secondMove, firstMove, booked], 'UTC')).toBe(
      'Rescheduled 2 times · booked 12 Aug',
    );
  });

  it('reads a move as new ← old', () => {
    expect(scheduleEntryLabel(firstMove)).toBe('24 Aug 11:00 ← 21 Aug 09:00');
    expect(scheduleEntryLabel(booked)).toBe('Booked 21 Aug 09:00');
    expect(scheduleEntryLabel(entry({ type: 'cancelled', toStartUtc: null }))).toBe('Cancelled');
  });

  it('spells the arrow out for a screen reader, and attributes both ways', () => {
    expect(scheduleEntryAriaLabel(firstMove, 'UTC')).toBe(
      '24 Aug 11:00, moved from 21 Aug 09:00, by Jane Doe, 19 Aug',
    );
    // "The team moved this" is as much a fact as "the candidate did" (07 §11.55).
    expect(scheduleEntryAriaLabel(secondMove, 'UTC')).toContain('by Pat Owner');
  });

  it('reads each entry in the zone the acting party was working in', () => {
    // The times are absolute; the zone is only ever a lens on them.
    expect(formatHistoryWhen(at('2026-08-25T11:00:00.000Z'), 'Europe/Minsk')).toBe('25 Aug 14:00');
    expect(formatHistoryWhen(at('2026-08-25T11:00:00.000Z'), 'UTC')).toBe('25 Aug 11:00');
  });
});

describe('cancelConfirmMessage', () => {
  it('names the interview being called off rather than gesturing at it', () => {
    expect(cancelConfirmMessage(at('2026-08-25T11:00:00.000Z'), 'Europe/Minsk')).toBe(
      "Cancel your interview on Tuesday, 25 August 2026 at 14:00? This can't be undone.",
    );
  });
});

/* ------------------------------------------------------------------ *
 * Rescheduling — 07 §02, §05, §13
 * ------------------------------------------------------------------ */

/** Mon–Fri 09:00–17:00 UTC, the same hours the integration suite's calendar reports. */
const OFFICE_HOURS: WorkingHoursSpec = {
  daysOfWeek: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
  timeZone: 'UTC',
};

/** A Tuesday, so the day itself is never the reason a slot is missing. */
const WORKING_DAY = '2026-08-25';

const slotsOn = (input: {
  durationMinutes: number;
  busy?: BusyInterval[];
}): string[] =>
  generateSlots({
    workingHours: OFFICE_HOURS,
    busy: input.busy ?? [],
    durationMinutes: input.durationMinutes,
    from: WORKING_DAY,
    to: WORKING_DAY,
    displayTimeZone: 'UTC',
    now: at('2026-08-24T00:00:00.000Z'),
  }).map((slot) => slot.toISOString().slice(11, 16));

/** TC-H07-UNIT-01 */
describe('planReschedule', () => {
  const booking = {
    start: at('2026-08-25T11:00:00.000Z'),
    end: at('2026-08-25T12:00:00.000Z'),
    timeZone: 'Europe/Minsk',
  };

  it('moves the time and offers nothing else to write', () => {
    const change = planReschedule(booking, {
      startUtc: at('2026-08-27T09:00:00.000Z'),
      timeZone: 'Europe/Minsk',
    });

    // Three keys. `status` and `position` are the hiring manager's own ordering, and a
    // candidate nudging their interview must not be able to reach them (07 §02.7).
    expect(change && Object.keys(change).sort()).toEqual(['end', 'start', 'timeZone']);
    expect(change!.start.toISOString()).toBe('2026-08-27T09:00:00.000Z');
  });

  it('leaves everything but the time byte-identical', () => {
    const application = {
      ...booking,
      status: 'maybe',
      position: 3000,
      submittedName: 'Jane Doe',
      cvKey: 'a3f2.pdf',
      note: 'Available from September.',
      interviewNotes: 'Strong on hooks.',
      conclusion: 'Worth a second round.',
      assessments: [
        { criterionId: 'c1', valueId: 'v4' },
        { criterionId: 'c2', valueId: 'v1' },
      ],
    };

    const change = planReschedule(application, {
      startUtc: at('2026-08-27T09:00:00.000Z'),
      timeZone: 'Europe/Minsk',
    });
    const moved = { ...application, ...change };

    const { start, end, timeZone, ...untouched } = moved;
    const { start: _s, end: _e, timeZone: _z, ...before } = application;
    expect(untouched).toEqual(before);
    // The assessments are the same array, not a copy that happens to match: a
    // reschedule does not rewrite them and has no reason to read them.
    expect(moved.assessments).toBe(application.assessments);
    expect(start.toISOString()).toBe('2026-08-27T09:00:00.000Z');
    expect(end.toISOString()).toBe('2026-08-27T10:00:00.000Z');
    expect(timeZone).toBe('Europe/Minsk');
  });

  it('keeps the interview the length it was booked at', () => {
    // 01's *future bookings only* rule: a vacancy re-timed to 30 minutes does not
    // shorten an interview already granted at 60 (07 §13.61).
    const change = planReschedule(booking, {
      startUtc: at('2026-08-27T09:00:00.000Z'),
      timeZone: 'UTC',
    });
    expect(bookedDurationMinutes(change!)).toBe(60);
  });

  /** TC-H07-UNIT-04 */
  it('is a no-op when the new start is the start it already has', () => {
    // Accepted, and nothing to do: no calendar call and no `rescheduled` entry, because
    // moving an interview to the time it already has is not a reschedule (rule 3).
    expect(planReschedule(booking, { startUtc: booking.start, timeZone: 'Europe/Minsk' })).toBeNull();
    // Not even when the candidate is reading the page from a different zone. Looking at
    // an interview from an airport has not moved it.
    expect(planReschedule(booking, { startUtc: booking.start, timeZone: 'UTC' })).toBeNull();
  });

  it('moves for a difference of one millisecond, because that is a different instant', () => {
    expect(
      planReschedule(booking, { startUtc: at('2026-08-25T11:00:00.001Z'), timeZone: 'UTC' }),
    ).not.toBeNull();
  });
});

/** TC-H07-UNIT-02 */
describe('slot generation for a reschedule', () => {
  it("uses the application's own duration, never the vacancy's current one", () => {
    // Booked at 60; the vacancy has since been changed to 30. The interview keeps the
    // length it was booked at, so the grid is generated from `end - start`.
    const application = {
      start: at('2026-08-25T11:00:00.000Z'),
      end: at('2026-08-25T12:00:00.000Z'),
    };
    expect(bookedDurationMinutes(application)).toBe(60);

    expect(slotsOn({ durationMinutes: bookedDurationMinutes(application) })).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    ]);
    // What the vacancy's 30 would have produced, and what the candidate must not see.
    expect(slotsOn({ durationMinutes: 30 })).toHaveLength(16);
  });
});

/** TC-H07-UNIT-03 */
describe('excludeOwnBooking', () => {
  const own: BusyInterval = {
    startUtc: at('2026-08-25T14:00:00.000Z'),
    endUtc: at('2026-08-25T15:00:00.000Z'),
  };

  it('does not let an interview block its own reschedule', () => {
    // The only busy block is this application's own event. Every slot is offered —
    // including 14:00, the one it currently occupies — because a candidate moving
    // thirty minutes later must not collide with themselves (07 §05.25).
    expect(slotsOn({ durationMinutes: 60, busy: excludeOwnBooking([own], own) })).toEqual([
      '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00',
    ]);
  });

  it('is what stands between a short move and a collision with itself', () => {
    // Without the exclusion the interview blocks the whole hour around itself.
    expect(slotsOn({ durationMinutes: 60, busy: [own] })).not.toContain('14:00');
  });

  it('keeps every block that is not the interview itself', () => {
    const someoneElse: BusyInterval = {
      startUtc: at('2026-08-25T10:00:00.000Z'),
      endUtc: at('2026-08-25T11:00:00.000Z'),
    };
    // An adjoining meeting, and one that merely starts at the same time: neither is
    // this interview, and both still remove their slot.
    const overlapping: BusyInterval = {
      startUtc: at('2026-08-25T14:00:00.000Z'),
      endUtc: at('2026-08-25T16:00:00.000Z'),
    };

    expect(excludeOwnBooking([someoneElse, own, overlapping], own)).toEqual([
      someoneElse,
      overlapping,
    ]);
  });
});

describe('currentTimeMessage', () => {
  it('states the time they came to change rather than pre-selecting it', () => {
    // Pre-selecting it would make the candidate's first click a deselection (07 design).
    expect(currentTimeMessage(at('2026-08-25T11:00:00.000Z'), 'Europe/Minsk')).toBe(
      'Currently Tuesday, 25 August 2026 at 14:00',
    );
  });
});

/* ------------------------------------------------------------------ *
 * Landing here from a booking — 07 §04.16a
 * ------------------------------------------------------------------ */

describe('the just-booked landing', () => {
  it('is the manage link with a bare flag on it', () => {
    // Bare on purpose: the notice needs the candidate's email and the page already has
    // it from the record it fetched, so nothing about the booking is in the URL.
    expect(justBookedPath('senior-react-engineer-a1b2', 'tok')).toBe(
      '/manage/senior-react-engineer-a1b2/tok?booked=1',
    );
  });

  it("differs from the invite's link only by that flag", () => {
    const [path, query] = justBookedPath('slug', 'tok').split('?');
    // The page strips the query on its first paint, so the two converge on the URL the
    // candidate is left holding.
    expect(path).toBe(managePath('slug', 'tok'));
    expect(query).toBe('booked=1');
  });

  it('promises the invite without naming who it is going to', () => {
    // The page names nobody, and the address is not in the response it reads
    // (07 §04.21) — so the notice states the fact and stops there.
    expect(HIRING_MESSAGES.manage.justBooked).toBe(
      'A calendar invite is on its way to the address you gave.',
    );
    expect(HIRING_MESSAGES.manage.justBooked).not.toContain('@');
  });
});

/* ------------------------------------------------------------------ *
 * The receipt for a move — 07 §05.27
 * ------------------------------------------------------------------ */

describe('the just-moved notice', () => {
  it('states the update without restating the card beneath it', () => {
    expect(HIRING_MESSAGES.manage.justMoved).toBe(
      'Your interview has been moved. An updated calendar invite is on its way.',
    );
    // The new time is on the card two lines below; a notice repeating it would read as
    // two things having happened.
    expect(HIRING_MESSAGES.manage.justMoved).not.toMatch(/\d/);
  });

  it('names the new time for the polite region, which has no card to lean on', () => {
    expect(movedMessage(at('2026-08-25T11:00:00.000Z'), 'Europe/Minsk')).toBe(
      'Your interview has been moved to Tuesday, 25 August 2026 at 14:00.',
    );
  });
});

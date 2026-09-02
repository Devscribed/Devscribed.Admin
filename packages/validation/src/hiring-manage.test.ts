import { describe, expect, it } from 'vitest';
import {
  CANCELLATION_NOTICE,
  HIRING_MESSAGES,
  MANAGE_LIMITS,
  bookedDurationMinutes,
  cancelConfirmMessage,
  cancelNoticeComment,
  cancelledBadgeLabel,
  cancelledTooltip,
  currentTimeMessage,
  excludeOwnBooking,
  mergeTimeline,
  formatHistoryWhen,
  generateSlots,
  interviewMovedToast,
  isLiveBooking,
  justBookedPath,
  managePath,
  movedMessage,
  planReschedule,
  scheduleEntryAriaLabel,
  scheduleEntryLabel,
  scheduleSummary,
  teamCancelConfirmMessage,
  validateCancelReason,
  type BusyInterval,
  type CvVersion,
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

/**
 * The card's history has two sources and one list (07 §11.52). CV versions are not
 * events — a filename, a size and a content type have no place in an event row — so the
 * two are stored apart and merged where they are rendered.
 */
describe('the merged timeline', () => {
  const application = { submittedName: 'Jane Doe', timeZone: 'UTC' };

  const version = (overrides: Partial<CvVersion> = {}): CvVersion => ({
    id: 'v1',
    fileName: 'jane-doe-cv.pdf',
    sizeBytes: 1024,
    uploadedAt: '2026-08-12T10:00:00.000Z',
    ...overrides,
  });

  const booked = entry({ id: 'booked', createdAt: '2026-08-12T10:00:00.000Z' });

  /**
   * Every booking stores a CV, so the first version is the one the booking carried —
   * which the `booked` entry already accounts for. Rendering it again would tell the
   * team a candidate swapped a document they had only ever submitted once.
   */
  it('does not read the original CV as a replacement', () => {
    const merged = mergeTimeline([booked], [version()], application);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('booked');
  });

  it('reads every version after the first as one', () => {
    const merged = mergeTimeline(
      [booked],
      [
        version({ id: 'v1', uploadedAt: '2026-08-12T10:00:00.000Z' }),
        version({ id: 'v2', fileName: 'corrected.docx', uploadedAt: '2026-08-14T09:00:00.000Z' }),
        version({ id: 'v3', fileName: 'final.pdf', uploadedAt: '2026-08-15T09:00:00.000Z' }),
      ],
      application,
    );

    expect(merged.map((row) => row.id)).toEqual(['v3', 'v2', 'booked']);
  });

  /** The card expands newest-first, whichever source a row came from (07 §11.54). */
  it('interleaves the two sources by when each happened', () => {
    const moved = entry({
      id: 'moved',
      type: 'rescheduled',
      fromStartUtc: '2026-08-25T11:00:00.000Z',
      toStartUtc: '2026-08-27T11:00:00.000Z',
      createdAt: '2026-08-13T09:00:00.000Z',
    });

    const merged = mergeTimeline(
      [moved, booked],
      [
        version({ id: 'v1', uploadedAt: '2026-08-12T10:00:00.000Z' }),
        version({ id: 'v2', uploadedAt: '2026-08-12T18:00:00.000Z' }),
      ],
      application,
    );

    expect(merged.map((row) => row.id)).toEqual(['moved', 'v2', 'booked']);
  });

  /**
   * Internal members cannot replace or delete a CV, from any surface (07 §07.37), so a
   * replacement is the candidate's by construction rather than by lookup.
   */
  it('attributes every replacement to the candidate, by the name they submitted', () => {
    const [replacement] = mergeTimeline(
      [],
      [version({ id: 'v1' }), version({ id: 'v2', uploadedAt: '2026-08-14T09:00:00.000Z' })],
      application,
    );

    expect(replacement).toMatchObject({ actor: 'candidate', actorName: 'Jane Doe' });
  });

  it('names the file it replaced with, which no candidate-facing surface does', () => {
    const [replacement] = mergeTimeline(
      [],
      [
        version({ id: 'v1' }),
        version({ id: 'v2', fileName: 'corrected.docx', uploadedAt: '2026-08-14T09:00:00.000Z' }),
      ],
      application,
    );

    expect(scheduleEntryLabel(replacement)).toBe('CV replaced · corrected.docx');
    expect(scheduleEntryAriaLabel(replacement, 'UTC')).toBe(
      'CV replaced, corrected.docx, by Jane Doe, 14 Aug',
    );
  });

  /**
   * The summary counts moves and nothing else (07 design, Copy). A replacement is on the
   * expanded list, but a candidate correcting a typo has not rescheduled anything.
   */
  it('leaves the collapsed summary counting reschedules alone', () => {
    const merged = mergeTimeline(
      [booked],
      [version({ id: 'v1' }), version({ id: 'v2', uploadedAt: '2026-08-14T09:00:00.000Z' })],
      application,
    );

    expect(scheduleSummary(merged, 'UTC')).toBe('Booked 12 Aug');
  });

  it('is the log alone when no CV was ever replaced', () => {
    expect(mergeTimeline([booked], [], application)).toEqual([booked]);
  });

  /** An application booked before the CV table existed and whose file was lost. */
  it('is the log alone when there is no version at all', () => {
    expect(mergeTimeline([booked], [], application).map((row) => row.type)).toEqual(['booked']);
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

/* ------------------------------------------------------------------ *
 * The team's half — 07 §08–§10
 * ------------------------------------------------------------------ */

describe("the team's cancel confirmation", () => {
  it('names the candidate, the interview, and what confirming does', () => {
    // A member reaching this from the candidate list was looking at a page of several
    // people, and the row they pressed is no longer on screen once the dialog is.
    //
    // The two sentences after it are the team's alone: pressing this sends mail somebody
    // else reads, and the fear that stops a member — that cancelling takes the record of
    // the interview with it — is the one `isCancelled` being a flag already answers.
    expect(
      teamCancelConfirmMessage('Jane Doe', at('2026-08-25T11:00:00.000Z'), 'Europe/Minsk'),
    ).toBe(
      "Cancel Jane Doe's interview on Tuesday, 25 August 2026 at 14:00? " +
        'The candidate is notified by Microsoft. Notes and conclusion are kept.',
    );
  });

  it("states the same interview as the candidate's, and more about it", () => {
    const start = at('2026-08-25T11:00:00.000Z');
    // Both dialogs name the same interview in the same words. What differs is who is
    // being asked: the candidate is told only that it cannot be undone, because notes
    // and a mailbox are not theirs to worry about.
    expect(teamCancelConfirmMessage('Jane Doe', start, 'UTC')).toContain(
      'on Tuesday, 25 August 2026 at 11:00?',
    );
    expect(cancelConfirmMessage(start, 'UTC')).toContain(
      'on Tuesday, 25 August 2026 at 11:00? This can\'t be undone.',
    );
    expect(cancelConfirmMessage(start, 'UTC')).not.toContain('Jane Doe');
    expect(cancelConfirmMessage(start, 'UTC')).not.toContain('Notes and conclusion');
  });
});

describe('validateCancelReason', () => {
  /**
   * Null, not an empty string. The column's emptiness is a fact the card and the badge
   * tooltip both branch on, so `reason ? … : …` must be false for a member who opened
   * the field, thought better of it, and confirmed anyway.
   */
  it('is null when nothing was given', () => {
    expect(validateCancelReason(undefined)).toEqual({ valid: true, value: null });
    expect(validateCancelReason(null)).toEqual({ valid: true, value: null });
    expect(validateCancelReason('')).toEqual({ valid: true, value: null });
    expect(validateCancelReason('   \n  ')).toEqual({ valid: true, value: null });
  });

  it('trims what it keeps', () => {
    expect(validateCancelReason('  Role filled internally.  ')).toEqual({
      valid: true,
      value: 'Role filled internally.',
    });
  });

  it('accepts exactly 500 characters and refuses 501', () => {
    expect(validateCancelReason('r'.repeat(MANAGE_LIMITS.reasonMax))).toEqual({
      valid: true,
      value: 'r'.repeat(MANAGE_LIMITS.reasonMax),
    });
    expect(validateCancelReason('r'.repeat(MANAGE_LIMITS.reasonMax + 1))).toEqual({
      valid: false,
      error: 'Please keep this under 500 characters',
    });
  });

  /** The limit is on what is stored, so the trim happens before the count. */
  it('measures the trimmed value, not the whitespace around it', () => {
    const padded = `  ${'r'.repeat(MANAGE_LIMITS.reasonMax)}  `;
    expect(validateCancelReason(padded).valid).toBe(true);
  });

  it('refuses anything that is not a string', () => {
    expect(validateCancelReason(42).valid).toBe(false);
    expect(validateCancelReason({ reason: 'x' }).valid).toBe(false);
  });
});

describe('the cancellation notice', () => {
  /**
   * The reason **replaces** the fixed string rather than being appended to it
   * (07 §10.47): "could not be completed" is correct for a booking whose write failed
   * and is poor copy for a hiring manager cancelling on purpose.
   */
  it('carries the reason verbatim when a member gave one', () => {
    expect(cancelNoticeComment('Role filled internally.')).toBe('Role filled internally.');
  });

  it('states only that the interview is off when nobody gave a reason', () => {
    expect(cancelNoticeComment(null)).toBe('This interview has been cancelled.');
    expect(cancelNoticeComment(undefined)).toBe('This interview has been cancelled.');
  });

  it("keeps the rollback's wording apart from a deliberate cancellation", () => {
    // Only a booking that failed halfway is one nobody decided on, and only there does
    // an apology belong.
    expect(CANCELLATION_NOTICE.rollback).toBe(
      'This interview could not be completed and has been cancelled.',
    );
    expect(CANCELLATION_NOTICE.none).not.toBe(CANCELLATION_NOTICE.rollback);
    expect(CANCELLATION_NOTICE.none).not.toMatch(/could not/);
  });
});

describe("the team's toasts", () => {
  it('names the time a move landed on', () => {
    expect(interviewMovedToast(at('2026-08-25T11:00:00.000Z'), 'Europe/Minsk')).toBe(
      'Interview moved to 25 Aug 2026 at 14:00',
    );
  });

  it('says nothing about who or why when an interview is called off', () => {
    // The badge and the card's history carry the attribution; a toast is a receipt.
    expect(HIRING_MESSAGES.toast.interviewCancelled).toBe('Interview cancelled');
  });
});

describe("the team's copy", () => {
  it('names the interview in a menu row, where the short label would read as "dismiss"', () => {
    // It was `Cancel` while it was a button under a section that already named the
    // interview. As a menu row among rows about a candidate, `Cancel` alone reads as
    // dismissing the menu.
    expect(HIRING_MESSAGES.manage.cancelActionTeam).toBe('Cancel interview');
    // The candidate's own page says the same thing, and always did.
    expect(HIRING_MESSAGES.manage.cancelAction).toBe('Cancel interview');
    // Its neighbour in the same menu is named the same way, for the same reason.
    expect(HIRING_MESSAGES.manage.rescheduleAction).toBe('Reschedule interview');
  });

  it('says the reason is optional in the label rather than leaving it to be discovered', () => {
    // A member who believes a reason is required will invent one.
    expect(HIRING_MESSAGES.manage.reasonLabel).toMatch(/optional/i);
  });

  it('says where the reason goes, because it leaves the building', () => {
    expect(HIRING_MESSAGES.manage.reasonPlaceholder).toBe(
      'Shared with the candidate in the cancellation notice',
    );
  });
});

/* ------------------------------------------------------------------ *
 * One rule, both parties — 07 §14.65
 * ------------------------------------------------------------------ */

describe('the team is bound by exactly the rule the candidate is', () => {
  const now = at('2026-08-25T11:00:00.000Z');

  /**
   * There is no separate internal predicate, and that is the point: the two surfaces
   * share `isLiveBooking`, so a past interview is unreachable from either side and
   * cannot become reachable from one of them by a change made to the other.
   */
  it('offers nothing on an interview that has started, whoever is asking', () => {
    const started = { start: at('2026-08-25T10:59:59.999Z'), isCancelled: false };
    expect(isLiveBooking(started, now)).toBe(false);
  });

  it('offers nothing on an interview already called off, whoever is asking', () => {
    const cancelled = { start: at('2026-12-01T09:00:00.000Z'), isCancelled: true };
    expect(isLiveBooking(cancelled, now)).toBe(false);
  });
});

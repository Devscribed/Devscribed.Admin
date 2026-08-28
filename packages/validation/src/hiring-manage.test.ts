import { describe, expect, it } from 'vitest';
import {
  HIRING_MESSAGES,
  cancelConfirmMessage,
  cancelledBadgeLabel,
  cancelledTooltip,
  formatHistoryWhen,
  isLiveBooking,
  scheduleEntryAriaLabel,
  scheduleEntryLabel,
  scheduleSummary,
  type ScheduleEntry,
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

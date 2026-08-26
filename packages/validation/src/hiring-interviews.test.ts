import { describe, expect, it } from 'vitest';
import { INTERVIEW_MESSAGES, partitionInterviews } from './index';

/**
 * My interviews (03 §06) — the two groups and the order each reads in.
 *
 * The split is the only rule the screen has, and it is shared with the API rather than
 * written twice: the server groups and the page renders, and the two disagreeing about
 * which interview is "next" is exactly the bug that sharing prevents.
 */

const MINUTE = 60_000;
const NOW = new Date('2026-08-26T12:00:00.000Z');

/** One interview, described by how many minutes from `NOW` it starts. */
const at = (id: string, offsetMinutes: number, durationMinutes = 60) => ({
  id,
  start: new Date(NOW.getTime() + offsetMinutes * MINUTE),
  end: new Date(NOW.getTime() + (offsetMinutes + durationMinutes) * MINUTE),
});

describe('partitionInterviews', () => {
  it('puts what is still ahead in upcoming, soonest first', () => {
    const { upcoming, past } = partitionInterviews(
      [at('thursday', 2 * 24 * 60), at('tomorrow', 24 * 60), at('later-today', 120)],
      NOW,
    );

    expect(upcoming.map((interview) => interview.id)).toEqual([
      'later-today',
      'tomorrow',
      'thursday',
    ]);
    expect(past).toEqual([]);
  });

  it('puts what has finished in past, most recent first', () => {
    const { upcoming, past } = partitionInterviews(
      [at('last-month', -30 * 24 * 60), at('yesterday', -24 * 60), at('last-week', -7 * 24 * 60)],
      NOW,
    );

    expect(past.map((interview) => interview.id)).toEqual([
      'yesterday',
      'last-week',
      'last-month',
    ]);
    expect(upcoming).toEqual([]);
  });

  /**
   * The one boundary worth stating: an interview that has started and not finished is
   * the one the interviewer is most likely to be opening a card for, so it stays at the
   * top of `UPCOMING` rather than dropping below every finished interview.
   */
  it('keeps an interview that is happening right now in upcoming', () => {
    const { upcoming, past } = partitionInterviews([at('in-progress', -10)], NOW);

    expect(upcoming.map((interview) => interview.id)).toEqual(['in-progress']);
    expect(past).toEqual([]);
  });

  it('moves an interview to past the moment it ends', () => {
    const justEnded = { id: 'just-ended', start: new Date(NOW.getTime() - 60 * MINUTE), end: NOW };

    const { upcoming, past } = partitionInterviews([justEnded], NOW);

    expect(upcoming).toEqual([]);
    expect(past.map((interview) => interview.id)).toEqual(['just-ended']);
  });

  /** Stable, so two interviews booked at the same instant do not swap between requests. */
  it('keeps the caller’s order for two interviews starting at the same instant', () => {
    const first = at('first', 60);
    const second = at('second', 60);

    expect(partitionInterviews([first, second], NOW).upcoming.map((i) => i.id)).toEqual([
      'first',
      'second',
    ]);
    expect(partitionInterviews([second, first], NOW).upcoming.map((i) => i.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('answers two empty groups for a member with no interviews at all', () => {
    expect(partitionInterviews([], NOW)).toEqual({ upcoming: [], past: [] });
  });
});

describe('INTERVIEW_MESSAGES', () => {
  /** The empty `UPCOMING` group still renders, so a quiet day is not a broken screen. */
  it('names the empty upcoming case separately from an empty screen', () => {
    expect(INTERVIEW_MESSAGES.noUpcoming).toBe('No upcoming interviews.');
    expect(INTERVIEW_MESSAGES.noneAtAll).not.toBe(INTERVIEW_MESSAGES.noUpcoming);
  });
});

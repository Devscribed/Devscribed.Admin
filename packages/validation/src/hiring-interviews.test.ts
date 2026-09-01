import { describe, expect, it } from 'vitest';
import { INTERVIEW_MESSAGES, orderCandidatesByInterview, partitionInterviews } from './index';

/**
 * My interviews (03 §06) — the two groups, the order each reads in, and the fold onto
 * people that carries both into the `Assigned to me` scope (03 §08.42).
 *
 * The split is the only rule the screen ever owned, and it is shared with the API rather
 * than written twice: the server orders and the page renders, and the two disagreeing
 * about which interview is "next" is exactly the bug that sharing prevents.
 */

const MINUTE = 60_000;
const NOW = new Date('2026-08-26T12:00:00.000Z');

/** One interview, described by how many minutes from `NOW` it starts. */
const at = (id: string, offsetMinutes: number, durationMinutes = 60) => ({
  id,
  start: new Date(NOW.getTime() + offsetMinutes * MINUTE),
  end: new Date(NOW.getTime() + (offsetMinutes + durationMinutes) * MINUTE),
});

/** The same, with the person it belongs to — one candidate may hold several. */
const forCandidate = (candidateId: string, id: string, offsetMinutes: number) => ({
  ...at(id, offsetMinutes),
  candidateId,
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

/**
 * TC-H03-UNIT-05 — the `Assigned to me` order, folded onto people.
 *
 * Two questions answered in one pass: which candidates, in which order, and which of
 * their interviews each row speaks about. They are the same answer, and these cases are
 * what pins them to each other.
 */
describe('orderCandidatesByInterview', () => {
  it('puts everyone with an interview ahead first, nearest first', () => {
    const order = orderCandidatesByInterview(
      [
        forCandidate('ivan', 'ivan-thursday', 2 * 24 * 60),
        forCandidate('jane', 'jane-tomorrow', 24 * 60),
        forCandidate('ann', 'ann-later-today', 120),
      ],
      NOW,
    );

    expect(order.map((entry) => entry.candidateId)).toEqual(['ann', 'jane', 'ivan']);
  });

  it('follows them with everyone whose interviews are behind, most recent first', () => {
    const order = orderCandidatesByInterview(
      [
        forCandidate('lastmonth', 'a', -30 * 24 * 60),
        forCandidate('tomorrow', 'b', 24 * 60),
        forCandidate('yesterday', 'c', -24 * 60),
      ],
      NOW,
    );

    expect(order.map((entry) => entry.candidateId)).toEqual([
      'tomorrow',
      'yesterday',
      'lastmonth',
    ]);
  });

  /**
   * The rule that makes the row and the order one fact rather than two: whatever placed
   * the candidate is what the row says. A person seen last month and again on Tuesday
   * sits where Tuesday puts them, and reads Tuesday.
   */
  it('speaks about the interview that placed the candidate, never another of theirs', () => {
    const order = orderCandidatesByInterview(
      [
        forCandidate('sam', 'sam-last-month', -30 * 24 * 60),
        forCandidate('sam', 'sam-tuesday', 2 * 24 * 60),
        forCandidate('sam', 'sam-next-month', 30 * 24 * 60),
      ],
      NOW,
    );

    expect(order).toEqual([{ candidateId: 'sam', applicationId: 'sam-tuesday' }]);
  });

  it('speaks about the most recent past interview for a candidate with none ahead', () => {
    const order = orderCandidatesByInterview(
      [
        forCandidate('sam', 'sam-last-month', -30 * 24 * 60),
        forCandidate('sam', 'sam-yesterday', -24 * 60),
      ],
      NOW,
    );

    expect(order).toEqual([{ candidateId: 'sam', applicationId: 'sam-yesterday' }]);
  });

  /**
   * One person, one row — which is the whole difference between this list and the
   * screen it replaced. A candidate with three interviews ahead appears once, and the
   * two the row does not speak about do not push anybody down the list either.
   */
  it('lists a candidate once however many interviews of theirs are in the group', () => {
    const order = orderCandidatesByInterview(
      [
        forCandidate('sam', 'sam-soon', 60),
        forCandidate('sam', 'sam-later', 120),
        forCandidate('jane', 'jane-between', 90),
      ],
      NOW,
    );

    expect(order).toEqual([
      { candidateId: 'sam', applicationId: 'sam-soon' },
      { candidateId: 'jane', applicationId: 'jane-between' },
    ]);
  });

  /** Stable, so a page boundary falls in the same place on two consecutive requests. */
  it('keeps the caller’s order for two candidates booked at the same instant', () => {
    const first = forCandidate('first', 'first-application', 60);
    const second = forCandidate('second', 'second-application', 60);

    expect(orderCandidatesByInterview([first, second], NOW).map((e) => e.candidateId)).toEqual([
      'first',
      'second',
    ]);
    expect(orderCandidatesByInterview([second, first], NOW).map((e) => e.candidateId)).toEqual([
      'second',
      'first',
    ]);
  });

  it('answers an empty order for an interviewer nobody has booked with', () => {
    expect(orderCandidatesByInterview([], NOW)).toEqual([]);
  });
});

describe('INTERVIEW_MESSAGES', () => {
  /** The empty `UPCOMING` group still renders, so a quiet day is not a broken screen. */
  it('names the empty upcoming case separately from an empty screen', () => {
    expect(INTERVIEW_MESSAGES.noUpcoming).toBe('No upcoming interviews.');
    expect(INTERVIEW_MESSAGES.noneAtAll).not.toBe(INTERVIEW_MESSAGES.noUpcoming);
  });
});

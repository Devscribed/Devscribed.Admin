/**
 * My interviews — spec 03 §06.
 *
 * It was a screen once: one row per **application**, unfiltered, unpaginated, and gated
 * on **assignment rather than role**, because the candidate database beside it was
 * closed to the people it served. It exists at all because without it the candidate card
 * would be reachable from nowhere but the calendar invite (03 §06.27), and an
 * interviewer who lost that email would have lost the access with it.
 *
 * The database is open to them now, so the screen is the `Assigned to me` **scope** of
 * it (03 §08.35) — one row per **person**, with the search, filters and paging the old
 * screen never had. What survives the move is the one rule it actually owned: which
 * interviews are still ahead, and what order each group reads in (03 §06.28). Folded
 * onto people rather than applications, that is this list's order, which is why the fold
 * is here too.
 *
 * It is shared rather than written beside the query because both the sort and the row it
 * chooses come out of the same partition, and an answer that ordered by one interview
 * while speaking about another would be a bug nobody could reproduce on their own
 * machine.
 */

/** Verbatim from the Copy table of `specs/hiring/03-candidate-database.design.md`. */
export const INTERVIEW_MESSAGES = {
  title: 'My interviews',
  /** `SectionLabel` uppercases them; they are stored as written. */
  upcoming: 'Upcoming',
  past: 'Past',
  /**
   * The `UPCOMING` group renders even when it is empty, so a quiet day does not look
   * like a broken screen (03 design §My interviews).
   */
  noUpcoming: 'No upcoming interviews.',
  /** Nothing at all — no assignment has ever produced a booking. */
  noneAtAll: 'No interviews yet.',
} as const;

/**
 * One interview, as the split needs it: when it starts, and when it ends.
 *
 * The **end** is what decides the group, not the start. An interview that began ten
 * minutes ago is the one the interviewer is most likely to be opening the card for, and
 * moving it to `PAST` the instant it started would drop it below every finished
 * interview at exactly the wrong moment.
 */
export interface InterviewOccurrence {
  start: Date;
  end: Date;
}

export interface InterviewGroups<T> {
  /** Soonest first — the next one is the top row (03 §06.28). */
  upcoming: T[];
  /** Most recent first, which is the reverse and is also what "then past ones" means. */
  past: T[];
}

/**
 * The two groups the screen renders, in the order it renders them (03 §06.28).
 *
 * `sort` is stable in every runtime this ships to, so two interviews booked at the same
 * instant keep the order they arrived in — which is the caller's, by id — rather than
 * swapping between one request and the next.
 */
export function partitionInterviews<T extends InterviewOccurrence>(
  interviews: readonly T[],
  now: Date,
): InterviewGroups<T> {
  const at = now.getTime();
  const upcoming: T[] = [];
  const past: T[] = [];

  for (const interview of interviews) {
    (interview.end.getTime() > at ? upcoming : past).push(interview);
  }

  upcoming.sort((left, right) => left.start.getTime() - right.start.getTime());
  past.sort((left, right) => right.start.getTime() - left.start.getTime());

  return { upcoming, past };
}

/** One interview, as the fold needs it: whose it is, and which application it is. */
export interface CandidateInterview {
  candidateId: string;
  /** The `Application` the row draws its vacancy, date and status from. */
  applicationId: string;
}

/**
 * The same two groups, folded onto people — which is the order `Assigned to me` reads in
 * (03 §08.42), and the row each candidate is represented by while it does.
 *
 * The old screen listed interviews, so a person seen twice was two rows and each one
 * spoke for itself. This list is candidate-grain, so one of that person's interviews has
 * to speak for them, and **which one is not a separate decision from where they sit**:
 * whatever placed the row is what the row says. Sorting by the interview on Tuesday and
 * then printing last month's date beside it is the one way this screen could contradict
 * itself, and taking both from one pass is what makes that unrepresentable.
 *
 * `upcoming` is walked whole before `past` is touched, so a candidate with anything ahead
 * is placed by their nearest one and their history can no longer speak for them. Everyone
 * else follows, most recent first. Within each group the input's own order breaks a tie,
 * exactly as `partitionInterviews` leaves it.
 */
export function orderCandidatesByInterview<
  T extends InterviewOccurrence & { id: string; candidateId: string },
>(interviews: readonly T[], now: Date): CandidateInterview[] {
  const { upcoming, past } = partitionInterviews(interviews, now);

  const placed = new Set<string>();
  const order: CandidateInterview[] = [];

  for (const interview of [...upcoming, ...past]) {
    if (placed.has(interview.candidateId)) continue;
    placed.add(interview.candidateId);
    order.push({ candidateId: interview.candidateId, applicationId: interview.id });
  }

  return order;
}

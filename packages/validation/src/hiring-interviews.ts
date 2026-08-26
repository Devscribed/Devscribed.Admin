/**
 * My interviews — spec 03 §06.
 *
 * The other half of the candidate database's spec, and deliberately the opposite screen
 * in every way. The database is one row per **person**, filterable, paginated, and
 * `admin`/`manager` only. This is one row per **application**, unfiltered, unpaginated,
 * and gated on **assignment rather than role** — it is the whole of hiring for a `user`
 * who interviews.
 *
 * It exists because without it the candidate card would be reachable from nowhere but
 * the calendar invite (03 §06.27): an interviewer who lost that email would have lost
 * the access with it.
 *
 * What is here is the one rule the screen has — which interviews are still ahead, and
 * what order each group reads in. It is shared rather than written beside the query
 * because the API sorts the two groups and the page renders them, and a screen that
 * disagreed with its own response about which interview is "next" would be a bug nobody
 * could reproduce on their own machine.
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

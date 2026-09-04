/**
 * Manage booking — spec 07.
 *
 * The rules and the copy shared by the public manage page, the candidate card's
 * scheduling history and the board's cancelled badge. Three surfaces, two of them
 * candidate-facing and one of them not, all naming the same facts about one booking —
 * which is exactly the kind of agreement this package exists to make impossible to
 * break.
 *
 * Nothing here reads the database or the clock. `isLiveBooking` takes `now` because the
 * one rule that governs both actions is `start > now` (07 §14.65), and a rule that
 * consulted the clock itself could not be tested against a booking a minute either side
 * of it.
 */

// Sibling modules only, so this one is safe to read at module-eval time — `./index`
// re-exports it at the end of its own body and is not.
import { HIRING_MESSAGES } from './hiring';
import type { BusyInterval } from './hiring-slots';
import { formatBookedWhen, formatShortDate, formatSlotTime, zonedParts } from './hiring-time';

/* ------------------------------------------------------------------ *
 * The scheduling log — 07 §11
 * ------------------------------------------------------------------ */

/** Append-only, and never replayed to derive board state (07 §11.51). */
export const SCHEDULE_EVENT_TYPES = ['booked', 'rescheduled', 'cancelled'] as const;
export type ScheduleEventType = (typeof SCHEDULE_EVENT_TYPES)[number];

/** Attribution runs both ways: "the team moved this" is as much a fact (07 §11.55). */
export const SCHEDULE_ACTORS = ['candidate', 'member'] as const;
export type ScheduleActor = (typeof SCHEDULE_ACTORS)[number];

export const MANAGE_LIMITS = {
  /**
   * 128 bits, twice the slug's 72: it guards one named person's booking rather than a
   * page meant to be shared, and no rate limit stands behind it (07 §15.71).
   */
  tokenBytes: 16,
  /** Team cancellations only (07 §10.46). */
  reasonMax: 500,
} as const;

/** The URL the invite carries. The slug is what makes every dead end renderable (07 §03.13). */
export const managePath = (slug: string, token: string): string => `/manage/${slug}/${token}`;

/**
 * The flag that tells the manage page it is being arrived at straight from a booking,
 * rather than from an invite opened later (07 §04.16a).
 *
 * A bare marker, carrying nothing: the notice needs the candidate's email, and the page
 * already has it from the record it fetched. Nothing about the booking travels in the
 * query string.
 */
export const MANAGE_BOOKED_PARAM = 'booked';

/**
 * Where a completed booking lands.
 *
 * Deliberately not what the invite carries — `managePath` is that, and the page strips
 * this flag off the address bar on its first paint so the two converge immediately. What
 * the candidate is left holding is the durable link, which is the whole point of sending
 * them here rather than rendering a confirmation that a refresh would throw away.
 */
export const justBookedPath = (slug: string, token: string): string =>
  `${managePath(slug, token)}?${MANAGE_BOOKED_PARAM}=1`;

/* ------------------------------------------------------------------ *
 * Liveness — 07 §14
 * ------------------------------------------------------------------ */

export interface BookingLiveness {
  start: Date;
  isCancelled: boolean;
}

/**
 * One rule, both actions, both parties: the interview has not started and has not been
 * called off.
 *
 * There is deliberately no lead-time cutoff. Booking has none — every slot from now to
 * the end of the window is bookable — so a cutoff on cancelling would let a candidate
 * take a slot ten minutes out and then be told it is too late to release it (07 §14.66).
 * And a late cancellation is strictly better than a no-show: forbidding it does not
 * produce attendance, it produces an interviewer sitting alone (07 §14.67).
 *
 * `Vacancy.status` is not consulted. Closing a vacancy means "stop accepting new
 * applicants", not "renege on the interviews already granted" (07 §13.60).
 */
export const isLiveBooking = (booking: BookingLiveness, now: Date): boolean =>
  !booking.isCancelled && booking.start.getTime() > now.getTime();

/**
 * "Cancel your interview on Tuesday, 25 August 2026 at 14:00? This can't be undone."
 *
 * The dialog names the interview rather than gesturing at it, so a screen-reader user
 * is never asked to confirm a pronoun (07 design, Accessibility).
 */
export const cancelConfirmMessage = (start: Date, timeZone: string): string =>
  HIRING_MESSAGES.manage.cancelConfirm.replace('{when}', formatBookedWhen(start, timeZone));

/**
 * "Cancel Jane Doe's interview on Tuesday, 25 August 2026 at 14:00? This can't be
 * undone."
 *
 * The team's dialog names the **candidate** as well as the interview, which the
 * candidate's own dialog has no need to: a member reaching this from My interviews is
 * looking at a list of several people, and the row they pressed is no longer on screen
 * once the dialog is (07 design, Accessibility).
 */
export const teamCancelConfirmMessage = (
  candidateName: string,
  start: Date,
  timeZone: string,
): string =>
  HIRING_MESSAGES.manage.cancelConfirmTeam
    .replace('{name}', candidateName)
    .replace('{when}', formatBookedWhen(start, timeZone));

/** "Interview moved to 25 Aug 2026 at 14:00" — the team's receipt for a move. */
export const interviewMovedToast = (start: Date, timeZone: string): string =>
  HIRING_MESSAGES.toast.interviewRescheduled.replace(
    '{when}',
    `${formatShortDate(start, timeZone)} at ${formatSlotTime(start, timeZone)}`,
  );

/* ------------------------------------------------------------------ *
 * The team's cancellation reason — 07 §10
 * ------------------------------------------------------------------ */

export type ReasonResult =
  | { valid: true; value: string | null }
  | { valid: false; error: string };

/**
 * Optional, trimmed, at most 500 characters, and **null when it is blank**.
 *
 * Null rather than an empty string because the column's emptiness is a fact the card
 * and the badge tooltip both read: `reason ? … : …` must not be true for a member who
 * opened the field, thought better of it, and confirmed anyway.
 *
 * It is a team-only field. The candidate is never asked to justify withdrawing
 * (07 §06.29), so there is no candidate-facing path into this validator.
 */
export function validateCancelReason(input: unknown): ReasonResult {
  if (input === undefined || input === null) return { valid: true, value: null };
  if (typeof input !== 'string') return { valid: false, error: HIRING_MESSAGES.manage.reasonTooLong };

  const value = input.trim();
  if (value.length === 0) return { valid: true, value: null };
  if (value.length > MANAGE_LIMITS.reasonMax) {
    return { valid: false, error: HIRING_MESSAGES.manage.reasonTooLong };
  }
  return { valid: true, value };
}

/**
 * What Microsoft puts in the cancellation notice both parties receive.
 *
 * The reason, when a member gave one, **replaces** the fixed string outright rather than
 * being appended to it (07 §10.47) — "This interview could not be completed" is correct
 * for a booking whose database write failed and poor copy for a hiring manager cancelling
 * on purpose. The two are kept apart here rather than in the provider so that both
 * sentences are readable in one place.
 */
export const CANCELLATION_NOTICE = {
  /** No reason given: the notice states that the interview is off, and nothing more. */
  none: 'This interview has been cancelled.',
  /**
   * The compensating rollback's, and only its: a booking whose calendar event was
   * created and whose row was not. Nobody decided this, so it must not read as a
   * decision.
   */
  rollback: 'This interview could not be completed and has been cancelled.',
} as const;

/** The comment `cancelEvent` carries — the reason, or the bare statement. */
export const cancelNoticeComment = (reason: string | null | undefined): string =>
  reason ?? CANCELLATION_NOTICE.none;

/* ------------------------------------------------------------------ *
 * Rescheduling — 07 §02, §05, §13
 * ------------------------------------------------------------------ */

/** The three facts a reschedule is allowed to move, and nothing else. */
export interface BookedInterview {
  start: Date;
  end: Date;
  timeZone: string;
}

/**
 * The interview's own length, from the row rather than from the vacancy.
 *
 * `Vacancy.durationMinutes` is what the *next* booking will be, and 01's
 * *future bookings only* rule means an interview keeps the length it was booked at. A
 * slot grid generated from the vacancy's current setting would offer a candidate
 * 30-minute slots for the 60-minute interview they already hold, and the move would
 * then either shorten their interview or be rejected as never offered (07 §13.61).
 */
export const bookedDurationMinutes = (booking: { start: Date; end: Date }): number =>
  Math.round((booking.end.getTime() - booking.start.getTime()) / 60_000);

/**
 * The whole of what a reschedule writes: `start`, `end`, `timeZone`.
 *
 * Deliberately a patch rather than a row. `status` and `position` are the hiring
 * manager's own ordering — they dragged that card where it sits — and a design that
 * replaced the row would let a candidate nudging their interview by thirty minutes
 * silently re-insert their card at the top of `Scheduled`, reordering the team's board
 * from outside the building (07 §02.7).
 */
export interface RescheduleChange {
  start: Date;
  end: Date;
  timeZone: string;
}

/**
 * What to write for a move to `startUtc`, or **null when there is nothing to write**.
 *
 * Rescheduling to the time the interview already has is accepted and is a no-op: the
 * calendar is not touched and no `rescheduled` entry is written, because moving an
 * interview to the time it already has is not a reschedule (07 validation rule 3). The
 * zone rides along with a real move and is not a move of its own — a candidate reading
 * the page from an airport has not changed their interview by looking at it.
 *
 * The new `end` follows the interview's own duration, so a move never silently
 * lengthens or shortens it.
 */
export function planReschedule(
  booking: BookedInterview,
  to: { startUtc: Date; timeZone: string },
): RescheduleChange | null {
  if (to.startUtc.getTime() === booking.start.getTime()) return null;
  return {
    start: to.startUtc,
    end: new Date(to.startUtc.getTime() + bookedDurationMinutes(booking) * 60_000),
    timeZone: to.timeZone,
  };
}

/**
 * The busy list with the interview's **own** event taken out of it.
 *
 * Without this a candidate trying to move thirty minutes later collides with
 * themselves: the event they are moving is in the interviewer's calendar, so it blocks
 * its own slot and every slot near it, and the page reads as fully booked around the
 * one time the candidate is trying to leave (07 §05.25).
 *
 * Identity is the interval, because that is all a free/busy read returns — no event id
 * crosses the `CalendarProvider` boundary in that direction. An unrelated meeting
 * occupying exactly this interview's start and end would therefore be dropped too. It
 * is the interviewer's own mailbox and the interview is already in it, so a second
 * event on precisely the same boundaries is one they double-booked themselves; the
 * cost is one slot offered that the submit-time check then refuses honestly, rather
 * than a candidate who cannot move at all.
 */
export function excludeOwnBooking(
  busy: readonly BusyInterval[],
  own: BusyInterval,
): BusyInterval[] {
  return busy.filter(
    (block) =>
      !(
        block.startUtc.getTime() === own.startUtc.getTime() &&
        block.endUtc.getTime() === own.endUtc.getTime()
      ),
  );
}

/** "Currently Tuesday, 25 August 2026 at 14:00" — stated, never pre-selected. */
export const currentTimeMessage = (start: Date, timeZone: string): string =>
  HIRING_MESSAGES.manage.currentTime.replace('{when}', formatBookedWhen(start, timeZone));

/** What the polite region says once a move has landed (07 §05.27). */
export const movedMessage = (start: Date, timeZone: string): string =>
  HIRING_MESSAGES.manage.moved.replace('{when}', formatBookedWhen(start, timeZone));

/* ------------------------------------------------------------------ *
 * Cancellation, as the team reads it — 05 design, 07 design
 * ------------------------------------------------------------------ */

export interface CancellationFacts {
  actor: ScheduleActor;
  /**
   * The candidate's `submittedName`, or the acting member's full name. The board's
   * badge shows only its first word; the tooltip carries the whole of it.
   */
  byName: string;
  atUtc: string;
  /** Team cancellations only, and never on a candidate-facing surface (07 §10.48). */
  reason: string | null;
}

/**
 * `Cancelled by candidate` · `Cancelled by Pat`.
 *
 * **First name only** for a member: a board card is a glance. And "by candidate" rather
 * than the candidate's own name, because their name is already the card's title and
 * repeating it reads as a bug (05 design).
 */
export function cancelledBadgeLabel(cancellation: CancellationFacts | null): string {
  if (!cancellation) return HIRING_MESSAGES.board.cancelled;
  if (cancellation.actor === 'candidate') return HIRING_MESSAGES.manage.cancelledByCandidate;
  return `${HIRING_MESSAGES.manage.cancelledBy} ${firstWordOf(cancellation.byName)}`;
}

/**
 * The whole fact: who, when, and — for a member who gave one — why. It is also the
 * badge's accessible name, never the truncated form (05 design).
 */
export function cancelledTooltip(
  cancellation: CancellationFacts | null,
  timeZone: string,
): string {
  if (!cancellation) return HIRING_MESSAGES.board.cancelled;
  const when = formatHistoryDate(new Date(cancellation.atUtc), timeZone);
  const line = `${HIRING_MESSAGES.manage.cancelledBy} ${cancellation.byName} on ${when}`;
  return cancellation.reason ? `${line} — ${cancellation.reason}` : line;
}

/* ------------------------------------------------------------------ *
 * The scheduling history, as the card renders it — 07 §11, 07 design
 * ------------------------------------------------------------------ */

export interface ScheduleEntry {
  id: string;
  type: ScheduleEventType;
  actor: ScheduleActor;
  /** Who acted, already resolved: the submitted name, or the member's full name. */
  actorName: string;
  fromStartUtc: string | null;
  toStartUtc: string | null;
  /** The zone the acting party was working in. */
  timeZone: string;
  reason: string | null;
  createdAt: string;
}

/**
 * The one line the history shows until somebody opens it.
 *
 * A candidate who moved five times must not add five permanent rows to a section that
 * already needed collapsing (07 §11.54), so the count is stated and the sequence is
 * behind a toggle.
 */
export function scheduleSummary(entries: readonly TimelineEntry[], timeZone: string): string {
  const booked = entries.find((entry) => entry.type === 'booked');
  const moves = entries.filter((entry) => entry.type === 'rescheduled').length;
  const bookedOn = booked ? formatHistoryDate(new Date(booked.createdAt), timeZone) : null;
  const tail = bookedOn ? `booked ${bookedOn}` : 'booked';

  if (moves === 0) return capitalize(tail);
  if (moves === 1) return `Rescheduled once · ${tail}`;
  return `Rescheduled ${moves} times · ${tail}`;
}

/**
 * `25 Aug 14:00 ← 24 Aug 11:00` · `Booked 21 Aug 09:00` · `Cancelled` ·
 * `CV replaced · jane-doe-cv.docx`.
 *
 * Takes a `TimelineEntry` rather than a `ScheduleEntry`, so the one row shape the card
 * renders covers both sources the timeline merges (07 §11.52). Every `ScheduleEntry` is
 * one, which is why nothing that only holds log rows had to change.
 */
export function scheduleEntryLabel(entry: TimelineEntry): string {
  const to = entry.toStartUtc ? formatHistoryWhen(new Date(entry.toStartUtc), entry.timeZone) : '';
  switch (entry.type) {
    case 'booked':
      return `Booked ${to}`;
    case 'rescheduled':
      return `${to} ← ${
        entry.fromStartUtc
          ? formatHistoryWhen(new Date(entry.fromStartUtc), entry.timeZone)
          : ''
      }`;
    case 'cancelled':
      return 'Cancelled';
    case CV_REPLACED:
      // The filename is here and on no candidate-facing surface: the manage page states
      // that a CV is attached and never which one (07 §04.21).
      return `${HIRING_MESSAGES.manage.cvReplacedEntry} · ${entry.fileName ?? ''}`;
  }
}

/**
 * What a screen reader hears: the same facts as the row, in a sentence, because the
 * row's `←` is a layout device and reads as nothing at all.
 */
export function scheduleEntryAriaLabel(entry: TimelineEntry, timeZone: string): string {
  const on = formatHistoryDate(new Date(entry.createdAt), timeZone);
  const by = `by ${entry.actorName}`;

  if (entry.type === 'rescheduled' && entry.toStartUtc && entry.fromStartUtc) {
    const to = formatHistoryWhen(new Date(entry.toStartUtc), entry.timeZone);
    const from = formatHistoryWhen(new Date(entry.fromStartUtc), entry.timeZone);
    return `${to}, moved from ${from}, ${by}, ${on}`;
  }
  if (entry.type === 'booked' && entry.toStartUtc) {
    const to = formatHistoryWhen(new Date(entry.toStartUtc), entry.timeZone);
    return `Booked ${to}, ${by}, ${on}`;
  }
  if (entry.type === CV_REPLACED) {
    return `${HIRING_MESSAGES.manage.cvReplacedEntry}, ${entry.fileName ?? ''}, ${by}, ${on}`;
  }
  return `Cancelled, ${by}, ${on}`;
}

/* ------------------------------------------------------------------ *
 * CV versions, and the timeline that merges them in — 07 §07, §11.52
 * ------------------------------------------------------------------ */

/** One stored version of a candidate's CV, as the card reads it back. */
export interface CvVersion {
  id: string;
  fileName: string;
  /** Null on a version back-filled from a row that predates the size column. */
  sizeBytes: number | null;
  uploadedAt: string;
}

/**
 * The fourth row shape, and the one that is **not** an event.
 *
 * CV versions live in `ApplicationCv`, which carries a filename, a size and a content
 * type that have no place in an event row — so `ScheduleEventType` keeps the three
 * values the column actually stores, and this one exists only for the merged row
 * (07 §11.52). Nothing writes it anywhere.
 */
export const CV_REPLACED = 'cv_replaced';

export type TimelineEntryType = ScheduleEventType | typeof CV_REPLACED;

/**
 * One row of the card's history, from either source.
 *
 * A superset of `ScheduleEntry`, deliberately: every log row is already a timeline row,
 * so the merge adds shapes without forking the label, the aria label or the summary.
 */
export interface TimelineEntry extends Omit<ScheduleEntry, 'type'> {
  type: TimelineEntryType;
  /** The document's name — `cv_replaced` rows only, and team-only wherever it renders. */
  fileName?: string | null;
}

/**
 * The scheduling log and the CV versions, as one sequence, newest first.
 *
 * **The oldest version is not a replacement.** Every booking stores a CV, so the first
 * row in `ApplicationCv` is the document the booking carried — which the `booked` entry
 * already accounts for, and rendering it again as "CV replaced" would tell the team a
 * candidate swapped a file they had only ever submitted once. Everything after it is a
 * replacement, and each one is the candidate's: internal members cannot replace or
 * delete a CV, from any surface (07 §07.37).
 *
 * Merged here rather than on the server because the two sources are genuinely two
 * tables, and the card is the only place they are ever one list (07 §11.52).
 */
export function mergeTimeline(
  events: readonly ScheduleEntry[],
  versions: readonly CvVersion[],
  application: { submittedName: string; timeZone: string },
): TimelineEntry[] {
  const replacements = [...versions]
    .sort((a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt))
    .slice(1)
    .map((version): TimelineEntry => ({
      id: version.id,
      type: CV_REPLACED,
      actor: 'candidate',
      actorName: application.submittedName,
      fromStartUtc: null,
      toStartUtc: null,
      // The zone the booking is in. A version row records no zone of its own, and the
      // entry states no time of its own either — only the date it is stamped with,
      // which the card renders in the reader's zone like every other row's.
      timeZone: application.timeZone,
      reason: null,
      fileName: version.fileName,
      createdAt: version.uploadedAt,
    }));

  return [...events, ...replacements].sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
  );
}

/* ------------------------------------------------------------------ *
 * Formats
 * ------------------------------------------------------------------ */

/**
 * `25 Aug 14:00` — a timeline row carries four facts on one line, and the year is not
 * one of them. Distinct from the card's `formatShortWhen` for that reason alone.
 */
export function formatHistoryWhen(instant: Date, timeZone: string): string {
  return `${formatHistoryDate(instant, timeZone)} ${formatSlotTime(instant, timeZone)}`;
}

/** `25 Aug` — the same abbreviation without the time. */
export function formatHistoryDate(instant: Date, timeZone: string): string {
  const parts = zonedParts(instant, timeZone);
  return `${parts.day} ${MONTH_ABBREVIATIONS[parts.month - 1]}`;
}

const MONTH_ABBREVIATIONS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

const firstWordOf = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

const capitalize = (value: string): string => value.charAt(0).toUpperCase() + value.slice(1);

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
import { formatBookedWhen, formatSlotTime, zonedParts } from './hiring-time';

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
export function scheduleSummary(entries: readonly ScheduleEntry[], timeZone: string): string {
  const booked = entries.find((entry) => entry.type === 'booked');
  const moves = entries.filter((entry) => entry.type === 'rescheduled').length;
  const bookedOn = booked ? formatHistoryDate(new Date(booked.createdAt), timeZone) : null;
  const tail = bookedOn ? `booked ${bookedOn}` : 'booked';

  if (moves === 0) return capitalize(tail);
  if (moves === 1) return `Rescheduled once · ${tail}`;
  return `Rescheduled ${moves} times · ${tail}`;
}

/** `25 Aug 14:00 ← 24 Aug 11:00` · `Booked 21 Aug 09:00` · `Cancelled`. */
export function scheduleEntryLabel(entry: ScheduleEntry): string {
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
  }
}

/**
 * What a screen reader hears: the same facts as the row, in a sentence, because the
 * row's `←` is a layout device and reads as nothing at all.
 */
export function scheduleEntryAriaLabel(entry: ScheduleEntry, timeZone: string): string {
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
  return `Cancelled, ${by}, ${on}`;
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

/**
 * The phase-1 availability stand-in.
 *
 * Real availability is the interviewer's mailbox working hours minus their blocking
 * events, bucketed into the candidate's display zone (02 §05). That engine arrives
 * with the Graph provider. Until then this produces a flat list of fixed start times
 * so the rest of the booking path — the public route, the CV upload, the atomic write
 * and its compensation — can run end to end and be tested.
 *
 * What it already gets right, because the booking rules depend on it:
 * anchoring to the vacancy's duration, the half-open fit inside the day, no minimum
 * lead time, and never offering a start time in the past.
 */

/** Flat UTC hours, standing in for `mailboxSettings.workingHours`. */
const DAY_START_HOUR = 9;
const DAY_END_HOUR = 17;

/** Monday–Friday. Replaced by the mailbox's own `daysOfWeek` in phase 2. */
const WORKING_DAYS = [1, 2, 3, 4, 5];

/**
 * How far ahead the flat list runs. The real booking window is a calendar month
 * (02 §05.21); a month of hourly slots is unreadable as a list, and the list is what
 * the calendar control replaces.
 */
export const SLOT_HORIZON_DAYS = 7;

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/**
 * Start times for one vacancy, ascending. Slots are anchored to the duration from the
 * day's start, so a 45-minute interview drifts — `09:00, 09:45, 10:30` — and the last
 * slot of the day ends at or before the closing hour rather than crossing it.
 */
export function availableSlots(durationMinutes: number, now: Date = new Date()): Date[] {
  const slots: Date[] = [];
  const durationMs = durationMinutes * MINUTE_MS;

  for (let dayOffset = 0; dayOffset < SLOT_HORIZON_DAYS; dayOffset += 1) {
    const day = new Date(now.getTime() + dayOffset * DAY_MS);
    if (!WORKING_DAYS.includes(day.getUTCDay())) continue;

    const opens = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), DAY_START_HOUR);
    const closes = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), DAY_END_HOUR);

    for (let start = opens; start + durationMs <= closes; start += durationMs) {
      // No lead time and no buffer: a slot minutes from now is bookable, one that has
      // already started is not.
      if (start > now.getTime()) slots.push(new Date(start));
    }
  }

  return slots;
}

/**
 * A start time the page never offered is rejected rather than accommodated
 * (02 §Validation.5). Compared as instants, so a client that reformats the timestamp
 * still matches.
 */
export function isOfferedSlot(startUtc: Date, durationMinutes: number, now: Date = new Date()): boolean {
  return availableSlots(durationMinutes, now).some((slot) => slot.getTime() === startUtc.getTime());
}

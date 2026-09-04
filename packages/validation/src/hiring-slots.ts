/**
 * Availability generation — `specs/hiring/02-booking-page.md` §05 and the two control
 * specs, in one place.
 *
 * The API generates slots from the interviewer's mailbox and the booking page renders
 * what comes back, so on the face of it only the server needs this. It is shared
 * anyway because the client re-derives two of the same facts — which dates the month
 * grid may offer, and where the window ends — and a page that offers a start time the
 * server would reject is the failure this whole module exists to prevent.
 *
 * The engine is pure. It never reaches for a calendar; it is handed working hours and
 * busy blocks and answers with instants.
 */

import {
  DAY_MS,
  type IsoDate,
  datesBetween,
  isoDateInZone,
  parseIsoDate,
  weekdayOf,
  zonedTimeToUtc,
} from './hiring-time';

const MINUTE_MS = 60_000;

/** Bookable hours exactly as a mailbox reports them — never a product setting. */
export interface WorkingHoursSpec {
  /** 0 = Sunday … 6 = Saturday. */
  daysOfWeek: number[];
  /** `HH:mm`, read in `timeZone`. */
  startTime: string;
  endTime: string;
  /** IANA. Windows identifiers are translated by the provider, never seen here. */
  timeZone: string;
}

/** A half-open block `[startUtc, endUtc)` that removes any slot it overlaps. */
export interface BusyInterval {
  startUtc: Date;
  endUtc: Date;
}

export interface SlotRequest {
  workingHours: WorkingHoursSpec;
  /** Only blocking statuses. `free` and `workingElsewhere` never reach this list. */
  busy: BusyInterval[];
  durationMinutes: number;
  /** Inclusive, in `displayTimeZone` — the range the answer covers. */
  from: IsoDate;
  to: IsoDate;
  /** The candidate's zone: what bounds the range and buckets the result. */
  displayTimeZone: string;
  now: Date;
}

function minutesOf(time: string): number {
  const [hour, minute] = (time ?? '').split(':').map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return NaN;
  return hour * 60 + minute;
}

/**
 * Ascending start instants for one vacancy.
 *
 * Slots are anchored to the duration from the start of working hours, so a 45-minute
 * interview drifts — `09:00, 09:45, 10:30` — and the last one of the day ends at or
 * before the closing time rather than crossing it. That drift is deliberate: anchoring
 * keeps bookings tiling perfectly and never strands a gap too small to reuse
 * (02 §05.17).
 *
 * There is no minimum lead time and there are no buffers. A slot may begin exactly
 * when a busy block ends, and a slot two minutes from now is offered (§05.18, §05.19).
 */
export function generateSlots(request: SlotRequest): Date[] {
  const { workingHours, busy, durationMinutes, from, to, displayTimeZone, now } = request;

  const opensAt = minutesOf(workingHours.startTime);
  const closesAt = minutesOf(workingHours.endTime);
  const durationMs = durationMinutes * MINUTE_MS;
  if (Number.isNaN(opensAt) || Number.isNaN(closesAt) || closesAt <= opensAt) return [];
  if (!(durationMs > 0) || from > to) return [];

  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  // The range is a run of calendar days in the *candidate's* zone; the instants that
  // bound it are what the mailbox's own days are then compared against.
  const rangeStart = zonedTimeToUtc(start.year, start.month, start.day, 0, 0, displayTimeZone);
  const rangeEnd = zonedTimeToUtc(end.year, end.month, end.day + 1, 0, 0, displayTimeZone);

  // Every mailbox-zone day that could overlap that range. A day either side covers the
  // largest offset difference between two zones, which is 26 hours.
  const days = new Set<IsoDate>();
  for (
    let instant = rangeStart.getTime() - DAY_MS;
    instant <= rangeEnd.getTime() + DAY_MS;
    instant += DAY_MS
  ) {
    days.add(isoDateInZone(new Date(instant), workingHours.timeZone));
  }

  const blocking = busy.filter((block) => block.endUtc > block.startUtc);
  const slots: Date[] = [];

  for (const day of days) {
    if (!workingHours.daysOfWeek.includes(weekdayOf(day))) continue;

    const { year, month, day: dayOfMonth } = parseIsoDate(day);
    const opens = zonedTimeToUtc(
      year,
      month,
      dayOfMonth,
      Math.floor(opensAt / 60),
      opensAt % 60,
      workingHours.timeZone,
    ).getTime();
    const closes = zonedTimeToUtc(
      year,
      month,
      dayOfMonth,
      Math.floor(closesAt / 60),
      closesAt % 60,
      workingHours.timeZone,
    ).getTime();

    for (let slot = opens; slot + durationMs <= closes; slot += durationMs) {
      // Past, or outside the window the candidate is looking at.
      if (slot < now.getTime()) continue;
      if (slot < rangeStart.getTime() || slot >= rangeEnd.getTime()) continue;

      const slotEnd = slot + durationMs;
      // Half-open on both sides: touching is not overlapping, so a slot may begin the
      // moment an event ends and end the moment the next one starts.
      const blocked = blocking.some(
        (block) => block.startUtc.getTime() < slotEnd && slot < block.endUtc.getTime(),
      );
      if (!blocked) slots.push(new Date(slot));
    }
  }

  return slots.sort((left, right) => left.getTime() - right.getTime());
}

/**
 * Slots grouped by the calendar date they fall on **in the display zone**, with every
 * date in the range present.
 *
 * A date carrying an empty array is unavailable; a date missing from the map is
 * outside the window (02, API contract). Keeping both meanings distinct is what lets
 * the calendar grey a fully booked Tuesday without implying the month ended there.
 */
export function bucketByDate(
  slots: Date[],
  from: IsoDate,
  to: IsoDate,
  displayTimeZone: string,
): Record<IsoDate, string[]> {
  const dates: Record<IsoDate, string[]> = {};
  for (const date of datesBetween(from, to)) dates[date] = [];

  for (const slot of slots) {
    const date = isoDateInZone(slot, displayTimeZone);
    // A slot outside the range cannot appear: bucketing must never invent a date.
    if (dates[date]) dates[date].push(slot.toISOString());
  }
  return dates;
}

/**
 * Whether a start time is one the page could have offered — a working day, inside
 * working hours, on the duration anchor, within the window, and not in the past.
 *
 * Busy blocks are deliberately not consulted: this answers "was this ever offered",
 * and the live overlap is a separate question the calendar itself is asked at submit
 * time (02 §06.25.3). A start time that was never offered is rejected as taken rather
 * than accommodated (02, validation rule 5).
 */
export function isOfferedSlot(
  startUtc: Date,
  request: Omit<SlotRequest, 'busy'>,
): boolean {
  const wanted = startUtc.getTime();
  if (!Number.isFinite(wanted)) return false;
  return generateSlots({ ...request, busy: [] }).some((slot) => slot.getTime() === wanted);
}

/* ------------------------------------------------------------------ *
 * What the calendar control asks of an availability map
 * ------------------------------------------------------------------ */

export type AvailabilityDates = Record<IsoDate, string[]>;

/**
 * The earliest date with at least one bookable slot, which the calendar selects on
 * load (calendar-control §01.5). It skips today when today is fully booked, and it is
 * `null` when the whole map is empty — the control then reports the empty condition
 * rather than selecting a date it would refuse to load times for.
 */
export function firstAvailableDate(dates: AvailabilityDates): IsoDate | null {
  return (
    Object.keys(dates)
      .sort()
      .find((date) => dates[date].length > 0) ?? null
  );
}

export const hasAvailability = (dates: AvailabilityDates): boolean =>
  firstAvailableDate(dates) !== null;

/**
 * The selection that survives a change to the list.
 *
 * Choosing a date reloads the slots and a slot from the old date is not in the new
 * list, so it clears (time-slot-picker §04.20). Changing the zone re-renders the same
 * date and a slot that still exists there survives, which is why this compares the
 * absolute instant rather than the label (§05.23).
 */
export function retainSelection(selected: string | null, slots: string[]): string | null {
  if (!selected) return null;
  return slots.includes(selected) ? selected : null;
}

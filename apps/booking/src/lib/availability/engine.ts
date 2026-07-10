import { DateTime } from "luxon";

import type {
  AvailabilityParams,
  EngineWorkingHours,
  Interval,
  Weekday,
} from "@/lib/availability/types";

/** Luxon `weekday` is 1..7 (Mon..Sun); index into this to get the name. */
const WEEKDAY_NAMES: readonly Weekday[] = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
];

interface BookingWindow {
  /** Start of the earliest bookable date, in the display zone. */
  minDate: DateTime;
  /** Start of the latest bookable date, in the display zone. */
  maxDate: DateTime;
}

/**
 * The booking window: from today through the same day-of-month one calendar
 * month ahead, in the candidate's display zone. Luxon clamps an overflowing
 * day-of-month to the last day of the following month (e.g. Jan 31 → Feb 28),
 * matching the spec.
 */
export function computeBookingWindow(
  now: DateTime,
  displayZone: string,
): BookingWindow {
  const minDate = now.setZone(displayZone).startOf("day");
  const maxDate = minDate.plus({ months: 1 });
  return { minDate, maxDate };
}

interface TimeOfDay {
  hour: number;
  minute: number;
  second: number;
}

/** Parse "HH", "HH:mm", "HH:mm:ss", or "HH:mm:ss.fffffff" into components. */
function parseTimeOfDay(value: string): TimeOfDay {
  const [h, m, s] = value.split(":");
  return {
    hour: Number(h),
    minute: Number(m ?? "0"),
    second: s ? Math.trunc(Number(s)) : 0,
  };
}

function overlapsBusy(slot: Interval, busyBlocks: Interval[]): boolean {
  const start = slot.start.toMillis();
  const end = slot.end.toMillis();
  // Half-open overlap: adjacency (end === busy.start) is NOT a conflict, so
  // slots may sit back-to-back with events (no buffer, per the spec).
  return busyBlocks.some(
    (busy) => start < busy.end.toMillis() && busy.start.toMillis() < end,
  );
}

/**
 * Generate every bookable slot across the booking window, as absolute instants
 * (UTC). A slot is included when it falls on a working day, fits entirely
 * within the manager's working hours, does not overlap a busy block, does not
 * start in the past, and its date (in the display zone) is within the window.
 *
 * Slots are anchored to duration boundaries within the manager's working
 * hours; the candidate sees them converted to their display zone, where a slot
 * may land on an adjacent calendar date near day boundaries.
 */
export function generateAvailableSlots(params: AvailabilityParams): Interval[] {
  const { durationMinutes, workingHours, busyBlocks, displayZone, now } =
    params;
  const { minDate, maxDate } = computeBookingWindow(now, displayZone);
  const managerZone = workingHours.zone;
  const start = parseTimeOfDay(workingHours.startTime);
  const end = parseTimeOfDay(workingHours.endTime);
  const workdays = new Set<Weekday>(workingHours.daysOfWeek);

  // Scan manager-local days spanning the window (± a day of padding to catch
  // slots that cross a date boundary into the window in the display zone).
  const firstDay = now.setZone(managerZone).startOf("day").minus({ days: 1 });
  const lastDay = maxDate
    .endOf("day")
    .setZone(managerZone)
    .startOf("day")
    .plus({ days: 1 });

  const nowMs = now.toMillis();
  const minMs = minDate.toMillis();
  const maxMs = maxDate.toMillis();

  const slots: Interval[] = [];
  for (
    let day = firstDay;
    day.toMillis() <= lastDay.toMillis();
    day = day.plus({ days: 1 })
  ) {
    if (!workdays.has(WEEKDAY_NAMES[day.weekday - 1])) continue;

    const dayEnd = day.set({
      hour: end.hour,
      minute: end.minute,
      second: end.second,
      millisecond: 0,
    });
    const dayEndMs = dayEnd.toMillis();

    let cursor = day.set({
      hour: start.hour,
      minute: start.minute,
      second: start.second,
      millisecond: 0,
    });

    while (cursor.plus({ minutes: durationMinutes }).toMillis() <= dayEndMs) {
      const slot: Interval = {
        start: cursor.toUTC(),
        end: cursor.plus({ minutes: durationMinutes }).toUTC(),
      };
      cursor = cursor.plus({ minutes: durationMinutes });

      if (slot.start.toMillis() < nowMs) continue;
      const dateMs = slot.start.setZone(displayZone).startOf("day").toMillis();
      if (dateMs < minMs || dateMs > maxMs) continue;
      if (overlapsBusy(slot, busyBlocks)) continue;

      slots.push(slot);
    }
  }

  slots.sort((a, b) => a.start.toMillis() - b.start.toMillis());
  return slots;
}

/**
 * The set of dates (ISO `yyyy-MM-dd`, in the display zone) that have at least
 * one bookable slot — the input to the Calendar Control's Available state.
 */
export function getAvailableDates(
  slots: Interval[],
  displayZone: string,
): string[] {
  const dates = new Set<string>();
  for (const slot of slots) {
    const iso = slot.start.setZone(displayZone).toISODate();
    if (iso) dates.add(iso);
  }
  return [...dates].sort();
}

/**
 * The slots (chronological) whose start falls on `isoDate` in the display
 * zone — the input to the Time Slot Picker for a selected date.
 */
export function getSlotsForDate(
  slots: Interval[],
  displayZone: string,
  isoDate: string,
): Interval[] {
  return slots.filter(
    (slot) => slot.start.setZone(displayZone).toISODate() === isoDate,
  );
}

/** Format a slot's start time as a 24-hour `HH:mm` in the display zone. */
export function formatSlotTime(slot: Interval, displayZone: string): string {
  return slot.start.setZone(displayZone).toFormat("HH:mm");
}

export type { EngineWorkingHours };

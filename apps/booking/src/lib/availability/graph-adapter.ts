import { DateTime } from "luxon";
import type { WorkingHours } from "@microsoft/microsoft-graph-types";

import type { BusyInterval } from "@/lib/graph/availability-source";
import { windowsToIana } from "@/lib/availability/timezones";
import type {
  EngineWorkingHours,
  Interval,
  Weekday,
} from "@/lib/availability/types";

/**
 * Graph free/busy statuses that block a slot. "free" and "workingElsewhere"
 * leave a slot bookable; "busy", "tentative", and "oof" (out of office) remove
 * it.
 */
const BLOCKING_STATUSES = new Set(["busy", "tentative", "oof"]);

/**
 * Convert Graph `mailboxSettings.workingHours` into engine working hours,
 * translating the Windows zone id to IANA. Falls back to a closed (no-days)
 * schedule if Graph returns nothing.
 */
export function toEngineWorkingHours(
  workingHours: WorkingHours | undefined,
): EngineWorkingHours {
  const zoneName = workingHours?.timeZone?.name ?? "UTC";
  return {
    daysOfWeek: (workingHours?.daysOfWeek ?? []) as Weekday[],
    startTime: workingHours?.startTime ?? "00:00:00",
    endTime: workingHours?.endTime ?? "00:00:00",
    zone: windowsToIana(zoneName),
  };
}

/**
 * Convert Graph getSchedule items into busy intervals, keeping only blocking
 * statuses and parsing each item's wall-clock time in its reported zone (Graph
 * returns these in UTC, but we honor whatever zone it names).
 */
export function toBusyIntervals(items: BusyInterval[]): Interval[] {
  const intervals: Interval[] = [];
  for (const item of items) {
    if (!BLOCKING_STATUSES.has(item.status)) continue;
    const zone = item.timeZone === "UTC" ? "UTC" : windowsToIana(item.timeZone);
    const start = DateTime.fromISO(item.start, { zone });
    const end = DateTime.fromISO(item.end, { zone });
    if (start.isValid && end.isValid) {
      intervals.push({ start, end });
    }
  }
  return intervals;
}

import "server-only";

import { DateTime } from "luxon";

import { getHiringManagerEmail } from "@/lib/config";
import {
  computeBookingWindow,
  formatSlotTime,
  generateAvailableSlots,
  getAvailableDates,
  getSlotsForDate,
} from "@/lib/availability/engine";
import type {
  AvailabilityDto,
  AvailabilitySlotDto,
} from "@/lib/availability/dto";
import {
  toBusyIntervals,
  toEngineWorkingHours,
} from "@/lib/availability/graph-adapter";
import {
  getBusyIntervals,
  getWorkingHours,
} from "@/lib/graph/availability-source";

const GRAPH_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";

export interface GetAvailabilityOptions {
  durationMinutes: number;
  /** IANA zone the candidate is viewing in. */
  displayZone: string;
  /** Override "now" (for testing); defaults to the current instant. */
  now?: DateTime;
}

/**
 * Compute real-time availability for the hiring manager: read their working
 * hours + busy blocks from Microsoft Graph across the booking window, then run
 * the availability engine and shape the result for the client controls.
 */
export async function getAvailability(
  options: GetAvailabilityOptions,
): Promise<AvailabilityDto> {
  const { durationMinutes, displayZone } = options;
  const now = options.now ?? DateTime.utc();
  const mailbox = getHiringManagerEmail();

  const { minDate, maxDate } = computeBookingWindow(now, displayZone);

  const workingHours = await getWorkingHours(mailbox);

  // Fetch busy blocks across the whole window, in UTC (Graph returns UTC).
  const windowStart = DateTime.max(now, minDate).toUTC();
  const windowEnd = maxDate.endOf("day").toUTC();
  const busyItems = await getBusyIntervals(
    mailbox,
    windowStart.toFormat(GRAPH_DATETIME_FORMAT),
    windowEnd.toFormat(GRAPH_DATETIME_FORMAT),
    "UTC",
  );

  const slots = generateAvailableSlots({
    durationMinutes,
    workingHours: toEngineWorkingHours(workingHours),
    busyBlocks: toBusyIntervals(busyItems),
    displayZone,
    now,
  });

  const availableDates = getAvailableDates(slots, displayZone);
  const slotsByDate: Record<string, AvailabilitySlotDto[]> = {};
  for (const date of availableDates) {
    slotsByDate[date] = getSlotsForDate(slots, displayZone, date).map(
      (slot) => ({
        start: slot.start.toUTC().toISO() ?? "",
        label: formatSlotTime(slot, displayZone),
      }),
    );
  }

  return {
    timeZone: displayZone,
    durationMinutes,
    minDate: minDate.toISODate() ?? "",
    maxDate: maxDate.toISODate() ?? "",
    availableDates,
    slotsByDate,
  };
}

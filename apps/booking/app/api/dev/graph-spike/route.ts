import { DateTime } from "luxon";
import { NextResponse } from "next/server";

import { getHiringManagerEmail } from "@/lib/config";
import {
  formatSlotTime,
  generateAvailableSlots,
  getAvailableDates,
  getSlotsForDate,
} from "@/lib/availability/engine";
import {
  toBusyIntervals,
  toEngineWorkingHours,
} from "@/lib/availability/graph-adapter";
import { windowsToIana } from "@/lib/availability/timezones";
import {
  getBusyIntervals,
  getWorkingHours,
} from "@/lib/graph/availability-source";

export const dynamic = "force-dynamic";

/**
 * Phase 1 Graph spike — NOT a product endpoint.
 *
 * Verifies end-to-end that our app-only Graph credentials work and that we can
 * read the two inputs the availability engine will need:
 *   1. the hiring manager's working hours (mailboxSettings), and
 *   2. their busy blocks for a day (getSchedule).
 *
 * Usage (dev only):  GET /api/dev/graph-spike?date=2026-07-09
 * Disabled in production.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const date = url.searchParams.get("date") ?? isoDateToday();

  try {
    const mailbox = getHiringManagerEmail();
    const workingHours = await getWorkingHours(mailbox);
    const timeZone = workingHours?.timeZone?.name ?? "UTC";

    const busy = await getBusyIntervals(
      mailbox,
      `${date}T00:00:00`,
      `${date}T23:59:59`,
      timeZone,
    );

    // Run the Phase 2 availability engine against the real calendar data for
    // the requested day (busy is only fetched for this one day, so slots for
    // OTHER dates would appear unconstrained — we only report this date).
    const displayZone = windowsToIana(timeZone);
    const slots = generateAvailableSlots({
      durationMinutes: 30,
      workingHours: toEngineWorkingHours(workingHours),
      busyBlocks: toBusyIntervals(busy),
      displayZone,
      now: DateTime.fromISO(`${date}T00:00:00`, { zone: displayZone }),
    });

    return NextResponse.json({
      ok: true,
      mailbox,
      date,
      timeZone,
      displayZone,
      workingHours,
      busyCount: busy.length,
      busy,
      engine: {
        durationMinutes: 30,
        availableDates: getAvailableDates(slots, displayZone),
        slotsForDate: getSlotsForDate(slots, displayZone, date).map((s) =>
          formatSlotTime(s, displayZone),
        ),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}

function isoDateToday(): string {
  return new Date().toISOString().slice(0, 10);
}

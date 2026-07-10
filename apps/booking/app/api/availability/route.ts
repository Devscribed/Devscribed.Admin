import { IANAZone } from "luxon";
import { NextResponse } from "next/server";

import { getAvailability } from "@/lib/availability/service";

export const dynamic = "force-dynamic";

const ALLOWED_DURATIONS = new Set([15, 30, 60]);

/**
 * Real-time interview availability for the hiring manager.
 *
 *   GET /api/availability?duration=30&tz=America/New_York
 *
 * `duration` must be 15, 30, or 60. `tz` must be a valid IANA zone; it
 * defaults to UTC if omitted. Returns available dates + per-date slots for the
 * one-month booking window (see AvailabilityDto).
 */
export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);

  const durationMinutes = Number(url.searchParams.get("duration"));
  if (!ALLOWED_DURATIONS.has(durationMinutes)) {
    return NextResponse.json(
      { error: "invalid_duration", message: "duration must be 15, 30, or 60" },
      { status: 400 },
    );
  }

  const displayZone = url.searchParams.get("tz") ?? "UTC";
  if (!IANAZone.isValidZone(displayZone)) {
    return NextResponse.json(
      { error: "invalid_time_zone", message: `unknown time zone "${displayZone}"` },
      { status: 400 },
    );
  }

  try {
    const availability = await getAvailability({ durationMinutes, displayZone });
    return NextResponse.json(availability);
  } catch (error) {
    // The controls surface a friendly error + retry when this fails.
    console.error("availability failed", error);
    return NextResponse.json(
      { error: "availability_unavailable" },
      { status: 502 },
    );
  }
}

import { DateTime, IANAZone } from "luxon";
import { NextResponse } from "next/server";

import {
  BookingFailedError,
  SlotTakenError,
  createBooking,
} from "@/lib/bookings/booking-service";
import {
  hasErrors,
  validateCandidateFields,
} from "@/lib/bookings/validation";
import { getInterviewTypeBySlug } from "@/lib/interview-types";

export const dynamic = "force-dynamic";

/**
 * Create a booking from the candidate form (multipart/form-data with the CV).
 *
 * Fields: interview (slug), start (ISO UTC), timeZone (IANA), firstName,
 * lastName, email, note (optional), cv (file).
 *
 * 201 on success (returns manage token/URL); 400 on validation errors; 409 if
 * the slot was taken; 502 if the booking could not be completed.
 */
export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const interview = getInterviewTypeBySlug(String(form.get("interview") ?? ""));
  if (!interview) {
    return NextResponse.json({ error: "invalid_interview" }, { status: 400 });
  }

  const startUtc = String(form.get("start") ?? "");
  const timeZone = String(form.get("timeZone") ?? "");
  if (!DateTime.fromISO(startUtc, { zone: "utc" }).isValid) {
    return NextResponse.json({ error: "invalid_start" }, { status: 400 });
  }
  if (!IANAZone.isValidZone(timeZone)) {
    return NextResponse.json({ error: "invalid_time_zone" }, { status: 400 });
  }

  const firstName = String(form.get("firstName") ?? "").trim();
  const lastName = String(form.get("lastName") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const note = String(form.get("note") ?? "").trim();
  const file = form.get("cv");
  const cvFile = file instanceof File ? file : null;

  const errors = validateCandidateFields({
    firstName,
    lastName,
    email,
    cv: cvFile ? { name: cvFile.name, size: cvFile.size } : null,
  });
  if (hasErrors(errors)) {
    return NextResponse.json({ error: "validation", errors }, { status: 400 });
  }

  const data = Buffer.from(await (cvFile as File).arrayBuffer());
  const baseUrl = process.env.APP_BASE_URL ?? new URL(request.url).origin;

  try {
    const record = await createBooking({
      interview,
      startUtc,
      timeZone,
      candidate: { firstName, lastName, email, note: note || undefined },
      cv: {
        fileName: (cvFile as File).name,
        contentType: (cvFile as File).type || "application/octet-stream",
        data,
      },
      baseUrl,
    });

    return NextResponse.json(
      {
        token: record.token,
        manageUrl: `${baseUrl}/manage/${record.token}`,
        start: record.start,
        end: record.end,
        timeZone: record.timeZone,
        interview: record.interview,
        candidate: record.candidate,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof SlotTakenError) {
      return NextResponse.json({ error: "slot_taken" }, { status: 409 });
    }
    if (error instanceof BookingFailedError) {
      console.error("booking failed", error);
      return NextResponse.json({ error: "booking_failed" }, { status: 502 });
    }
    console.error("unexpected booking error", error);
    return NextResponse.json({ error: "booking_failed" }, { status: 502 });
  }
}

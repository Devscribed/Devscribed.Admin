import "server-only";

import { DateTime } from "luxon";

import { computeBookingWindow } from "@/lib/availability/engine";
import { getHiringManagerEmail } from "@/lib/config";
import { getBookingRepository } from "@/lib/bookings/repository";
import { generateBookingId, generateBookingToken } from "@/lib/bookings/token";
import type { BookingRecord, CandidateDetails } from "@/lib/bookings/types";
import { cvExtension } from "@/lib/bookings/validation";
import {
  createBookingEvent,
  deleteBookingEvent,
  isSlotFree,
} from "@/lib/graph/event-service";
import { getCvStorage } from "@/lib/storage/cv-storage";
import type { InterviewType } from "@/lib/interview-types";

/** The chosen slot was taken between selection and booking. */
export class SlotTakenError extends Error {
  constructor() {
    super("The selected time is no longer available.");
    this.name = "SlotTakenError";
  }
}

/** A required booking step failed; no partial booking is left behind. */
export class BookingFailedError extends Error {
  constructor(message = "The booking could not be completed.") {
    super(message);
    this.name = "BookingFailedError";
  }
}

export interface CreateBookingInput {
  interview: InterviewType;
  /** Chosen slot start, ISO 8601 UTC. */
  startUtc: string;
  /** IANA zone the candidate booked in. */
  timeZone: string;
  candidate: CandidateDetails;
  cv: { fileName: string; contentType: string; data: Buffer };
  /** Absolute base URL for building the Manage link. */
  baseUrl: string;
}

/**
 * Create a booking atomically: re-validate the slot, store the CV, create the
 * MS 365 event (which emails both parties with the CV attached), then persist
 * the record. If any step fails, previously-completed steps are compensated so
 * no partial booking, event, or record remains.
 */
export async function createBooking(
  input: CreateBookingInput,
): Promise<BookingRecord> {
  const mailbox = getHiringManagerEmail();
  const now = DateTime.utc();
  const start = DateTime.fromISO(input.startUtc, { zone: "utc" });
  if (!start.isValid) throw new BookingFailedError("Invalid start time.");

  // Reject past or out-of-window starts (stale/forged submissions).
  const { maxDate } = computeBookingWindow(now, input.timeZone);
  const startDate = start.setZone(input.timeZone).startOf("day");
  if (start.toMillis() <= now.toMillis() || startDate.toMillis() > maxDate.toMillis()) {
    throw new SlotTakenError();
  }

  const end = start.plus({ minutes: input.interview.durationMinutes });
  const startUtc = start.toUTC().toISO() ?? input.startUtc;
  const endUtc = end.toUTC().toISO() ?? "";

  // 1. Re-validate against the live calendar to prevent double-booking.
  if (!(await isSlotFree(mailbox, startUtc, endUtc))) {
    throw new SlotTakenError();
  }

  const id = generateBookingId();
  const token = generateBookingToken();
  const storageKey = `${id}${cvExtension(input.cv.fileName)}`;
  const storage = getCvStorage();

  let cvSaved = false;
  let eventId: string | null = null;
  try {
    // 2. Persist the CV.
    await storage.save(storageKey, input.cv.data, input.cv.contentType);
    cvSaved = true;

    // 3. Create the calendar event (sends invite emails with the CV attached).
    const manageUrl = `${input.baseUrl}/manage/${token}`;
    eventId = await createBookingEvent({
      mailbox,
      candidate: input.candidate,
      interviewName: input.interview.name,
      startUtc,
      endUtc,
      timeZone: input.timeZone,
      manageUrl,
      cv: {
        fileName: input.cv.fileName,
        contentType: input.cv.contentType,
        data: input.cv.data,
      },
    });

    // 4. Persist the booking record.
    const nowIso = now.toISO() ?? "";
    const record: BookingRecord = {
      id,
      token,
      status: "confirmed",
      interview: {
        slug: input.interview.slug,
        name: input.interview.name,
        durationMinutes: input.interview.durationMinutes,
      },
      start: startUtc,
      end: endUtc,
      timeZone: input.timeZone,
      candidate: input.candidate,
      cv: {
        fileName: input.cv.fileName,
        storageKey,
        contentType: input.cv.contentType,
        size: input.cv.data.length,
      },
      graphEventId: eventId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    await getBookingRepository().create(record);
    return record;
  } catch (error) {
    // Compensate in reverse order; swallow cleanup errors.
    if (eventId) {
      await deleteBookingEvent(mailbox, eventId).catch(() => undefined);
    }
    if (cvSaved) {
      await storage.delete(storageKey).catch(() => undefined);
    }
    if (error instanceof SlotTakenError) throw error;
    throw new BookingFailedError(
      error instanceof Error ? error.message : undefined,
    );
  }
}

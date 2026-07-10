import "server-only";

import { DateTime } from "luxon";

import { toBusyIntervals } from "@/lib/availability/graph-adapter";
import type { CandidateDetails } from "@/lib/bookings/types";
import { getGraphClient } from "@/lib/graph/client";
import { getBusyIntervals } from "@/lib/graph/availability-source";

const GRAPH_DATETIME_FORMAT = "yyyy-MM-dd'T'HH:mm:ss";
/** Event attachments up to 3 MB can be created inline; larger need a session. */
const INLINE_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

export interface CvPayload {
  fileName: string;
  contentType: string;
  data: Buffer;
}

export interface CreateBookingEventParams {
  mailbox: string;
  candidate: CandidateDetails;
  interviewName: string;
  /** Absolute start/end, ISO 8601 UTC. */
  startUtc: string;
  endUtc: string;
  /** IANA zone the candidate booked in (for human-readable body text). */
  timeZone: string;
  /** Absolute URL of the Manage Booking page for this booking. */
  manageUrl: string;
  cv: CvPayload;
}

/**
 * Whether the [startUtc, endUtc) window is still free on the hiring manager's
 * calendar — used to re-validate a slot at booking time to prevent
 * double-booking. Half-open overlap (back-to-back is allowed).
 */
export async function isSlotFree(
  mailbox: string,
  startUtc: string,
  endUtc: string,
): Promise<boolean> {
  const start = DateTime.fromISO(startUtc, { zone: "utc" });
  const end = DateTime.fromISO(endUtc, { zone: "utc" });
  const items = await getBusyIntervals(
    mailbox,
    start.toFormat(GRAPH_DATETIME_FORMAT),
    end.toFormat(GRAPH_DATETIME_FORMAT),
    "UTC",
  );
  const busy = toBusyIntervals(items);
  const s = start.toMillis();
  const e = end.toMillis();
  return !busy.some((b) => s < b.end.toMillis() && b.start.toMillis() < e);
}

function buildEventBody(params: CreateBookingEventParams): string {
  const { candidate, interviewName, startUtc, timeZone, manageUrl } = params;
  const when = DateTime.fromISO(startUtc, { zone: "utc" })
    .setZone(timeZone)
    .toFormat("cccc, LLLL d, yyyy 'at' HH:mm");
  const noteLine = candidate.note
    ? `<p><strong>Note:</strong> ${escapeHtml(candidate.note)}</p>`
    : "";
  return [
    `<p><strong>${escapeHtml(interviewName)}</strong></p>`,
    `<p><strong>When:</strong> ${when} (${escapeHtml(timeZone)})</p>`,
    `<p><strong>Candidate:</strong> ${escapeHtml(candidate.firstName)} ${escapeHtml(
      candidate.lastName,
    )} &lt;${escapeHtml(candidate.email)}&gt;</p>`,
    noteLine,
    `<p>Manage this interview (reschedule or cancel): <a href="${manageUrl}">${manageUrl}</a></p>`,
  ].join("");
}

/**
 * Create the interview event in the hiring manager's calendar with the
 * candidate as attendee (Graph sends the invite emails), then attach the CV.
 * Returns the created event id.
 *
 * Graph ignores an inline `attachments` array on event creation, so the CV is
 * always added via the attachments endpoint after the event exists — inline
 * for small files, via an upload session for larger ones.
 */
export async function createBookingEvent(
  params: CreateBookingEventParams,
): Promise<string> {
  const { mailbox, candidate, interviewName, startUtc, endUtc, cv } = params;
  const client = getGraphClient();

  const event = {
    subject: `${interviewName}: ${candidate.firstName} ${candidate.lastName}`,
    body: { contentType: "HTML", content: buildEventBody(params) },
    start: {
      dateTime: DateTime.fromISO(startUtc, { zone: "utc" }).toFormat(
        GRAPH_DATETIME_FORMAT,
      ),
      timeZone: "UTC",
    },
    end: {
      dateTime: DateTime.fromISO(endUtc, { zone: "utc" }).toFormat(
        GRAPH_DATETIME_FORMAT,
      ),
      timeZone: "UTC",
    },
    attendees: [
      {
        emailAddress: {
          address: candidate.email,
          name: `${candidate.firstName} ${candidate.lastName}`,
        },
        type: "required",
      },
    ],
  };

  const created = (await client
    .api(`/users/${encodeURIComponent(mailbox)}/events`)
    .post(event)) as { id: string };

  await attachCvToEvent(mailbox, created.id, cv);
  return created.id;
}

/** Attach the CV to an existing event: inline when small, else upload session. */
async function attachCvToEvent(
  mailbox: string,
  eventId: string,
  cv: CvPayload,
): Promise<void> {
  if (cv.data.length < INLINE_ATTACHMENT_LIMIT) {
    await getGraphClient()
      .api(
        `/users/${encodeURIComponent(mailbox)}/events/${eventId}/attachments`,
      )
      .post({
        "@odata.type": "#microsoft.graph.fileAttachment",
        name: cv.fileName,
        contentType: cv.contentType,
        contentBytes: cv.data.toString("base64"),
      });
    return;
  }
  await attachViaUploadSession(mailbox, eventId, cv);
}

async function attachViaUploadSession(
  mailbox: string,
  eventId: string,
  cv: CvPayload,
): Promise<void> {
  const session = (await getGraphClient()
    .api(
      `/users/${encodeURIComponent(mailbox)}/events/${eventId}/attachments/createUploadSession`,
    )
    .post({
      AttachmentItem: {
        attachmentType: "file",
        name: cv.fileName,
        size: cv.data.length,
        contentType: cv.contentType,
      },
    })) as { uploadUrl: string };

  const total = cv.data.length;
  for (let start = 0; start < total; start += UPLOAD_CHUNK_BYTES) {
    const end = Math.min(start + UPLOAD_CHUNK_BYTES, total);
    const chunk = cv.data.subarray(start, end);
    // Copy into a fresh ArrayBuffer-backed view so the body is a BodyInit both
    // the DOM types and Node's fetch accept.
    const body = new Uint8Array(chunk.length);
    body.set(chunk);
    const res = await fetch(session.uploadUrl, {
      method: "PUT",
      headers: {
        "Content-Length": String(chunk.length),
        "Content-Range": `bytes ${start}-${end - 1}/${total}`,
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`CV upload failed with status ${res.status}`);
    }
  }
}

/** Cancel/delete the event (used for booking rollback and, later, cancel). */
export async function deleteBookingEvent(
  mailbox: string,
  eventId: string,
): Promise<void> {
  await getGraphClient()
    .api(`/users/${encodeURIComponent(mailbox)}/events/${eventId}`)
    .delete();
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

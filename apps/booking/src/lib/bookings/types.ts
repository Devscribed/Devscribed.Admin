import type { InterviewDuration } from "@/lib/interview-types";

export type BookingStatus = "confirmed" | "rescheduled" | "cancelled";

export interface CandidateDetails {
  firstName: string;
  lastName: string;
  email: string;
  /** Optional free-text note from the candidate. */
  note?: string;
}

export interface CvMetadata {
  /** Original uploaded file name, e.g. "jane-doe-cv.pdf". */
  fileName: string;
  /** Opaque key into the CvStorage. */
  storageKey: string;
  contentType: string;
  size: number;
}

export interface BookingRecord {
  id: string;
  /** Unguessable per-booking token used in the Manage/Reschedule links. */
  token: string;
  status: BookingStatus;
  interview: {
    slug: string;
    name: string;
    durationMinutes: InterviewDuration;
  };
  /** Absolute interview start/end, ISO 8601 UTC. */
  start: string;
  end: string;
  /** IANA zone the candidate booked in (for display in invites/summary). */
  timeZone: string;
  candidate: CandidateDetails;
  cv: CvMetadata;
  /** Id of the MS 365 calendar event backing this booking. */
  graphEventId: string;
  createdAt: string;
  updatedAt: string;
}

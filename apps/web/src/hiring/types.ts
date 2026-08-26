/**
 * The shapes the hiring API answers with. They mirror the contracts in
 * `specs/hiring/01-vacancies.md`, `02-booking-page.md` and `04-candidate-card.md`
 * exactly, so a change to one is a compile error here rather than a blank cell on a
 * screen.
 */

import type { ApplicationStatus } from '@devscribed/validation';

export interface Vacancy {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'closed';
  durationMinutes: number;
  publicSlug: string;
  interviewer: { accountId: string; fullName: string };
  categories: Array<{ id: string; name: string }>;
  applicationCount: number;
  scheduledCount: number;
  createdAt: string;
}

export interface InterviewerOption {
  accountId: string;
  fullName: string;
  email: string;
  eligible: boolean;
  reason: 'no_mailbox' | null;
}

export interface PublicVacancy {
  organizationName: string;
  vacancy: {
    title: string;
    description: string | null;
    durationMinutes: number;
    status: 'open' | 'closed';
  };
}

export interface Availability {
  /** The zone the dates were bucketed in — echoed back, never guessed at. */
  timeZone: string;
  /** Today through one calendar month ahead, in `timeZone`. */
  window: { from: string; to: string };
  /**
   * One entry per date in the requested month, holding absolute UTC instants. An empty
   * array is a date with nothing free; a date that is absent is outside the window.
   * The page renders these; it never invents one.
   */
  dates: Record<string, string[]>;
}

export interface BookingConfirmation {
  vacancyTitle: string;
  durationMinutes: number;
  startUtc: string;
  timeZone: string;
  firstName: string;
  lastName: string;
  email: string;
  cvFileName: string;
}

/* ------------------------------------------------------------------ *
 * Candidate card — spec 04
 * ------------------------------------------------------------------ */

export interface CardCandidate {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
}

export interface CardApplication {
  id: string;
  status: ApplicationStatus;
  isCancelled: boolean;
  /** Frozen at booking; the candidate's display name may since have moved on. */
  submittedName: string;
  vacancy: { id: string; title: string; durationMinutes: number };
  interviewer: { accountId: string; fullName: string };
  startUtc: string;
  /** The booked end. A later change to the vacancy's length never moves it. */
  endUtc: string;
  bookedTimeZone: string;
  note: string | null;
  /** Named and sized, never located — the storage key never leaves the server. */
  cv: { fileName: string; sizeBytes: number | null } | null;
  interviewNotes: string;
  conclusion: string;
  /** Assessments arrive with the criteria library; the key is present from the start. */
  criteria: unknown[];
}

export interface CandidateCard {
  candidate: CardCandidate;
  /** The member's own zone, falling back to the interviewer's mailbox zone. */
  viewerTimeZone: string;
  applications: CardApplication[];
}

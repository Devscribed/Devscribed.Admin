/**
 * The shapes the hiring API answers with. They mirror the contracts in
 * `specs/hiring/01-vacancies.md`, `02-booking-page.md`, `03-candidate-database.md`,
 * `04-candidate-card.md` and `05-board.md` exactly, so a change to one is a compile
 * error here rather than a blank cell on a screen.
 */

import type { ApplicationStatus, CriterionType } from '@devscribed/validation';

/** A library entry with the usage count that makes a delete decision answerable. */
export interface Category {
  id: string;
  name: string;
  vacancyCount: number;
}

export interface CriterionValue {
  id: string;
  label: string;
  /** Contiguous from zero, worst to best. What every comparison reads. */
  position: number;
  /** Zero is what makes the remove control offerable at all (06 §03.16). */
  assessmentCount: number;
}

/** A criterion, its scale, and both counts the settings screen decides on. */
export interface Criterion {
  id: string;
  name: string;
  type: CriterionType;
  isArchived: boolean;
  assessmentCount: number;
  /** Empty for every type but `scale`. */
  values: CriterionValue[];
}

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
  /** In the order they were added, so a new chip appends rather than re-sorting. */
  criteria: CardCriterion[];
}

/**
 * One assessment as the card reads it: the criterion, and exactly one value.
 *
 * All four value keys are present with nulls in the three that do not apply, so the chip
 * reads the one its `type` names without a shape that changes between assessments.
 */
export interface CardCriterion {
  criterionId: string;
  name: string;
  type: CriterionType;
  /** Marks a chip whose criterion has since left the add-autocomplete. */
  isArchived: boolean;
  valueId: string | null;
  valueLabel: string | null;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
}

export interface CandidateCard {
  candidate: CardCandidate;
  /** The member's own zone, falling back to the interviewer's mailbox zone. */
  viewerTimeZone: string;
  applications: CardApplication[];
}

/* ------------------------------------------------------------------ *
 * Board — spec 05
 * ------------------------------------------------------------------ */

export interface BoardCardData {
  applicationId: string;
  candidateId: string;
  /** The candidate's current name, which the latest booking may have corrected. */
  name: string;
  startUtc: string;
  position: number;
  hasCv: boolean;
  isCancelled: boolean;
  /** Whether one exists — the conclusion itself is never sent to the board. */
  hasConclusion: boolean;
}

export interface BoardColumnData {
  status: ApplicationStatus;
  count: number;
  cards: BoardCardData[];
}

export interface Board {
  vacancy: { id: string; title: string; durationMinutes: number };
  /** The viewing member's zone, named once on the board rather than on every card. */
  viewerTimeZone: string;
  /** Every column, in the documented order, even when empty. */
  columns: BoardColumnData[];
}

/* ------------------------------------------------------------------ *
 * Candidate database — spec 03
 * ------------------------------------------------------------------ */

/**
 * One row of the database: a **person**, with their latest application beside them.
 *
 * `fullName` is the candidate's current name, which the latest booking may have
 * corrected — the frozen `submittedName` belongs to an application and stays on the card.
 */
export interface CandidateRow {
  id: string;
  fullName: string;
  email: string;
  /** Rendered only when it is more than one (03 §01.2). */
  applicationCount: number;
  /** Deduplicated across every vacancy they have applied to. */
  categories: Array<{ id: string; name: string }>;
  latestApplication: {
    id: string;
    vacancyTitle: string;
    startUtc: string;
    status: ApplicationStatus;
  } | null;
}

export interface CandidateDatabase {
  /** Unfiltered, so the count line can say "12 of 128" (03 §05.20). */
  total: number;
  matched: number;
  page: number;
  pageSize: number;
  /** Named once above the table rather than on every row. */
  viewerTimeZone: string;
  candidates: CandidateRow[];
}

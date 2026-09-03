/**
 * The shapes the hiring API answers with. They mirror the contracts in
 * `specs/hiring/01-vacancies.md`, `02-booking-page.md`, `03-candidate-database.md`,
 * `04-candidate-card.md` and `05-board.md` exactly, so a change to one is a compile
 * error here rather than a blank cell on a screen.
 */

import type {
  ApplicationStatus,
  CancellationFacts,
  CandidateScope,
  CriterionType,
  CvVersion,
  ScheduleEntry,
  VacancyStatus,
} from '@devscribed/validation';

/** A library entry with the usage count that makes a delete decision answerable. */
export interface Category {
  id: string;
  name: string;
  vacancyCount: number;
  /** The titles behind the count, alphabetical — two are printed, the rest fold into `+N`. */
  vacancies: string[];
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
  /** People with an application here that anybody can still open — the `Candidates` column. */
  applicationCount: number;
  scheduledCount: number;
  /**
   * Whether the server will accept a delete (01 §03.11) — its own rule, not re-derived
   * from the count above. The two disagree for a vacancy whose only applicants have been
   * deleted: no candidates to show, and still not deletable, because their applications
   * and every assessment on them are still there.
   */
  deletable: boolean;
  createdAt: string;
}

/**
 * The vacancies list, and the three numbers that come back beside it (01 §07.19).
 *
 * `statusCounts` is computed under the **search** and not under the tab, so each label
 * says what its own tab would show. `total` is narrowed by nothing at all, which is what
 * separates "no vacancies yet" from "this search found none" — the same division the
 * candidate database draws with `total` and `matched`.
 */
export interface VacancyList {
  vacancies: Vacancy[];
  statusCounts: { all: number; open: number; closed: number };
  total: number;
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
  /**
   * The candidate's handle on this booking, and what the page builds its redirect from:
   * a booking navigates to the manage link rather than rendering a confirmation of its
   * own (02 §10.41). The durable copy travels in the invite.
   */
  manageToken: string;
}

/* ------------------------------------------------------------------ *
 * Manage booking — spec 07
 * ------------------------------------------------------------------ */

/**
 * **It names nobody, and no file.** The link rides in a calendar event both parties hold
 * and can forward onward, so a live booking withholds what a dead one does: the
 * candidate's name, their address, and a CV filename usually built from their name
 * (07 §04.21). Withheld from the response, not merely unrendered.
 */
export interface ManageBooking {
  startUtc: string;
  /** The application's own length, which the vacancy's may since have left behind. */
  durationMinutes: number;
  timeZone: string;
  /** Whether a CV is on file — never which one. */
  hasCv: boolean;
}

/**
 * `booking` is null for **every** non-live case — cancelled, passed, unknown token,
 * malformed token — and the four are indistinguishable here as well as on screen
 * (07 §04.18). The vacancy is always present, because the slug resolves even when the
 * token does not.
 */
export interface ManageView {
  organizationName: string;
  vacancy: { title: string; durationMinutes: number; status: 'open' | 'closed' };
  booking: ManageBooking | null;
}

export interface ManageCancelled {
  organizationName: string;
  vacancy: { title: string; status: 'open' | 'closed' };
  cancelled: true;
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
  /**
   * `status` and `categories` are the vacancy **as it is now**, where everything else about
   * the interview is frozen at booking: the header states what the reader can act on today.
   */
  vacancy: {
    id: string;
    title: string;
    durationMinutes: number;
    status: VacancyStatus;
    categories: Array<{ id: string; name: string }>;
  };
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
  /** Newest first. Team-only, and on no candidate-facing surface (07 §11.53). */
  scheduleEvents: ScheduleEntry[];
  /**
   * Every version of the CV, newest first — the timeline's second source (07 §11.52).
   * The oldest is the document the booking carried, not a replacement.
   */
  cvVersions: CvVersion[];
  /** Who called the interview off, when, and — for a member — why. */
  cancellation: CancellationFacts | null;
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
  isCancelled: boolean;
  /** Names who cancelled, for the badge and its tooltip. Null when nobody did. */
  cancellation: CancellationFacts | null;
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
 * One row of the database: a **person**, with one of their applications beside them.
 *
 * `fullName` is the candidate's current name, which the latest booking may have
 * corrected — the frozen `submittedName` belongs to an application and stays on the card.
 */
export interface RowAssessment {
  criterionId: string;
  name: string;
  /** Already read: `B1`, `Yes`, `7` — never a scale value's id. */
  value: string;
}

export interface CandidateRow {
  id: string;
  fullName: string;
  email: string;
  /** Rendered only when it is more than one (03 §01.2). Their whole history, on either tab. */
  applicationCount: number;
  /**
   * What they have been assessed as, rolled up to their most recent interview that
   * answered each criterion (03 §01.2, §04.16), alphabetical by criterion.
   *
   * The row's chips. `English: B1` is what a recruiter scans a list of people for; the
   * vacancy categories that used to be here are the thing the *filter* is built out of,
   * and drawing them twice said nothing the drawer did not.
   */
  criteria: RowAssessment[];
  /**
   * Every assessment ever recorded against them — what the delete confirmation states
   * goes with the person (03 §11.62), not the one-per-criterion rollup above.
   */
  assessmentCount: number;
  /**
   * The application the row speaks about — **which the scope decides** (03 §08.44).
   *
   * In `all` it is the candidate's most recent one, whoever is interviewing it. In `mine`
   * it is the viewer's own nearest upcoming interview, or their most recent past one,
   * which is also the application that placed the row where it sits. The column heading
   * moves with it, because the two readings are not the same claim.
   */
  latestApplication: {
    id: string;
    vacancyTitle: string;
    /** The vacancy's assigned interviewer — the one the filter and the scope both mean. */
    interviewer: { accountId: string; fullName: string };
    startUtc: string;
    status: ApplicationStatus;
    /** The interview did not take place; the row badges that instead of a status. */
    isCancelled: boolean;
  } | null;
}

export interface CandidateDatabase {
  /**
   * Unfiltered **and org-wide**, so the "no candidates yet, share a booking link" state is
   * never reached by a scope or a filter that merely happens to be empty (03 §05.20–21): a
   * database that holds people and shows none is "no results", not "no candidates".
   */
  total: number;
  matched: number;
  page: number;
  pageSize: number;
  /** Whether the caller may see the whole database — what decides the tab strip exists. */
  canSeeAll: boolean;
  /** What the server **applied**, which may differ from what the URL asked (03 §08.40). */
  scope: CandidateScope;
  /** Under the filters already applied; `all` is absent when `canSeeAll` is false. */
  scopeCounts: { all?: number; mine: number };
  /** Named once above the table rather than on every row. */
  viewerTimeZone: string;
  candidates: CandidateRow[];
}

/* ------------------------------------------------------------------ *
 * My interviews — spec 03 §06
 * ------------------------------------------------------------------ */

/**
 * One row: an **application**, unlike the candidate database's person, because this
 * screen answers "what interviews do I have?" rather than "who do I know?".
 */
export interface MyInterviewRow {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  vacancyTitle: string;
  startUtc: string;
  /** The booked end — the row's own length, which the vacancy's may have left behind. */
  endUtc: string;
  status: ApplicationStatus;
  /**
   * **The interview did not take place**, and nothing about the candidate's standing
   * (07 §01.1). It is what removes the row's two actions, a cancelled interview being no
   * more actionable than a past one.
   */
  isCancelled: boolean;
}

export interface MyInterviews {
  /** Named once above the two groups rather than on every row. */
  viewerTimeZone: string;
  /** Soonest first. */
  upcoming: MyInterviewRow[];
  /** Most recent first. */
  past: MyInterviewRow[];
}

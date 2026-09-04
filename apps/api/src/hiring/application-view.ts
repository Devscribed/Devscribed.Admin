import type { Prisma } from '@prisma/client';
import type {
  CancellationFacts,
  CriterionType,
  CvVersion,
  ScheduleActor,
  ScheduleEntry,
  ScheduleEventType,
} from '@devscribed/validation';

/**
 * One application, as the candidate card shapes it (spec 04 §API).
 *
 * It lives here rather than inside `CandidatesService` because three routes now answer
 * with it: the card's read, and the team's reschedule and cancel, which return *the
 * updated application* so the section can be replaced in place rather than refetched
 * (07 §API). A member cancelling mid-interview must not have the notes field they are
 * typing in reloaded underneath them, and that is only true while all three agree on one
 * shape.
 */

/** One assessment, as the card reads it back (04 §API). */
export interface PresentedAssessment {
  criterionId: string;
  name: string;
  type: CriterionType;
  /** So the card can mark a chip whose criterion has since left the autocomplete. */
  isArchived: boolean;
  valueId: string | null;
  /** Resolved here, because the card renders a label and stores an id. */
  valueLabel: string | null;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
}

/** The criterion and, for a scale, the value row — everything a chip renders. */
export const ASSESSMENT = {
  criterion: { select: { id: true, name: true, type: true, isArchived: true } },
  value: { select: { id: true, label: true } },
} as const;

/**
 * Everything one application section renders, in one `include`.
 *
 * Shared so the shape cannot drift between the card's read and the two writes that
 * answer with it. `orderBy` is part of it: the criteria in the order they were added, so
 * a new chip appends rather than re-sorting the row under somebody's cursor, and the
 * schedule newest-first, which is the order the history expands into (07 §11.54).
 */
export const CARD_APPLICATION = {
  /*
   * `status` and `categories` are read live, unlike everything else about the interview,
   * and that is the point: what was booked is frozen (the length, the interviewer, the
   * end), but *what the vacancy is now* is what the header states — a closed vacancy and
   * the labels a recruiter filters by are facts about today, not about the booking.
   */
  vacancy: {
    select: {
      id: true, title: true, durationMinutes: true, status: true,
      categories: { include: { category: { select: { id: true, name: true } } } },
    },
  },
  /*
   * The interviewer this application was **booked with**, read from its own column
   * rather than resolved live through `vacancy.interviewer`. Reassigning a vacancy used
   * to rewrite the interviewer shown on every past application, including interviews
   * somebody else actually conducted (07 §13.63).
   */
  interviewer: { select: { id: true, firstName: true, lastName: true, email: true } },
  criteria: { orderBy: [{ createdAt: 'asc' }, { criterionId: 'asc' }], include: ASSESSMENT },
  scheduleEvents: {
    orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    include: { actorAccount: { select: { firstName: true, lastName: true } } },
  },
  /*
   * Every version of the CV, newest first — the timeline's second source, which the card
   * merges with the log at render (07 §11.52). Sent whole rather than as a count: the
   * oldest row is the document the booking carried and is not a replacement, and that
   * rule belongs in one place rather than being re-derived per surface.
   */
  cvVersions: { orderBy: [{ uploadedAt: 'desc' }, { id: 'asc' }] },
  // `satisfies` rather than `as const`: Prisma's `include` takes a mutable `orderBy`
  // array, and the literal still narrows for the row type below.
} satisfies Prisma.ApplicationInclude;

/** A log row as the timeline reads it: the actor already resolved to a name. */
export interface StoredScheduleEvent {
  id: string;
  type: string;
  actor: string;
  fromStart: Date | null;
  toStart: Date | null;
  timeZone: string;
  reason: string | null;
  createdAt: Date;
  actorAccount: { firstName: string; lastName: string } | null;
}

/** A stored CV version, as the timeline and the card's CV row read it. */
export interface StoredCvVersion {
  id: string;
  fileName: string;
  sizeBytes: number | null;
  uploadedAt: Date;
}

/** The row every presenter below reads — exactly what `CARD_APPLICATION` produces. */
export interface StoredCardApplication {
  id: string;
  status: string;
  isCancelled: boolean;
  submittedName: string;
  start: Date;
  end: Date;
  timeZone: string;
  note: string | null;
  cvFileName: string | null;
  cvSizeBytes: number | null;
  interviewNotes: string | null;
  conclusion: string | null;
  vacancy: {
    id: string;
    title: string;
    durationMinutes: number;
    /* `string`, as the application's own status is above: Prisma types these columns as
       strings and the narrowing happens at the edge, not in this row. */
    status: string;
    categories: Array<{ category: { id: string; name: string } }>;
  };
  interviewer: { id: string; firstName: string; lastName: string; email: string };
  criteria: StoredAssessment[];
  scheduleEvents: StoredScheduleEvent[];
  cvVersions: StoredCvVersion[];
}

export interface StoredAssessment {
  criterion: { id: string; name: string; type: string; isArchived: boolean };
  value: { id: string; label: string } | null;
  valueBool: boolean | null;
  valueNumber: number | null;
  valueText: string | null;
}

export function presentCardApplication(application: StoredCardApplication) {
  return {
    id: application.id,
    status: application.status,
    isCancelled: application.isCancelled,
    submittedName: application.submittedName,
    vacancy: {
      id: application.vacancy.id,
      title: application.vacancy.title,
      durationMinutes: application.vacancy.durationMinutes,
      status: application.vacancy.status,
      // Sorted here, as the vacancies list sorts them, so the same set of labels reads in
      // the same order on both screens.
      categories: application.vacancy.categories
        .map((assignment) => assignment.category)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    },
    interviewer: {
      accountId: application.interviewer.id,
      fullName: `${application.interviewer.firstName} ${application.interviewer.lastName}`,
    },
    startUtc: application.start.toISOString(),
    /**
     * The booked end, not `vacancy.durationMinutes`. Changing a vacancy's length leaves
     * scheduled interviews at the length they were booked at (01 §04.13), so the
     * vacancy's current setting is the wrong thing to render against an interview that
     * already happened.
     */
    endUtc: application.end.toISOString(),
    bookedTimeZone: application.timeZone,
    note: application.note,
    cv: application.cvFileName
      ? { fileName: application.cvFileName, sizeBytes: application.cvSizeBytes }
      : null,
    // Stored as null when never written; the editor is a string either way.
    interviewNotes: application.interviewNotes ?? '',
    conclusion: application.conclusion ?? '',
    /**
     * In the order they were added, which is the one order that does not move a chip
     * somebody is reading. Alphabetical would re-sort the row under the cursor every
     * time a criterion was added mid-interview, and this page moves nothing.
     */
    criteria: application.criteria.map(presentAssessment),
    /**
     * The scheduling history, team-only and on no candidate-facing surface (07 §11.53).
     * The card renders it collapsed; what is sent is the whole sequence, because
     * expanding it must not cost a request in the middle of an interview.
     */
    scheduleEvents: application.scheduleEvents.map((event) =>
      presentScheduleEvent(event, application.submittedName),
    ),
    /**
     * The other half of that history. Kept apart on the wire because they are genuinely
     * two records — a version carries a filename and a size that have no place in an
     * event row (07 §11.52) — and merged into one list only where it is rendered.
     */
    cvVersions: application.cvVersions.map(presentCvVersion),
    /**
     * Denormalized from the log for the one thing the log is not asked to answer: who
     * called this off. `isCancelled` remains the flag; this is only its attribution
     * (07 §11.51).
     */
    cancellation: cancellationOf(application.scheduleEvents, application.submittedName),
  };
}

export function presentCvVersion(version: StoredCvVersion): CvVersion {
  return {
    id: version.id,
    fileName: version.fileName,
    sizeBytes: version.sizeBytes,
    uploadedAt: version.uploadedAt.toISOString(),
  };
}

export function presentScheduleEvent(
  event: StoredScheduleEvent,
  submittedName: string,
): ScheduleEntry {
  return {
    id: event.id,
    type: event.type as ScheduleEventType,
    actor: event.actor as ScheduleActor,
    // The candidate is named by what they submitted, a member by their account — the
    // two are resolved here so no screen has to know which column to reach for.
    actorName: event.actorAccount
      ? `${event.actorAccount.firstName} ${event.actorAccount.lastName}`
      : submittedName,
    fromStartUtc: event.fromStart?.toISOString() ?? null,
    toStartUtc: event.toStart?.toISOString() ?? null,
    timeZone: event.timeZone,
    reason: event.reason,
    createdAt: event.createdAt.toISOString(),
  };
}

/**
 * Who cancelled, when, and why — from the newest `cancelled` entry, of which there is
 * at most one: cancelling is not undoable, so there is never a second.
 */
export function cancellationOf(
  events: StoredScheduleEvent[],
  submittedName: string,
): CancellationFacts | null {
  const cancelled = events.find((event) => event.type === 'cancelled');
  if (!cancelled) return null;
  return {
    actor: cancelled.actor as ScheduleActor,
    byName: cancelled.actorAccount
      ? `${cancelled.actorAccount.firstName} ${cancelled.actorAccount.lastName}`
      : submittedName,
    atUtc: cancelled.createdAt.toISOString(),
    reason: cancelled.reason,
  };
}

export function presentAssessment(assessment: StoredAssessment): PresentedAssessment {
  return {
    criterionId: assessment.criterion.id,
    name: assessment.criterion.name,
    type: assessment.criterion.type as CriterionType,
    isArchived: assessment.criterion.isArchived,
    valueId: assessment.value?.id ?? null,
    // The label is resolved from the row every time it is read, which is why renaming a
    // scale value costs nothing and reordering one costs a confirmation (06 §03.15).
    valueLabel: assessment.value?.label ?? null,
    valueBool: assessment.valueBool,
    valueNumber: assessment.valueNumber,
    valueText: assessment.valueText,
  };
}

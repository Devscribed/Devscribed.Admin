/**
 * Candidate-card rules — spec 04.
 *
 * The card writes three fields on an application: interview notes, a conclusion, and
 * the status that is also the board column. All three are shared, last write wins, so
 * there is nothing here about authorship or concurrency — only what a value may be.
 *
 * Criteria assessments (04 §05) are the fourth thing it writes, and they are the one
 * with a shape to check: a criterion's type decides which of four columns may hold its
 * value, and exactly one of them may. The library that owns the types is
 * `hiring-libraries.ts`; what a value may be, against one of them, is here.
 */

import {
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  isApplicationStatus,
  type ApplicationStatus,
} from './hiring';
import type { CriterionType } from './hiring-libraries';

export const APPLICATION_LIMITS = {
  interviewNotesMax: 20_000,
  conclusionMax: 5_000,
  /** 04 §Validation.6 — a free-text assessment, not an interview note. */
  criterionTextMax: 500,
} as const;

/** The two text fields the card autosaves. `status` is written by its own control. */
export type ApplicationTextField = 'interviewNotes' | 'conclusion';

export const APPLICATION_TEXT_LIMITS: Record<ApplicationTextField, number> = {
  interviewNotes: APPLICATION_LIMITS.interviewNotesMax,
  conclusion: APPLICATION_LIMITS.conclusionMax,
};

export const APPLICATION_TOO_LONG: Record<ApplicationTextField, string> = {
  interviewNotes: HIRING_MESSAGES.card.notesTooLong,
  conclusion: HIRING_MESSAGES.card.conclusionTooLong,
};

/** The five columns as a `Select` reads them, in board order (05 §01.1). */
export const applicationStatusOptions = (): Array<{
  value: ApplicationStatus;
  label: string;
}> =>
  (Object.keys(APPLICATION_STATUS_LABELS) as ApplicationStatus[]).map((value) => ({
    value,
    label: APPLICATION_STATUS_LABELS[value],
  }));

export interface ApplicationPatchInput {
  interviewNotes?: unknown;
  conclusion?: unknown;
  status?: unknown;
}

export type ApplicationPatchResult =
  | {
      valid: true;
      /** Only the fields the caller actually sent — a PATCH is a subset, not a whole. */
      value: { interviewNotes?: string; conclusion?: string; status?: ApplicationStatus };
    }
  | { valid: false; error: 'invalid_status' }
  | { valid: false; error: 'too_long'; fields: Partial<Record<ApplicationTextField, string>> }
  /**
   * A body whose notes are not text at all. Spec 04 enumerates only the two errors
   * above, because they are the two a client can produce — the editor sends a string
   * or nothing. Reporting a number as "too long" would be a message that is simply
   * untrue, so this stays a separate, malformed-request answer.
   */
  | { valid: false; error: 'invalid_body' };

/**
 * Neither text field is trimmed.
 *
 * Everywhere else in this package a value is trimmed before it is stored, because a
 * name with a trailing space is a typo. Notes are the opposite case: they are written
 * a keystroke at a time during a live call, and the newline someone has just typed
 * before their next thought is not noise to be tidied away. Trimming would also make
 * an autosave able to change the text under the cursor, which 04's whole design forbids.
 */
export function validateApplicationPatch(input: ApplicationPatchInput): ApplicationPatchResult {
  if (input.status !== undefined && !isApplicationStatus(input.status)) {
    return { valid: false, error: 'invalid_status' };
  }

  const fields: Partial<Record<ApplicationTextField, string>> = {};
  const text: Partial<Record<ApplicationTextField, string>> = {};

  for (const field of ['interviewNotes', 'conclusion'] as const) {
    const raw = input[field];
    if (raw === undefined) continue;
    // `null` clears the field; anything that is not a string is not text at all.
    if (raw !== null && typeof raw !== 'string') return { valid: false, error: 'invalid_body' };

    const value = raw === null ? '' : raw;
    if (value.length > APPLICATION_TEXT_LIMITS[field]) {
      fields[field] = APPLICATION_TOO_LONG[field];
      continue;
    }
    text[field] = value;
  }

  if (Object.keys(fields).length > 0) return { valid: false, error: 'too_long', fields };

  return {
    valid: true,
    value: {
      ...text,
      ...(input.status !== undefined ? { status: input.status as ApplicationStatus } : {}),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Criteria assessments — 04 §05
 * ------------------------------------------------------------------ */

/** The four value columns, one per criterion type (04 §05.22). */
export const ASSESSMENT_COLUMNS = ['valueId', 'valueBool', 'valueNumber', 'valueText'] as const;
export type AssessmentColumn = (typeof ASSESSMENT_COLUMNS)[number];

/**
 * Which column a type is stored in. The mapping is total and fixed, which is what lets
 * the candidate database compare with a plain indexed column rather than a JSON cast —
 * and what makes a criterion's type immutable, since moving an assessment between
 * columns after the fact would be a reinterpretation, not a migration.
 */
export const ASSESSMENT_COLUMN: Record<CriterionType, AssessmentColumn> = {
  scale: 'valueId',
  boolean: 'valueBool',
  number: 'valueNumber',
  text: 'valueText',
};

/** What the card sends: exactly one of the four, matching the criterion's type. */
export interface AssessmentInput {
  valueId?: unknown;
  valueBool?: unknown;
  valueNumber?: unknown;
  valueText?: unknown;
}

export type AssessmentResult =
  | { valid: true; column: AssessmentColumn; value: string | boolean | number }
  | { valid: false; error: 'type_mismatch'; message: string }
  | { valid: false; error: 'too_long'; message: string };

/**
 * The one value column a request populates, or why it does not.
 *
 * Two ways to fail, and they are the same answer: a value in the wrong column for the
 * type, and two columns at once. Both mean the request does not describe an assessment
 * of *this* criterion, and both are refused before anything is written — the database
 * would refuse them too, but a constraint violation is not a message anyone can act on.
 *
 * `valueId` is only checked for being an id here. Whether it is one of *this* criterion's
 * values is a question about rows, so the service answers it — with the same
 * `type_mismatch`, because from the member's side a value from another scale is exactly
 * a value that does not match this criterion (04 §Validation.5).
 */
export function validateAssessment(type: CriterionType, input: AssessmentInput): AssessmentResult {
  const supplied = ASSESSMENT_COLUMNS.filter((column) => input[column] !== undefined);
  const expected = ASSESSMENT_COLUMN[type];

  // Two at once is refused rather than resolved: picking the one that happens to match
  // would silently accept a request nobody meant to send.
  if (supplied.length !== 1 || supplied[0] !== expected) return mismatch();

  const raw = input[expected];

  switch (type) {
    case 'scale':
      return typeof raw === 'string' && raw.length > 0
        ? { valid: true, column: expected, value: raw }
        : mismatch();
    case 'boolean':
      return typeof raw === 'boolean' ? { valid: true, column: expected, value: raw } : mismatch();
    case 'number':
      // A number, not a string holding one: `"7"` sorts as text and would quietly break
      // every `>=` the candidate database runs.
      return typeof raw === 'number' && Number.isFinite(raw)
        ? { valid: true, column: expected, value: raw }
        : mismatch();
    case 'text':
      if (typeof raw !== 'string') return mismatch();
      // Not trimmed and not truncated: this is what somebody typed, and silently
      // shortening it is the one outcome worse than refusing it.
      return raw.length > APPLICATION_LIMITS.criterionTextMax
        ? { valid: false, error: 'too_long', message: HIRING_MESSAGES.card.criterionTextTooLong }
        : { valid: true, column: expected, value: raw };
  }
}

const mismatch = (): AssessmentResult => ({
  valid: false,
  error: 'type_mismatch',
  message: HIRING_MESSAGES.card.criterionTypeMismatch,
});

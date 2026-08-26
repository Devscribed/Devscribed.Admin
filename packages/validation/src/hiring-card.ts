/**
 * Candidate-card rules — spec 04.
 *
 * The card writes three fields on an application: interview notes, a conclusion, and
 * the status that is also the board column. All three are shared, last write wins, so
 * there is nothing here about authorship or concurrency — only what a value may be.
 *
 * Criteria assessments (04 §05) arrive with the criteria library and are absent by
 * design rather than by oversight.
 */

import {
  APPLICATION_STATUS_LABELS,
  HIRING_MESSAGES,
  isApplicationStatus,
  type ApplicationStatus,
} from './hiring';

export const APPLICATION_LIMITS = {
  interviewNotesMax: 20_000,
  conclusionMax: 5_000,
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

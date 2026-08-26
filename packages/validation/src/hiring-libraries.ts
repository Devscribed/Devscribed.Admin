/**
 * The org-wide library rules, shared by the settings screen, the inline creation paths
 * in the vacancy dialog and on the candidate card, and the API that re-runs all of it.
 *
 * Both libraries live here. What they share — the name limits and the case-insensitive
 * uniqueness that is the whole point of the exercise — is written once, under `LIBRARY_*`
 * names rather than `CATEGORY_*` ones, and each library's own rules sit below it:
 * categories have a name and nothing else, criteria have a type, an ordered scale and an
 * archived state.
 *
 * What a criterion is assessed *as* belongs to the card that records it, so the rule
 * that exactly one value column may be populated lives in `hiring-card.ts` beside the
 * other things that screen writes.
 *
 * Every message is verbatim from the "Error Messages" table of
 * `specs/hiring/06-libraries.md`.
 */

import type { FieldResult } from './index';

/* ------------------------------------------------------------------ *
 * Limits and messages
 * ------------------------------------------------------------------ */

export const LIBRARY_LIMITS = {
  nameMax: 50,
} as const;

export const LIBRARY_MESSAGES = {
  name: {
    required: 'Name is required',
    tooLong: `Name must be at most ${LIBRARY_LIMITS.nameMax} characters`,
  },
  category: {
    empty: 'No categories yet. Add one when you create a vacancy.',
    /**
     * 06 §01.5 asks for the consequence of shipping uniqueness without merge to be
     * stated on the screen rather than discovered: with rename refusing a name that
     * already exists, a duplicate that is already in the library cannot be renamed
     * away. Saying so is the difference between a limitation and a bug report.
     */
    mergeUnavailable:
      "Merging isn't available yet, and a rename onto an existing name is refused — " +
      'to remove a near-duplicate, reassign its vacancies and delete it.',
    /**
     * Server-side only: the vacancy dialog can only send ids it was just handed, so
     * nothing in the UI produces this. It exists because an id belonging to another
     * organization is refused rather than quietly dropped — saving a vacancy with one
     * fewer category than was asked for is the worse answer (06 §Validation.7).
     */
    unknown: 'One of those categories no longer exists',
  },
  toast: {
    created: 'Added to the library',
    renamed: 'Category renamed',
    deleted: 'Category deleted',
  },
} as const;

/** `"React" already exists` — the duplicate a create was refused for. */
export const duplicateNameMessage = (name: string): string => `"${name}" already exists`;

/**
 * The same collision reached through a rename, which needs the extra sentence: 06 §01.5
 * leaves no merge, so the only way out is to reassign and delete.
 */
export const renameCollisionMessage = (name: string): string =>
  `${duplicateNameMessage(name)}. Reassign and delete one instead.`;

/**
 * `4 vacancies`, `1 vacancy`. The count is what makes a delete decision answerable, so
 * the singular is spelled out rather than interpolated into a plural frame.
 */
export const categoryUsageLabel = (count: number): string =>
  count === 1 ? '1 vacancy' : `${count} vacancies`;

/** `Delete "React"? It's used by 4 vacancies.` — there is no undo, and it does not pretend. */
export const categoryDeleteConfirmation = (name: string, count: number): string =>
  `Delete "${name}"? It's used by ${categoryUsageLabel(count)}.`;

/* ------------------------------------------------------------------ *
 * Names
 * ------------------------------------------------------------------ */

/** What gets stored: the name as typed, trimmed. Case is preserved, never folded. */
export const normalizeLibraryName = (input: string | null | undefined): string =>
  (input ?? '').trim();

/**
 * The comparison key. Trimmed and lowercased, which is what makes `react`, `REACT` and
 * `  React  ` all the same entry as `React` (06 §01.3).
 *
 * It mirrors the `lower(name)` expression the unique index is built on. The two can
 * disagree only on characters Postgres's collation folds differently from JavaScript's
 * default casing, and for those the index refuses the write that this missed — which is
 * why the service treats a unique violation as a duplicate rather than as a surprise.
 */
export const libraryNameKey = (input: string | null | undefined): string =>
  normalizeLibraryName(input).toLowerCase();

export function validateLibraryName(input: string | null | undefined): FieldResult {
  const value = normalizeLibraryName(input);
  if (value.length === 0) return { valid: false, error: LIBRARY_MESSAGES.name.required };
  if (value.length > LIBRARY_LIMITS.nameMax) {
    return { valid: false, error: LIBRARY_MESSAGES.name.tooLong };
  }
  return { valid: true, value };
}

/** The minimum an entry needs for the duplicate rules to work on it. */
export interface LibraryEntry {
  id: string;
  name: string;
}

/**
 * The entry `name` collides with, or `null` when it is genuinely new.
 *
 * It returns the **entry** rather than a boolean because every caller needs its id: the
 * API puts it in the 409 body, and the vacancy dialog selects it, so a member who typed
 * `react` while `React` exists gets what they meant instead of an error (06 §01.3).
 *
 * `excludeId` is what lets a rename keep its own name — saving `React` as `React` is a
 * no-op, not a collision with itself.
 */
export function findLibraryDuplicate<T extends LibraryEntry>(
  name: string | null | undefined,
  entries: readonly T[],
  options: { excludeId?: string } = {},
): T | null {
  const key = libraryNameKey(name);
  if (key.length === 0) return null;
  return (
    entries.find(
      (entry) => entry.id !== options.excludeId && libraryNameKey(entry.name) === key,
    ) ?? null
  );
}

/**
 * The names an inline caller asked to create, minus the ones that already exist and
 * minus its own repeats — `["React", "react", "Senior"]` against a library holding
 * `React` leaves `Senior` alone to be written.
 *
 * Deduplicating within the batch matters as much as against the library: the two spellings
 * would otherwise race each other into the same unique index in one request.
 */
export function newLibraryNames(
  names: readonly string[],
  existing: readonly LibraryEntry[],
): string[] {
  const seen = new Set(existing.map((entry) => libraryNameKey(entry.name)));
  const fresh: string[] = [];

  for (const raw of names) {
    const name = normalizeLibraryName(raw);
    const key = libraryNameKey(name);
    if (key.length === 0 || seen.has(key)) continue;
    seen.add(key);
    fresh.push(name);
  }

  return fresh;
}

/* ------------------------------------------------------------------ *
 * Criteria — 06 §03
 * ------------------------------------------------------------------ */

/** The four types, chosen at creation and never afterwards (06 §03.13). */
export const CRITERION_TYPES = ['scale', 'boolean', 'number', 'text'] as const;
export type CriterionType = (typeof CRITERION_TYPES)[number];

export const isCriterionType = (input: unknown): input is CriterionType =>
  CRITERION_TYPES.includes(input as CriterionType);

/** As the type radio group reads them (06 design §Copy). */
export const CRITERION_TYPE_LABELS: Record<CriterionType, string> = {
  scale: 'Scale',
  boolean: 'Yes/No',
  number: 'Number',
  text: 'Text',
};

export const CRITERION_LIMITS = {
  /** A scale long enough for CEFR twice over; past that it is a text field. */
  valuesMax: 20,
} as const;

export const CRITERION_MESSAGES = {
  empty: 'No criteria yet. Add one during an interview.',
  type: {
    required: 'Choose a type',
    /**
     * Every assessment is stored in the column its criterion's type names, so changing
     * the type would strand or silently reinterpret all of them (06 §03.14). The message
     * names the way out rather than only saying no.
     */
    immutable: "A criterion's type can't be changed. Archive it and create a new one.",
    /**
     * The one place a member learns what the choice is actually for — a scale is what
     * makes `at least` possible (06 design §The criterion dialog).
     */
    hint: 'Scale values can be compared — "at least B1" — so use one when order matters.',
  },
  values: {
    required: 'Add at least one value',
    /** Compared case-insensitively, exactly as the names are. */
    duplicate: 'Each value must be different',
    tooMany: `A scale can have at most ${CRITERION_LIMITS.valuesMax} values`,
    /**
     * Server-side only: the dialog hides the values block entirely for the other three
     * types, so nothing in the UI can produce this.
     */
    notAllowed: 'Only a scale has values',
    /** Also server-side only — the dialog can only send ids it was just handed. */
    unknown: 'One of those values no longer exists',
    /** Stated in the label itself, because order is what cannot be corrected later. */
    label: 'Values, worst to best',
    addPlaceholder: 'Add value…',
    /**
     * The only edit in either library with retroactive effect: a filter stores a
     * threshold, comparison reads positions, so moving a value changes what that filter
     * already matches (06 §03.16). Renaming does not, and is not confirmed.
     */
    reorderConfirmation: 'Reordering changes what existing filters match.',
  },
  archivedBadge: 'Archived',
  toast: {
    archived: 'Criteria archived',
    restored: 'Criteria restored',
    /** Not in 06's table, which names only the three above — nor is the categories
     *  screen's "Category renamed", and for the same reason: an edit that reported
     *  nothing would leave a member unsure whether it took. */
    updated: 'Criteria updated',
    deleted: 'Criteria deleted',
  },
} as const;

/**
 * `18 assessments`, `1 assessment`. As with categories the singular is spelled out —
 * this count is what decides between archiving and deleting, so it has to read cleanly.
 */
export const criterionUsageLabel = (count: number): string =>
  count === 1 ? '1 assessment' : `${count} assessments`;

/** `Archive this instead — it has 18 assessments` — why Delete is disabled. */
export const criterionDeleteBlockedMessage = (count: number): string =>
  `Archive this instead — it has ${criterionUsageLabel(count)}`;

/** `"A2" is used by 2 assessments` — why one chip's remove control is disabled. */
export const valueInUseMessage = (label: string, count: number): string =>
  `"${label}" is used by ${criterionUsageLabel(count)}`;

/**
 * What separates a scale's values wherever they are listed.
 *
 * `›` rather than a comma on purpose: a comma-separated list reads as a set, and the whole
 * point of a scale is that its order means something (06 design §Layout). The glyph is
 * decorative — the list around it is an `<ol>`, so the order is conveyed structurally too.
 */
export const SCALE_SEPARATOR = ' › ';

/** One row of a scale, as both the dialog and the API talk about it. */
export interface CriterionValueInput {
  /** Present for a value that already exists; absent for one being added. */
  id?: string;
  label: string;
}

export type CriterionValuesError =
  | 'values_required'
  | 'values_not_allowed'
  | 'duplicate_value'
  | 'too_many_values'
  | 'invalid_value';

export type CriterionValuesResult =
  | { valid: true; values: Array<{ id?: string; label: string; position: number }> }
  | { valid: false; error: CriterionValuesError; message: string };

/**
 * A scale's whole ordered list, validated and numbered (06 §Validation.3).
 *
 * `values` is the complete list in its new order, not a diff — so the positions this
 * hands back are contiguous from zero every time, and a reorder needs no arithmetic
 * anywhere else. That is what keeps two values from ever sharing a position, which the
 * comparison in `compareScale` would have no way to resolve.
 *
 * A non-scale type must carry no values at all: the column that stores a boolean is not
 * the column that stores a scale, and a list of labels beside one is a request that
 * cannot be honoured (06 §API).
 */
export function validateCriterionValues(
  type: CriterionType,
  values: readonly CriterionValueInput[] | null | undefined,
): CriterionValuesResult {
  const supplied = values ?? [];

  if (type !== 'scale') {
    if (supplied.length > 0) {
      return {
        valid: false,
        error: 'values_not_allowed',
        message: CRITERION_MESSAGES.values.notAllowed,
      };
    }
    return { valid: true, values: [] };
  }

  if (supplied.length === 0) {
    return { valid: false, error: 'values_required', message: CRITERION_MESSAGES.values.required };
  }
  if (supplied.length > CRITERION_LIMITS.valuesMax) {
    return { valid: false, error: 'too_many_values', message: CRITERION_MESSAGES.values.tooMany };
  }

  const seen = new Set<string>();
  const numbered: Array<{ id?: string; label: string; position: number }> = [];

  for (const entry of supplied) {
    // A value's name obeys the same 1–50 rule as a library entry's, which is why that
    // validator is named for the library rather than for categories.
    const name = validateLibraryName(entry?.label);
    if (!name.valid) {
      return { valid: false, error: 'invalid_value', message: name.error };
    }

    const key = libraryNameKey(name.value);
    if (seen.has(key)) {
      return {
        valid: false,
        error: 'duplicate_value',
        message: CRITERION_MESSAGES.values.duplicate,
      };
    }
    seen.add(key);

    numbered.push({
      ...(entry.id ? { id: entry.id } : {}),
      label: name.value,
      position: numbered.length,
    });
  }

  return { valid: true, values: numbered };
}

/** Moves one entry of a list to another index, returning a new list. */
export function moveValue<T>(values: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || from >= values.length) return [...values];
  const next = [...values];
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, moved);
  return next;
}

/**
 * Whether the values that already existed have changed their order relative to one
 * another — the edit that needs confirming, and only it (06 §03.16).
 *
 * Adding a value is not a reorder even though it shifts the positions below it: every
 * existing value keeps its place in the sequence, so every existing comparison keeps its
 * answer. Renaming is not one either, since nothing compares labels. Moving one is, and
 * it is the only thing here a member cannot undo by looking at the screen afterwards.
 */
export function scaleWasReordered(
  original: readonly string[],
  next: readonly string[],
): boolean {
  const kept = next.filter((id) => original.includes(id));
  const before = original.filter((id) => kept.includes(id));
  return kept.some((id, index) => before[index] !== id);
}

/** The four things a scale can be filtered by (06 §03.13). */
export const SCALE_OPERATORS = ['is', 'is_not', 'at_least', 'at_most'] as const;
export type ScaleOperator = (typeof SCALE_OPERATORS)[number];

/** A scale value as anything comparing them needs it: an id and where it sits. */
export interface ScalePosition {
  id: string;
  position: number;
}

/** Where a value sits in its criterion's order, or `null` when it is not one of them. */
export const scalePosition = (
  values: readonly ScalePosition[],
  valueId: string | null | undefined,
): number | null => values.find((value) => value.id === valueId)?.position ?? null;

/**
 * Comparison for a scale, by **position, never by label** (06 §03.15).
 *
 * This is the rule that makes renaming a value free and reordering one retroactive, and
 * therefore the reason this phase confirms a reorder and nothing else. The candidate
 * database ([03](../../../specs/hiring/03-candidate-database.md)) is what will compare in
 * anger, in SQL; the definition lives here because it is what a scale *is*, and a second
 * copy of it written beside a query is how the two would come to disagree.
 *
 * A `null` position — no assessment, or one against a value that has since been removed —
 * matches **no** operator, the negative ones included: "not B1" is a claim about someone
 * who was assessed, and a candidate nobody assessed has not made it.
 */
export function compareScale(
  operator: ScaleOperator,
  value: number | null,
  threshold: number | null,
): boolean {
  if (value === null || threshold === null) return false;
  switch (operator) {
    case 'is':
      return value === threshold;
    case 'is_not':
      return value !== threshold;
    case 'at_least':
      return value >= threshold;
    case 'at_most':
      return value <= threshold;
  }
}

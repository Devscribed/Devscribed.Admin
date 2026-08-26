/**
 * The org-wide library rules, shared by the settings screen, the vacancy dialog's
 * inline creation path, and the API that re-runs all of it.
 *
 * This release covers **categories** only; criteria arrive with their own phase and
 * their rules land beside these. What both libraries already share — the name limits
 * and the case-insensitive uniqueness that is the whole point of the exercise — is
 * written once here, under `LIBRARY_*` names rather than `CATEGORY_*` ones.
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

/**
 * Holiday sourcing — specs/time-off/02-holiday-sourcing.md.
 *
 * The rules the sync route, the summary route, the sourcing setting and the Holidays
 * screen all run: which countries an organization sources, which of a third party's
 * entries may become a `Holiday` row, and the wording of every message any of them
 * shows. Pure functions only — no I/O, no clock.
 *
 * Rules 4 to 7 (the provider-entry filter and the country-set filter) are server-only:
 * they judge a payload no client ever sees. They are here rather than in the API because
 * a rule that decides what gets paid is a rule the whole repository re-runs from one
 * place, and because the unit cases can then reach them without a database.
 */

import { validateCountryCode } from './autofill';
import { validateHolidayName } from './holidays';
import { resolveMemberHolidayCountry } from './reports';

/**
 * §Error Messages, verbatim. The four rows the table marks `—` are screen text emitted
 * by no route; they live here because a screen that invents a sentence is a screen whose
 * wording nothing governs.
 */
export const HOLIDAY_SOURCING_MESSAGES = {
  /* Validation Rule 1 — the 422 on POST .../holidays/sync and GET .../holidays/summary. */
  yearInvalid: 'Choose a year between 2000 and 2100.',
  /* Validation Rule 2 — the 422 on PUT .../settings/holiday-sourcing. */
  includeOrgCountryInvalid: "Choose whether to include the organization's country.",
  /* Screen text — the sourcing panel, when a sync left a country unsourced. */
  syncFailedSome: 'Some countries could not be sourced.',
  /* Screen text — one per country the provider does not cover (`unsourced`). */
  countryNotCovered:
    'The holiday service does not cover this country. Add its holidays by hand.',
  /*
   * Screen text — one per country the provider DOES cover and offered nothing for
   * (`empty`, REQ-02-023). A separate sentence because the two states are separate: the
   * service answered for this one, and telling an admin it does not cover the country
   * would send them looking for a provider that already replied.
   */
  countryNoHolidays:
    'The holiday service lists no public holidays for this country this year. Add any by hand.',
  /* Screen text — a sync is in flight. */
  syncing: 'Fetching public holidays…',
  /* Screen text — the summary read failed; the list is unaffected. */
  summaryUnavailable: 'The day and cost totals could not be loaded.',
} as const;

/** Validation Rule 1 — the inclusive bounds a sourced or summarised year lies in. */
export const HOLIDAY_SYNC_YEAR_MIN = 2000;
export const HOLIDAY_SYNC_YEAR_MAX = 2100;

/** REQ-02-004 — what an imported holiday is paid. The provider supplies no hours. */
export const HOLIDAY_IMPORT_PAID_HOURS = 8.0;

/** REQ-02-004 / §Data Model — `Holiday.source`. A documented string, not an enum. */
export const HOLIDAY_SOURCE_MANUAL = 'manual';
export const HOLIDAY_SOURCE_IMPORTED = 'imported';

/**
 * The three shapes a `(organization, country, year)` takes (§State Machine).
 * `unsourced` is the absence of an import record, not a value stored anywhere.
 */
export type HolidaySourcingState = 'sourced' | 'empty' | 'unsourced';

export type YearResult = { valid: true; value: number } | { valid: false; error: string };
export type BooleanResult = { valid: true; value: boolean } | { valid: false; error: string };
/** Rule 3 carries no message — a `refresh` nothing can read is simply not a refresh. */
export type FlagResult = { valid: true; value: boolean } | { valid: false };

/**
 * Validation Rule 1 — `year`, an integer from 2000 to 2100 inclusive. A numeric string
 * is accepted because the summary takes its year from a query string; a fractional or
 * non-numeric value is refused rather than truncated.
 */
export function validateSyncYear(input: unknown): YearResult {
  const raw =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim().length > 0
        ? Number(input)
        : Number.NaN;
  if (!Number.isInteger(raw) || raw < HOLIDAY_SYNC_YEAR_MIN || raw > HOLIDAY_SYNC_YEAR_MAX) {
    return { valid: false, error: HOLIDAY_SOURCING_MESSAGES.yearInvalid };
  }
  return { valid: true, value: raw };
}

/**
 * Validation Rule 2 — `includeOrgCountry`, a boolean. Absent or non-boolean is refused
 * and **never coerced**: `'false'` and `0` are values somebody sent by mistake, and
 * reading either as an intention silently changes which countries get paid holidays.
 */
export function validateIncludeOrgCountry(input: unknown): BooleanResult {
  if (typeof input !== 'boolean') {
    return { valid: false, error: HOLIDAY_SOURCING_MESSAGES.includeOrgCountryInvalid };
  }
  return { valid: true, value: input };
}

/**
 * Validation Rule 3 — `refresh`, a boolean; absent means `false`. The table gives it no
 * message, so a value that is neither absent nor boolean cannot be refused with one: it
 * answers `{ valid: false }` and the caller treats it as no refresh, which is the
 * conservative half (a refresh re-asks a third party and rewrites deleted rows).
 */
export function validateRefreshFlag(input: unknown): FlagResult {
  if (input === undefined || input === null) return { valid: true, value: false };
  if (typeof input !== 'boolean') return { valid: false };
  return { valid: true, value: input };
}

export interface SourcedCountrySetInput {
  /** Every ACTIVE membership's stated country, in a stable order. Raw column values. */
  memberCountries: readonly (string | null | undefined)[];
}

/**
 * The organization's **sourced country set**: every country an active member states, and
 * no other.
 *
 * Distinct and order-stable — the members in the order given — so a set read twice never
 * repaints the screen for no reason.
 *
 * Rule 7 — a code that fails `validateCountryCode` is **dropped** from the set rather
 * than refusing the whole read: a legacy or mistyped value on one membership must not
 * stop the other countries being sourced. A member who states nothing usable adds
 * nothing, which is now the only thing that happens to them: there is no organization
 * country left for them to fall back to.
 *
 * PATCH-012 — the organization's own country, and the stored checkbox that added it, are
 * both gone. Holidays are sourced for the countries the people in the organization are
 * actually in.
 */
export function buildSourcedCountrySet(input: SourcedCountrySetInput): string[] {
  const set: string[] = [];
  const add = (code: string | null): void => {
    if (code === null || code.length === 0) return;
    const checked = validateCountryCode(code);
    if (!checked.valid || checked.value.length === 0) return;
    if (!set.includes(checked.value)) set.push(checked.value);
  };

  for (const member of input.memberCountries) {
    add(resolveMemberHolidayCountry(member));
  }
  return set;
}

/**
 * One entry as a provider hands it over, before any of it is believed. The index
 * signature is deliberate: the payload carries fields this product does not model
 * (`localName`, `fixed`, `launchYear`) and naming them here would claim a contract over
 * values nothing reads.
 */
export interface RawProviderEntry {
  date?: unknown;
  name?: unknown;
  countryCode?: unknown;
  global?: unknown;
  types?: unknown;
  counties?: unknown;
  [field: string]: unknown;
}

/** One entry that passed Rules 4 to 6 and REQ-02-005, normalized for the writer. */
export interface AcceptedProviderEntry {
  /** `YYYY-MM-DD`, inside the requested year. */
  date: string;
  /** Trimmed, 1–120 characters, `validateHolidayName`-clean. */
  name: string;
  /** Uppercase alpha-2, equal to the country requested. */
  countryCode: string;
}

export interface AcceptedProviderEntries {
  accepted: AcceptedProviderEntry[];
  /** How many entries were refused. §`discarded` in the sync response. */
  discarded: number;
}

const PROVIDER_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `YYYY-MM-DD` that names a day that exists. `Date.UTC` rolls a bad day forward —
 * `2026-02-31` becomes 3 March — so the answer is whether the value survives the trip
 * unchanged, not whether the constructor threw.
 */
function isRealCalendarDay(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/**
 * REQ-02-005 and Validation Rules 4 to 6 — one pure pass over a third party's payload.
 *
 * Accepted: `global === true`, `types` containing `Public`, a `YYYY-MM-DD` date inside
 * the requested year, a country code equal to the one requested after uppercasing, and a
 * name that passes `validateHolidayName`. Everything else is discarded and counted.
 *
 * Nothing here ever becomes a 422: the caller did not send this payload and cannot fix
 * it. The `discarded` count is the observable — for Germany it is the ten regional
 * entries whose silent import would overpay every German member for ten days a year.
 */
export function acceptProviderEntries(
  entries: readonly RawProviderEntry[] | unknown,
  request: { countryCode: string; year: number },
): AcceptedProviderEntries {
  if (!Array.isArray(entries)) return { accepted: [], discarded: 0 };
  const wanted = (request.countryCode ?? '').trim().toUpperCase();
  const accepted: AcceptedProviderEntry[] = [];
  let discarded = 0;

  for (const entry of entries as RawProviderEntry[]) {
    const value = entry as RawProviderEntry | null;
    if (!value || typeof value !== 'object') {
      discarded += 1;
      continue;
    }

    // REQ-02-005 — nationwide and of type `Public`, both, and both from the payload
    // rather than inferred from a missing `counties`.
    if (value.global !== true) {
      discarded += 1;
      continue;
    }
    if (!Array.isArray(value.types) || !value.types.includes('Public')) {
      discarded += 1;
      continue;
    }

    // Rule 4 — the date, parsed as a calendar day and never through a zone-bearing Date.
    //
    // The shape is not enough: `2026-02-31` matches the pattern and names no day. It is
    // checked by round-tripping through a UTC date and requiring the same string back, so
    // a day the month does not have is discarded rather than stored — Postgres would
    // refuse it on the insert, and one bad entry must cost its own row, not the import.
    const date = typeof value.date === 'string' ? value.date.trim() : '';
    const match = PROVIDER_DATE_PATTERN.exec(date);
    if (!match || Number(match[1]) !== request.year || !isRealCalendarDay(date)) {
      discarded += 1;
      continue;
    }

    // Rule 5 — the country the caller asked for, uppercased before comparison.
    const code = typeof value.countryCode === 'string' ? value.countryCode.trim().toUpperCase() : '';
    if (code.length === 0 || code !== wanted) {
      discarded += 1;
      continue;
    }

    // Rule 6 — the same function a typed holiday name passes.
    const name = validateHolidayName(value.name);
    if (!name.valid) {
      discarded += 1;
      continue;
    }

    accepted.push({ date, name: name.value, countryCode: code });
  }

  return { accepted, discarded };
}

/**
 * §Boundary values — `externalKey`, the identity the provider does not supply.
 * `{provider}:{countryCode}:{date}`, composed from values that have already passed the
 * rules above.
 */
export function holidayExternalKey(
  provider: string,
  countryCode: string,
  date: string,
): string {
  return `${provider}:${countryCode.toUpperCase()}:${date}`;
}

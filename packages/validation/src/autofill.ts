/**
 * Field autofill — the source catalogue, resolution, PII masking, and member-profile
 * validation from specs/documents/03-field-autofill.md.
 *
 * Like `documents.ts` and `envelopes.ts`, this module is shared verbatim by the Next.js
 * app and the NestJS API: it is pure, DOM-free, and has no runtime dependencies, because
 * the same `dist/` is loaded by a browser bundle and by a Node service. Three consequences
 * shape the file:
 *
 * 1. **The catalogue is data, not code.** Requirement 1 makes autofill a closed lookup
 *    table rather than a template language, and requirement 3 makes the server drive the
 *    picker. `AUTOFILL_SOURCES` is therefore the single list that `GET .../autofill-sources`
 *    serializes, that the picker filters, and that the resolver switches on. A source that
 *    is not in it does not exist anywhere.
 *
 * 2. **Resolution never fails.** Requirement 7 is explicit that a null source is an empty
 *    value and not an error: an incomplete profile must produce a draft with gaps, which
 *    the sender fills by hand, rather than a 500 that blocks a contract. So every function
 *    below that resolves returns a string — the empty one when there is nothing to say.
 *
 * 3. **Masking governs the profile, not the document.** `maskProfileValue` exists for the
 *    Contract details screen (requirement 20). It is deliberately *not* applied during
 *    resolution: requirement 23 says a value snapshotted into an envelope is part of the
 *    contract and is shown in full. A masking helper that ran inside `resolveAutofill`
 *    would put `***4567` into a signed agreement, which is the one outcome nobody wants.
 */

import type { TemplateFieldType } from './documents';
import type { FieldResult } from './index';

/* ------------------------------------------------------------------ *
 * The catalogue (requirements 1-5)
 * ------------------------------------------------------------------ */

export type AutofillValueType = 'text' | 'multiline' | 'email' | 'date';

export interface AutofillSource {
  key: string;
  label: string;
  group: 'member' | 'org' | 'system';
  type: AutofillValueType;
  sensitive: boolean;
}

/**
 * The closed catalogue from the spec's table, in the spec's order.
 *
 * Order matters twice over: it is the order the picker renders in, and it is the order a
 * reviewer reads the spec table in, so a diff against the table is a line-by-line diff.
 *
 * `member.jobTitle` is here even though nothing can fill it yet. It maps to
 * `Membership.jobTitle`, a column **user-management spec 05** has not added — the schema
 * today has `role`, `status`, and `joinedAt` and no job title at all. Dropping the source
 * until that column lands would be the wrong call: requirement 3 says the server drives
 * the picker, so an admin who binds a field to it now gets a template that starts working
 * the day spec 05 ships, with no template migration. `AutofillSubject.jobTitle` and the
 * resolver case for it already exist, so the only thing missing is a column for the API to
 * read: until spec 05 adds one it passes `null`, and the source resolves to the empty
 * string, which requirement 7 already defines as legal and unremarkable.
 */
export const AUTOFILL_SOURCES: readonly AutofillSource[] = [
  { key: 'member.firstName', label: 'First name', group: 'member', type: 'text', sensitive: false },
  { key: 'member.lastName', label: 'Last name', group: 'member', type: 'text', sensitive: false },
  { key: 'member.fullName', label: 'Full name', group: 'member', type: 'text', sensitive: false },
  { key: 'member.email', label: 'Email', group: 'member', type: 'email', sensitive: false },
  { key: 'member.jobTitle', label: 'Job title', group: 'member', type: 'text', sensitive: false },
  { key: 'member.joinedAt', label: 'Joined date', group: 'member', type: 'date', sensitive: false },
  { key: 'member.addressLine', label: 'Address', group: 'member', type: 'text', sensitive: false },
  { key: 'member.city', label: 'City', group: 'member', type: 'text', sensitive: false },
  { key: 'member.postalCode', label: 'Postal code', group: 'member', type: 'text', sensitive: false },
  { key: 'member.country', label: 'Country', group: 'member', type: 'text', sensitive: false },
  { key: 'member.fullAddress', label: 'Full address', group: 'member', type: 'multiline', sensitive: false },
  { key: 'member.taxId', label: 'Tax ID', group: 'member', type: 'text', sensitive: true },
  { key: 'member.dateOfBirth', label: 'Date of birth', group: 'member', type: 'date', sensitive: true },
  { key: 'member.idDocumentNumber', label: 'ID document number', group: 'member', type: 'text', sensitive: true },
  { key: 'member.bankDetails', label: 'Bank details', group: 'member', type: 'multiline', sensitive: true },
  { key: 'org.name', label: 'Organization name', group: 'org', type: 'text', sensitive: false },
  { key: 'today', label: 'Today', group: 'system', type: 'date', sensitive: false },
];

/** Lookup index, built once — the catalogue is frozen at module load. */
const SOURCES_BY_KEY = new Map(AUTOFILL_SOURCES.map((source) => [source.key, source]));

/**
 * `undefined` rather than a throw: an unknown key reaches here from stored template data
 * and from client payloads alike, and both callers want to *decide* what to do about it
 * (reject the save, skip the resolution) rather than catch.
 */
export function findAutofillSource(key: string): AutofillSource | undefined {
  return SOURCES_BY_KEY.get((key ?? '').trim());
}

/**
 * Requirement 4: the picker offers only sources whose value type is compatible with the
 * field type — a `date` field cannot bind to `member.fullName`.
 *
 * The table is asymmetric on purpose, and the asymmetry is the whole rule:
 *
 * - `text` and `multiline` fields accept free text: `text`, `multiline`, and `email`. All
 *   three are plain strings the author controls the meaning of, and the only thing at risk
 *   is length, which requirement 10 handles by truncating and flagging. `multiline` is
 *   offered to a single-line `text` field deliberately — the spec's own picker mockup
 *   lists "Member · Full address" for a text field.
 * - **`date` sources are not free text.** They are excluded from `text` and `multiline`
 *   even though an ISO string would render fine, because the spec says so twice: its
 *   picker mockup annotates the date entries "(date — hidden)" under the line "Date
 *   sources are hidden because this is a text field", and TC-03-INT-12 requires a `text`
 *   field bound to `member.dateOfBirth` to be rejected with "This source cannot fill a
 *   text field". The reason behind the rule is that a date's *rendering* belongs to the
 *   field: `2026-08-24` in a text field is a formatting decision nobody made, and the
 *   author who wanted a date should say so in the field type.
 * - `email` accepts only `email`, and `date` accepts only `date`. Those field types carry
 *   a promise about their contents — the fill form validates them, and a `date` input
 *   cannot even display "Alex Kaminski" — so a lax binding would produce a field that is
 *   invalid the moment it is filled (requirement 4's own example).
 * - `number` accepts nothing, because no source in this release resolves to a number. It
 *   is an empty row rather than a missing one so that adding `member.salary` later is a
 *   one-line change here.
 * - `select` and `checkbox` accept nothing at all. Their value must come from a declared
 *   option list or be a boolean; free text from a profile could never match either.
 */
const TYPE_COMPATIBILITY: Record<TemplateFieldType, readonly AutofillValueType[]> = {
  text: ['text', 'multiline', 'email'],
  multiline: ['text', 'multiline', 'email'],
  number: [],
  date: ['date'],
  email: ['email'],
  select: [],
  checkbox: [],
};

export function isTypeCompatible(fieldType: TemplateFieldType, source: AutofillValueType): boolean {
  return (TYPE_COMPATIBILITY[fieldType] ?? []).includes(source);
}

/** What the picker renders for a given field type, in catalogue order (requirement 4). */
export function sourcesForFieldType(fieldType: TemplateFieldType): readonly AutofillSource[] {
  return AUTOFILL_SOURCES.filter((source) => isTypeCompatible(fieldType, source.type));
}

/**
 * Validation rule 9, enforced by the spec 01 field editor and re-run server-side. Not part
 * of the resolver: by the time a template is being resolved the binding is stored data and
 * requirement 7 forbids failing on it, so this runs at *save* time where a mistake can
 * still be corrected. An empty or absent source means "no autofill", which is always valid.
 */
export function validateAutofillSource(
  key: string | null | undefined,
  fieldType: TemplateFieldType,
): FieldResult {
  const value = (key ?? '').trim();
  if (value.length === 0) return { valid: true, value: '' };

  const source = findAutofillSource(value);
  if (source === undefined) return { valid: false, error: PROFILE_MESSAGES.source.unknown };
  if (!isTypeCompatible(fieldType, source.type)) {
    return { valid: false, error: PROFILE_MESSAGES.source.incompatible(fieldType) };
  }
  return { valid: true, value };
}

/* ------------------------------------------------------------------ *
 * Resolution (requirements 6-12)
 * ------------------------------------------------------------------ */

/**
 * The subject's data, flattened across `Account`, `Membership`, and `MemberProfile`.
 *
 * Flat rather than nested because the resolver must not care which table a value came
 * from — that mapping is the API's job, and keeping it out of here means a schema change
 * (spec 05's `Membership.jobTitle`, say) touches one query rather than this module's
 * shape. `null` throughout: requirement 14 says a member with no profile row behaves
 * exactly like a member with an all-null profile, so the caller never has to fabricate one.
 */
export interface AutofillSubject {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  jobTitle: string | null;
  joinedAt: Date | null;
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  dateOfBirth: Date | null;
  idDocumentNumber: string | null;
  bankDetails: string | null;
}

export interface AutofillContext {
  /** `null` when the envelope has no subject (requirement 12) or the member was removed. */
  subject: AutofillSubject | null;
  organizationName: string;
  /** IANA zone; `null` falls back to UTC. Drives `today` only — see `toIsoDate`. */
  timezone: string | null;
  /** Injectable clock, so a test of `today` is not a test of the machine it runs on. */
  now?: Date;
}

const blank = (value: string | null | undefined): string => (value ?? '').trim();

/**
 * Requirement 9, dates to ISO `YYYY-MM-DD`.
 *
 * Two different kinds of value end up here and they must not be treated alike:
 *
 * - A **date-only fact** — `dateOfBirth` — is stored at UTC midnight (see the note on the
 *   Prisma model). Formatting it in, say, `America/Los_Angeles` would render 1991-03-14 as
 *   1991-03-13, silently putting the wrong birthday on a contract. Those are read with the
 *   UTC getters, by passing `timezone: null`.
 * - A **clock reading** — `today`, and `joinedAt`, which is a real timestamp defaulted from
 *   `now()` — is a moment, and requirement 2 says `today` is the server date *in the
 *   organization timezone*. Those pass the zone through.
 *
 * `Intl` is used rather than hand-rolled offset arithmetic because DST makes a fixed offset
 * wrong twice a year; it is part of the language, not a package dependency. An
 * unrecognized zone falls back to UTC rather than throwing — a typo in an org setting must
 * not be able to block a contract.
 */
function toIsoDate(date: Date | null | undefined, timezone: string | null): string {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';

  if (timezone !== null && timezone !== undefined && timezone.trim().length > 0) {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone.trim(),
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);

      const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
      const year = get('year');
      const month = get('month');
      const day = get('day');
      if (year.length > 0 && month.length > 0 && day.length > 0) {
        return `${year.padStart(4, '0')}-${month}-${day}`;
      }
    } catch {
      // Fall through to UTC.
    }
  }

  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Requirement 2: blank parts are skipped, not left as empty lines or stray commas.
 *
 * Joined with `, ` on one line rather than stacked as postal lines, because the value is
 * substituted into running contract prose ("residing at {{contractor_address}}"), where a
 * block of newlines would break the sentence. The catalogue types it `multiline` because
 * `addressLine` itself may contain a line break, not because this function adds one.
 *
 * The country is expanded to its name here, exactly as `member.country` does on its own
 * (requirement 9), so the composed address and the standalone field can never disagree.
 */
export function composeFullAddress(parts: {
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
}): string {
  const ordered = [
    blank(parts?.addressLine),
    blank(parts?.city),
    blank(parts?.postalCode),
    blank(countryName(parts?.country)),
  ];
  // Filtering before joining is what keeps a missing middle part from producing `, ,` and
  // an all-blank input from producing a string of separators.
  return ordered.filter((part) => part.length > 0).join(', ');
}

/**
 * Resolves one catalogue key against a context. Always a string: an unknown key, a null
 * subject, and a null column are all "nothing to fill" (requirement 7), and the caller
 * that cares about the difference — the template editor — uses `validateAutofillSource`
 * at save time instead.
 */
export function resolveAutofillSource(key: string, ctx: AutofillContext): string {
  const subject = ctx?.subject ?? null;
  const timezone = ctx?.timezone ?? null;

  switch ((key ?? '').trim()) {
    case 'member.firstName':
      return blank(subject?.firstName);
    case 'member.lastName':
      return blank(subject?.lastName);
    case 'member.fullName':
      // Not `first + ' ' + last`: a member with only a first name must not resolve to a
      // name with a trailing space, which would then be rendered into a signature block.
      return [blank(subject?.firstName), blank(subject?.lastName)]
        .filter((part) => part.length > 0)
        .join(' ');
    case 'member.email':
      return blank(subject?.email);
    case 'member.jobTitle':
      // Empty until user-management spec 05 adds `Membership.jobTitle`. See the comment
      // on AUTOFILL_SOURCES for why the source exists ahead of the column.
      return blank(subject?.jobTitle);
    case 'member.joinedAt':
      // A timestamp, so the org timezone decides which calendar day it fell on.
      return toIsoDate(subject?.joinedAt ?? null, timezone);
    case 'member.addressLine':
      return blank(subject?.addressLine);
    case 'member.city':
      return blank(subject?.city);
    case 'member.postalCode':
      return blank(subject?.postalCode);
    case 'member.country':
      return blank(countryName(subject?.country ?? null));
    case 'member.fullAddress':
      return composeFullAddress({
        addressLine: subject?.addressLine ?? null,
        city: subject?.city ?? null,
        postalCode: subject?.postalCode ?? null,
        country: subject?.country ?? null,
      });
    case 'member.taxId':
      return blank(subject?.taxId);
    case 'member.dateOfBirth':
      // A date-only fact stored at UTC midnight — never re-zoned. See `toIsoDate`.
      return toIsoDate(subject?.dateOfBirth ?? null, null);
    case 'member.idDocumentNumber':
      return blank(subject?.idDocumentNumber);
    case 'member.bankDetails':
      return blank(subject?.bankDetails);
    case 'org.name':
      return blank(ctx?.organizationName);
    case 'today':
      return toIsoDate(ctx?.now ?? new Date(), timezone);
    default:
      return '';
  }
}

export interface ResolvedField {
  key: string;
  value: string;
  truncated: boolean;
}

/**
 * Requirements 6-11: resolve every bound field once, at envelope creation.
 *
 * Deliberately ignores `filledBy` (requirement 6) — a signer-owned field with a source
 * arrives pre-filled and the signer may correct it, so ownership is a write rule, not a
 * resolution rule.
 *
 * Never throws. Only bound fields appear in `values`, and a bound field that resolved to
 * nothing appears with an empty string rather than being omitted: the fill form needs to
 * tell "the profile has no bank details" (a gap, requirement 7) from "this field was never
 * bound", and an absent key cannot carry that distinction. `autofilled` lists only the
 * keys that actually received a value, because it drives the ⟲ marker (requirement 11) and
 * marking an empty input as autofilled would be a lie.
 */
export function resolveAutofill(
  fields: readonly {
    key: string;
    type: TemplateFieldType;
    maxLength: number | null;
    autofillSource: string | null;
  }[],
  ctx: AutofillContext,
): { values: Record<string, string>; autofilled: string[]; truncated: string[] } {
  const values: Record<string, string> = {};
  const autofilled: string[] = [];
  const truncated: string[] = [];

  for (const field of fields ?? []) {
    const sourceKey = blank(field?.autofillSource);
    if (sourceKey.length === 0) continue;

    const source = findAutofillSource(sourceKey);
    // An unknown key, or one that is type-incompatible, is stale template data — a source
    // renamed or a field type changed after the binding was made. Both are skipped rather
    // than resolved: writing a name into a `date` field would produce a draft the fill
    // form immediately rejects, and requirement 7 forbids failing the creation outright.
    if (source === undefined) continue;
    if (!isTypeCompatible(field.type, source.type)) continue;

    const resolved = resolveAutofillSource(sourceKey, ctx);
    values[field.key] = resolved;
    if (resolved.length === 0) continue;

    const max = field.maxLength;
    if (typeof max === 'number' && Number.isFinite(max) && max > 0 && resolved.length > max) {
      // Requirement 10: stored truncated *and* flagged. Storing the full value would break
      // the field's own contract with the fill form; dropping it entirely would lose data
      // the sender can repair. Truncate, and tell them.
      values[field.key] = resolved.slice(0, max);
      truncated.push(field.key);
    }

    autofilled.push(field.key);
  }

  return { values, autofilled, truncated };
}

/* ------------------------------------------------------------------ *
 * PII masking (requirements 19-22)
 * ------------------------------------------------------------------ */

/** Requirement 19. The four values every read of which needs `ViewMemberProfilePii`. */
export const SENSITIVE_PROFILE_FIELDS: readonly string[] = [
  'taxId',
  'dateOfBirth',
  'idDocumentNumber',
  'bankDetails',
];

export const MASKS = {
  bankDetails: '••••',
} as const;

/**
 * The prefix for a partially masked identifier. Three asterisks, then at most the last
 * four characters — the shape the spec's screens show (`***4567`).
 */
const MASK_PREFIX = '***';
const MASK_WINDOW = 4;

/**
 * Requirement 20. `taxId`/`idDocumentNumber` → `***last4`, `dateOfBirth` → year only,
 * `bankDetails` → `••••`.
 *
 * A value shorter than the window is masked *entirely* rather than partially: `"123"`
 * becomes `***`, not `***123`. Masking three of three characters would be theatre, and the
 * spec's own test case asks for a value that leaks no digits.
 *
 * `null` stays `null` and `''` stays `''` — an absent value is not a secret, and turning
 * one into a mask would make the empty state (`profile-empty`) unreachable and offer the
 * UI a fake value to render. Non-sensitive fields are returned untouched, so a caller can
 * map the whole profile through this function without listing which fields to skip.
 */
export function maskProfileValue(field: string, value: string | null): string | null {
  if (value === null || value === undefined) return null;
  if (!SENSITIVE_PROFILE_FIELDS.includes(field)) return value;

  const raw = String(value);
  if (raw.trim().length === 0) return raw;

  if (field === 'bankDetails') return MASKS.bankDetails;

  if (field === 'dateOfBirth') {
    // Stored and transported as ISO `YYYY-MM-DD`; the year is the leading four digits.
    const year = /^(\d{4})\b/.exec(raw.trim());
    // Anything else is a malformed date rather than a birth year, and guessing at it could
    // expose the day. Fall back to the opaque mask.
    return year === null ? MASKS.bankDetails : year[1];
  }

  const trimmed = raw.trim();
  if (trimmed.length <= MASK_WINDOW) return MASK_PREFIX;
  return MASK_PREFIX + trimmed.slice(-MASK_WINDOW);
}

/**
 * Requirement 22: a `PUT` carrying a mask for a field the caller cannot read must leave
 * that field unchanged rather than storing `***4567`.
 *
 * This is a recognizer for the *shape* a mask takes, not a comparison against the stored
 * value, and that is on purpose: the server must reject a mask even when it does not match
 * the current value — a stale client can hold `***4567` from before the tax id changed,
 * and storing it would still be corruption.
 *
 * Each shape is unambiguous against a legitimate value. `taxId` and `idDocumentNumber`
 * permit letters, digits, hyphens, and spaces (validation rule 5), so a leading `***`
 * cannot be real input. A `dateOfBirth` is submitted as a full ISO date, so a bare year is
 * always a mask. Bank details are free-form, so only the exact mask string counts — a
 * caller who genuinely wants to store four bullets is out of luck, and that is the right
 * trade against silently overwriting an IBAN.
 */
export function isMaskedValue(field: string, value: string): boolean {
  if (typeof value !== 'string') return false;
  if (!SENSITIVE_PROFILE_FIELDS.includes(field)) return false;

  const trimmed = value.trim();
  if (field === 'bankDetails') return trimmed === MASKS.bankDetails;
  if (field === 'dateOfBirth') return /^\d{4}$/.test(trimmed) || trimmed === MASKS.bankDetails;
  return trimmed.startsWith(MASK_PREFIX);
}

/* ------------------------------------------------------------------ *
 * Profile validation (Validation Rules 1-8, Error Messages)
 * ------------------------------------------------------------------ */

/**
 * Every string is verbatim from the spec's "Error Messages" table, so a sentence can never
 * drift between the client form, the API response, and the E2E assertions. Parameterized
 * rows are functions rather than templates-with-placeholders for the same reason: there is
 * exactly one place that knows how the sentence is assembled.
 */
export const PROFILE_MESSAGES = {
  addressLine: {
    tooLong: 'Address must be at most 200 characters',
  },
  city: {
    tooLong: 'City must be at most 100 characters',
  },
  postalCode: {
    tooLong: 'Postal code must be at most 20 characters',
  },
  country: {
    invalid: 'Enter a valid country',
  },
  taxId: {
    tooLong: 'Tax ID must be at most 40 characters',
    invalidChars: 'Tax ID contains invalid characters',
  },
  dateOfBirth: {
    invalid: 'Enter a valid date',
    future: 'Date of birth cannot be in the future',
    tooRecent: 'Date of birth must be at least 16 years ago',
  },
  idDocumentNumber: {
    tooLong: 'ID document number must be at most 40 characters',
  },
  bankDetails: {
    tooLong: 'Bank details must be at most 500 characters',
  },
  source: {
    unknown: 'Unknown autofill source',
    incompatible: (type: string) => `This source cannot fill a ${type} field`,
  },
  subject: {
    missing: 'The selected member no longer exists',
  },
  permission: {
    view: 'You do not have permission to view these details',
    edit: 'You do not have permission to edit these details',
  },
  masked: {
    hint: 'Some values are hidden. Ask an admin if you need them.',
  },
  autofill: {
    gaps: (n: number, list: string) =>
      `${n} field(s) could not be filled — this member's profile has no ${list}`,
    truncated: 'This value was shortened to fit. Check it before sending.',
  },
  toast: {
    saved: 'Contract details saved',
  },
  generic: {
    networkError: 'Something went wrong. Please try again.',
    emptyState: 'No contract details yet. Add them to fill contracts automatically.',
    /** Not in the table — a defensive message for a field name the API does not know.
     *  Reachable only from a hand-written request, never from the form. */
    unknownField: 'Unknown field',
  },
} as const;

export const PROFILE_LIMITS = {
  addressLineMax: 200,
  cityMax: 100,
  postalCodeMax: 20,
  taxIdMax: 40,
  idDocumentNumberMax: 40,
  bankDetailsMax: 500,
} as const;

/** Validation rule 5: letters (any script — a УНП is as valid as an EIN), digits, hyphens, spaces. */
const TAX_ID_PATTERN = /^[\p{L}\p{N}\- ]+$/u;

/** Requirement 6: a member must be at least 16, which is also the floor on a signable contract. */
const MINIMUM_AGE_YEARS = 16;

const ok = (value: string): FieldResult => ({ valid: true, value });
const fail = (error: string): FieldResult => ({ valid: false, error });

/**
 * Coerces the `unknown` that arrives from a JSON body. `null` and `undefined` both mean
 * "cleared" (requirement 16: every field is optional), and a non-string is neither a value
 * nor a clear — it is stringified so the length and pattern rules get to reject it with a
 * sentence the user can act on, rather than a type error nobody sees.
 */
function asOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

/** ISO `YYYY-MM-DD`, parsed as UTC midnight to match how the column is stored. */
function parseIsoDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  // Round-trip check: `Date.UTC` happily rolls 2026-02-31 over into March, and a birthday
  // that silently moves is worse than a rejected one.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date;
}

/**
 * Validation rules 1-8, one field at a time — the shape the form needs for on-blur
 * validation and the shape the API needs to build `{ errors: { country: "…" } }`.
 *
 * `now` is injectable so the age rules are testable without freezing the system clock.
 */
export function validateProfileField(field: string, value: unknown, now: Date = new Date()): FieldResult {
  const input = asOptionalString(value);
  // A cleared field is always valid — explicit `null` clears, per the PUT contract.
  if (input === null || input.length === 0) return ok('');

  switch (field) {
    case 'addressLine':
      return input.length > PROFILE_LIMITS.addressLineMax
        ? fail(PROFILE_MESSAGES.addressLine.tooLong)
        : ok(input);

    case 'city':
      return input.length > PROFILE_LIMITS.cityMax ? fail(PROFILE_MESSAGES.city.tooLong) : ok(input);

    case 'postalCode':
      return input.length > PROFILE_LIMITS.postalCodeMax
        ? fail(PROFILE_MESSAGES.postalCode.tooLong)
        : ok(input);

    case 'country':
      return validateCountryCode(input);

    case 'taxId':
      // Length first: an over-long value is usually a paste accident, and telling someone
      // their 400-character paste "contains invalid characters" would send them hunting.
      if (input.length > PROFILE_LIMITS.taxIdMax) return fail(PROFILE_MESSAGES.taxId.tooLong);
      if (!TAX_ID_PATTERN.test(input)) return fail(PROFILE_MESSAGES.taxId.invalidChars);
      return ok(input);

    case 'dateOfBirth': {
      const date = parseIsoDate(input);
      if (date === null) return fail(PROFILE_MESSAGES.dateOfBirth.invalid);
      if (date.getTime() > now.getTime()) return fail(PROFILE_MESSAGES.dateOfBirth.future);
      const sixteenthBirthday = new Date(
        Date.UTC(
          date.getUTCFullYear() + MINIMUM_AGE_YEARS,
          date.getUTCMonth(),
          date.getUTCDate(),
        ),
      );
      if (sixteenthBirthday.getTime() > now.getTime()) {
        return fail(PROFILE_MESSAGES.dateOfBirth.tooRecent);
      }
      return ok(input);
    }

    case 'idDocumentNumber':
      return input.length > PROFILE_LIMITS.idDocumentNumberMax
        ? fail(PROFILE_MESSAGES.idDocumentNumber.tooLong)
        : ok(input);

    case 'bankDetails':
      return input.length > PROFILE_LIMITS.bankDetailsMax
        ? fail(PROFILE_MESSAGES.bankDetails.tooLong)
        : ok(input);

    default:
      return fail(PROFILE_MESSAGES.generic.unknownField);
  }
}

/**
 * Requirement 17: stored as an ISO 3166-1 alpha-2 code, displayed as a name. Case is
 * normalized up, so a form that sends `by` stores `BY` — rejecting a lowercase code would
 * be pedantry, not validation.
 */
export function validateCountryCode(v: string | null | undefined): FieldResult {
  const value = (v ?? '').trim().toUpperCase();
  if (value.length === 0) return ok('');
  if (!Object.prototype.hasOwnProperty.call(COUNTRY_NAMES, value)) {
    return fail(PROFILE_MESSAGES.country.invalid);
  }
  return ok(value);
}

/**
 * Requirement 9's "country codes expanded to names".
 *
 * An unknown code returns **the code itself**, not `null`. A document that renders `BY` is
 * slightly awkward; a document that silently drops the country from an address is wrong,
 * and the value came from a row that passed `validateCountryCode` at write time — so if it
 * is unrecognized now, the table is behind the data, not the other way round. Only a truly
 * absent code returns `null`.
 */
export function countryName(code: string | null | undefined): string | null {
  const value = (code ?? '').trim().toUpperCase();
  if (value.length === 0) return null;
  return COUNTRY_NAMES[value] ?? value;
}

/* ------------------------------------------------------------------ *
 * ISO 3166-1 alpha-2 (requirement 17)
 *
 * All 249 officially assigned codes, kept at the bottom so it does not bury the logic
 * above. Complete rather than partial on purpose: a short list is a support ticket waiting
 * for the first member who lives somewhere the author did not think of, and "Enter a valid
 * country" is a maddening error to receive about the country you live in. English short
 * names; localization of the display name is not in scope for this release.
 * ------------------------------------------------------------------ */

const COUNTRY_NAMES: Record<string, string> = {
  AD: 'Andorra',
  AE: 'United Arab Emirates',
  AF: 'Afghanistan',
  AG: 'Antigua and Barbuda',
  AI: 'Anguilla',
  AL: 'Albania',
  AM: 'Armenia',
  AO: 'Angola',
  AQ: 'Antarctica',
  AR: 'Argentina',
  AS: 'American Samoa',
  AT: 'Austria',
  AU: 'Australia',
  AW: 'Aruba',
  AX: 'Åland Islands',
  AZ: 'Azerbaijan',
  BA: 'Bosnia and Herzegovina',
  BB: 'Barbados',
  BD: 'Bangladesh',
  BE: 'Belgium',
  BF: 'Burkina Faso',
  BG: 'Bulgaria',
  BH: 'Bahrain',
  BI: 'Burundi',
  BJ: 'Benin',
  BL: 'Saint Barthélemy',
  BM: 'Bermuda',
  BN: 'Brunei Darussalam',
  BO: 'Bolivia',
  BQ: 'Bonaire, Sint Eustatius and Saba',
  BR: 'Brazil',
  BS: 'Bahamas',
  BT: 'Bhutan',
  BV: 'Bouvet Island',
  BW: 'Botswana',
  BY: 'Belarus',
  BZ: 'Belize',
  CA: 'Canada',
  CC: 'Cocos (Keeling) Islands',
  CD: 'Congo, Democratic Republic of the',
  CF: 'Central African Republic',
  CG: 'Congo',
  CH: 'Switzerland',
  CI: "Côte d'Ivoire",
  CK: 'Cook Islands',
  CL: 'Chile',
  CM: 'Cameroon',
  CN: 'China',
  CO: 'Colombia',
  CR: 'Costa Rica',
  CU: 'Cuba',
  CV: 'Cabo Verde',
  CW: 'Curaçao',
  CX: 'Christmas Island',
  CY: 'Cyprus',
  CZ: 'Czechia',
  DE: 'Germany',
  DJ: 'Djibouti',
  DK: 'Denmark',
  DM: 'Dominica',
  DO: 'Dominican Republic',
  DZ: 'Algeria',
  EC: 'Ecuador',
  EE: 'Estonia',
  EG: 'Egypt',
  EH: 'Western Sahara',
  ER: 'Eritrea',
  ES: 'Spain',
  ET: 'Ethiopia',
  FI: 'Finland',
  FJ: 'Fiji',
  FK: 'Falkland Islands',
  FM: 'Micronesia',
  FO: 'Faroe Islands',
  FR: 'France',
  GA: 'Gabon',
  GB: 'United Kingdom',
  GD: 'Grenada',
  GE: 'Georgia',
  GF: 'French Guiana',
  GG: 'Guernsey',
  GH: 'Ghana',
  GI: 'Gibraltar',
  GL: 'Greenland',
  GM: 'Gambia',
  GN: 'Guinea',
  GP: 'Guadeloupe',
  GQ: 'Equatorial Guinea',
  GR: 'Greece',
  GS: 'South Georgia and the South Sandwich Islands',
  GT: 'Guatemala',
  GU: 'Guam',
  GW: 'Guinea-Bissau',
  GY: 'Guyana',
  HK: 'Hong Kong',
  HM: 'Heard Island and McDonald Islands',
  HN: 'Honduras',
  HR: 'Croatia',
  HT: 'Haiti',
  HU: 'Hungary',
  ID: 'Indonesia',
  IE: 'Ireland',
  IL: 'Israel',
  IM: 'Isle of Man',
  IN: 'India',
  IO: 'British Indian Ocean Territory',
  IQ: 'Iraq',
  IR: 'Iran',
  IS: 'Iceland',
  IT: 'Italy',
  JE: 'Jersey',
  JM: 'Jamaica',
  JO: 'Jordan',
  JP: 'Japan',
  KE: 'Kenya',
  KG: 'Kyrgyzstan',
  KH: 'Cambodia',
  KI: 'Kiribati',
  KM: 'Comoros',
  KN: 'Saint Kitts and Nevis',
  KP: "Korea, Democratic People's Republic of",
  KR: 'Korea, Republic of',
  KW: 'Kuwait',
  KY: 'Cayman Islands',
  KZ: 'Kazakhstan',
  LA: "Lao People's Democratic Republic",
  LB: 'Lebanon',
  LC: 'Saint Lucia',
  LI: 'Liechtenstein',
  LK: 'Sri Lanka',
  LR: 'Liberia',
  LS: 'Lesotho',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  LV: 'Latvia',
  LY: 'Libya',
  MA: 'Morocco',
  MC: 'Monaco',
  MD: 'Moldova',
  ME: 'Montenegro',
  MF: 'Saint Martin (French part)',
  MG: 'Madagascar',
  MH: 'Marshall Islands',
  MK: 'North Macedonia',
  ML: 'Mali',
  MM: 'Myanmar',
  MN: 'Mongolia',
  MO: 'Macao',
  MP: 'Northern Mariana Islands',
  MQ: 'Martinique',
  MR: 'Mauritania',
  MS: 'Montserrat',
  MT: 'Malta',
  MU: 'Mauritius',
  MV: 'Maldives',
  MW: 'Malawi',
  MX: 'Mexico',
  MY: 'Malaysia',
  MZ: 'Mozambique',
  NA: 'Namibia',
  NC: 'New Caledonia',
  NE: 'Niger',
  NF: 'Norfolk Island',
  NG: 'Nigeria',
  NI: 'Nicaragua',
  NL: 'Netherlands',
  NO: 'Norway',
  NP: 'Nepal',
  NR: 'Nauru',
  NU: 'Niue',
  NZ: 'New Zealand',
  OM: 'Oman',
  PA: 'Panama',
  PE: 'Peru',
  PF: 'French Polynesia',
  PG: 'Papua New Guinea',
  PH: 'Philippines',
  PK: 'Pakistan',
  PL: 'Poland',
  PM: 'Saint Pierre and Miquelon',
  PN: 'Pitcairn',
  PR: 'Puerto Rico',
  PS: 'Palestine, State of',
  PT: 'Portugal',
  PW: 'Palau',
  PY: 'Paraguay',
  QA: 'Qatar',
  RE: 'Réunion',
  RO: 'Romania',
  RS: 'Serbia',
  RU: 'Russian Federation',
  RW: 'Rwanda',
  SA: 'Saudi Arabia',
  SB: 'Solomon Islands',
  SC: 'Seychelles',
  SD: 'Sudan',
  SE: 'Sweden',
  SG: 'Singapore',
  SH: 'Saint Helena, Ascension and Tristan da Cunha',
  SI: 'Slovenia',
  SJ: 'Svalbard and Jan Mayen',
  SK: 'Slovakia',
  SL: 'Sierra Leone',
  SM: 'San Marino',
  SN: 'Senegal',
  SO: 'Somalia',
  SR: 'Suriname',
  SS: 'South Sudan',
  ST: 'Sao Tome and Principe',
  SV: 'El Salvador',
  SX: 'Sint Maarten (Dutch part)',
  SY: 'Syrian Arab Republic',
  SZ: 'Eswatini',
  TC: 'Turks and Caicos Islands',
  TD: 'Chad',
  TF: 'French Southern Territories',
  TG: 'Togo',
  TH: 'Thailand',
  TJ: 'Tajikistan',
  TK: 'Tokelau',
  TL: 'Timor-Leste',
  TM: 'Turkmenistan',
  TN: 'Tunisia',
  TO: 'Tonga',
  TR: 'Türkiye',
  TT: 'Trinidad and Tobago',
  TV: 'Tuvalu',
  TW: 'Taiwan',
  TZ: 'Tanzania',
  UA: 'Ukraine',
  UG: 'Uganda',
  UM: 'United States Minor Outlying Islands',
  US: 'United States',
  UY: 'Uruguay',
  UZ: 'Uzbekistan',
  VA: 'Holy See',
  VC: 'Saint Vincent and the Grenadines',
  VE: 'Venezuela',
  VG: 'Virgin Islands (British)',
  VI: 'Virgin Islands (U.S.)',
  VN: 'Viet Nam',
  VU: 'Vanuatu',
  WF: 'Wallis and Futuna',
  WS: 'Samoa',
  YE: 'Yemen',
  YT: 'Mayotte',
  ZA: 'South Africa',
  ZM: 'Zambia',
  ZW: 'Zimbabwe',
};

/** Exposed for a country `Select`; sorted by name, which is the order a human scans. */
export const COUNTRY_OPTIONS: readonly { code: string; name: string }[] = Object.entries(
  COUNTRY_NAMES,
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

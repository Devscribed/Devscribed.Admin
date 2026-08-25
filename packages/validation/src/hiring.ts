/**
 * Hiring validation — the rules the public booking page and the API must agree on,
 * plus the vacancy rules the admin dialog and the API share.
 *
 * Every message below is verbatim from the "Error Messages" tables of
 * `specs/hiring/01-vacancies.md` and `specs/hiring/02-booking-page.md`. The client's
 * copy is a convenience; the API re-runs all of it, which is the gate.
 */

// Only referenced from inside function bodies. `index.ts` re-exports this module at the
// end of its own body, so nothing here may read a value from it at module-eval time.
import { normalizeEmail, validateEmail, type FieldResult } from './index';

/* ------------------------------------------------------------------ *
 * Roles
 * ------------------------------------------------------------------ */

/** The organization's four roles (user-management spec 01). Hiring adds none. */
export const ORG_ROLES = ['admin', 'manager', 'user', 'viewer'] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

/** Create, edit, close, boards, libraries — the whole authenticated hiring surface. */
export const HIRING_MANAGE_ROLES: readonly string[] = ['admin', 'manager'];

/**
 * `viewer` is absent deliberately: a viewer may not be assigned an interview
 * (hiring README, permission matrix), so they are never listed in the picker.
 */
export const INTERVIEWER_ROLES: readonly string[] = ['admin', 'manager', 'user'];

export const canManageHiring = (role: string): boolean => HIRING_MANAGE_ROLES.includes(role);

export const canBeInterviewer = (role: string): boolean => INTERVIEWER_ROLES.includes(role);

/* ------------------------------------------------------------------ *
 * Messages
 * ------------------------------------------------------------------ */

export const HIRING_MESSAGES = {
  vacancy: {
    title: {
      required: 'Title is required',
      tooLong: 'Title must be at most 100 characters',
    },
    description: {
      tooLong: 'Description must be at most 5000 characters',
    },
    interviewer: {
      required: 'Choose an interviewer',
      /** Shown against the disabled option in the picker. */
      ineligibleOption: 'No Microsoft 365 mailbox',
      /** Returned by the server when the mailbox no longer resolves. */
      ineligible: 'This member has no Microsoft 365 mailbox',
    },
    duration: {
      required: 'Choose an interview length',
    },
    deleteBlocked: 'Close this vacancy instead — it has candidates',
    forbidden: 'You do not have permission to manage vacancies',
    empty: 'No vacancies yet.',
  },
  booking: {
    firstName: {
      required: 'First name is required',
      tooLong: 'Must be at most 50 characters',
    },
    lastName: {
      required: 'Last name is required',
      tooLong: 'Must be at most 50 characters',
    },
    cv: {
      required: 'Please attach your CV',
      unsupportedType: 'Unsupported file type. Accepted: .pdf, .doc, .docx, .rtf, .txt',
      tooLarge: 'File is too large (max 10 MB)',
      empty: 'The attached file is empty',
    },
    note: {
      tooLong: 'Please keep this under 2000 characters',
    },
    slotRequired: 'Choose a time',
    slotTaken: 'That time was just booked. Please choose another.',
    vacancyClosed: 'This position is no longer accepting applications',
    failed: "We couldn't complete your booking. Please try again.",
    availabilityFailed: "We couldn't load available times. Try again.",
    notFound: "This link doesn't lead anywhere.",
  },
  toast: {
    vacancyCreated: 'Vacancy created',
    vacancyUpdated: 'Vacancy updated',
    vacancyClosed: 'Vacancy closed',
    vacancyReopened: 'Vacancy reopened',
    linkCopied: 'Booking link copied',
  },
} as const;

/* ------------------------------------------------------------------ *
 * Vacancy — spec 01
 * ------------------------------------------------------------------ */

export const VACANCY_LIMITS = {
  titleMax: 100,
  descriptionMax: 5000,
} as const;

/** The only four interview lengths. Anything else is rejected server-side (01 §01.1). */
export const VACANCY_DURATIONS = [15, 30, 45, 60] as const;
export type VacancyDuration = (typeof VACANCY_DURATIONS)[number];

export type VacancyStatus = 'open' | 'closed';

const ok = (value: string): FieldResult => ({ valid: true, value });
const fail = (error: string): FieldResult => ({ valid: false, error });

export function validateVacancyTitle(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(HIRING_MESSAGES.vacancy.title.required);
  if (value.length > VACANCY_LIMITS.titleMax) return fail(HIRING_MESSAGES.vacancy.title.tooLong);
  return ok(value);
}

/** Optional: absent and empty are both valid, and both store as an empty description. */
export function validateVacancyDescription(input: string | null | undefined): FieldResult {
  const value = (input ?? '').trim();
  if (value.length > VACANCY_LIMITS.descriptionMax) {
    return fail(HIRING_MESSAGES.vacancy.description.tooLong);
  }
  return ok(value);
}

export type DurationResult =
  | { valid: true; value: VacancyDuration }
  | { valid: false; error: string };

/**
 * Takes `unknown` on purpose. A JSON body can carry `"60"`, and a string that merely
 * looks like a duration is still not one — coercing it here would let the API accept a
 * shape the UI cannot produce (TC-H01-UNIT-02).
 */
export function validateDurationMinutes(input: unknown): DurationResult {
  const match = VACANCY_DURATIONS.find((allowed) => allowed === input);
  if (match === undefined) return { valid: false, error: HIRING_MESSAGES.vacancy.duration.required };
  return { valid: true, value: match };
}

export function validateInterviewerAccountId(input: unknown): FieldResult {
  const value = typeof input === 'string' ? input.trim() : '';
  if (value.length === 0) return fail(HIRING_MESSAGES.vacancy.interviewer.required);
  return ok(value);
}

export type VacancyField = 'title' | 'interviewerAccountId' | 'durationMinutes' | 'description';

/** Top-to-bottom order in the dialog — drives focus when a submit is blocked. */
export const VACANCY_FIELD_ORDER: readonly VacancyField[] = [
  'title',
  'interviewerAccountId',
  'durationMinutes',
  'description',
];

export interface VacancyInput {
  title: string;
  interviewerAccountId: string;
  durationMinutes: unknown;
  description?: string | null;
}

export interface VacancyValidation {
  valid: boolean;
  errors: Partial<Record<VacancyField, string>>;
  firstInvalidField: VacancyField | null;
  value: {
    title: string;
    interviewerAccountId: string;
    durationMinutes: VacancyDuration | null;
    description: string;
  };
}

export function validateVacancy(input: Partial<VacancyInput>): VacancyValidation {
  const errors: Partial<Record<VacancyField, string>> = {};

  const title = validateVacancyTitle(input.title ?? '');
  if (!title.valid) errors.title = title.error;

  const interviewer = validateInterviewerAccountId(input.interviewerAccountId);
  if (!interviewer.valid) errors.interviewerAccountId = interviewer.error;

  const duration = validateDurationMinutes(input.durationMinutes);
  if (!duration.valid) errors.durationMinutes = duration.error;

  const description = validateVacancyDescription(input.description);
  if (!description.valid) errors.description = description.error;

  const firstInvalidField = VACANCY_FIELD_ORDER.find((field) => errors[field]) ?? null;

  return {
    valid: firstInvalidField === null,
    errors,
    firstInvalidField,
    value: {
      title: title.valid ? title.value : (input.title ?? ''),
      interviewerAccountId: interviewer.valid ? interviewer.value : '',
      durationMinutes: duration.valid ? duration.value : null,
      description: description.valid ? description.value : '',
    },
  };
}

/* ------------------------------------------------------------------ *
 * Public slug — spec 01 §01.2
 * ------------------------------------------------------------------ */

/** `slugify(title)` when the title yields nothing slug-safe (01 §01.2). */
export const SLUG_BASE_FALLBACK = 'vacancy';

/**
 * The base is truncated so a 200-character title cannot produce an unusable URL. The
 * suffix is never truncated — it is the part that carries the entropy.
 */
export const SLUG_BASE_MAX = 60;

/** 9 random bytes → 12 base64url characters → 72 bits, exactly as the spec states. */
export const SLUG_SUFFIX_BYTES = 9;
export const SLUG_SUFFIX_LENGTH = 12;

/** Base, separator, suffix. The documented cap a stored slug never exceeds. */
export const SLUG_MAX_LENGTH = SLUG_BASE_MAX + 1 + SLUG_SUFFIX_LENGTH;

const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * Lowercase ASCII words joined by hyphens. Accented Latin folds to its base letter;
 * anything with no ASCII form at all (Cyrillic, CJK) drops out, which is what makes
 * the fallback necessary rather than decorative.
 */
export function slugifyTitle(title: string): string {
  const folded = (title ?? '')
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (folded.length === 0) return SLUG_BASE_FALLBACK;

  // Truncating can leave a trailing hyphen mid-word; the separator adds its own.
  const truncated = folded.slice(0, SLUG_BASE_MAX).replace(/-+$/g, '');
  return truncated.length === 0 ? SLUG_BASE_FALLBACK : truncated;
}

const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** 9 bytes divide evenly into 12 base64 characters, so there is never any padding. */
function toBase64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const triple = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
    out +=
      BASE64URL[(triple >> 18) & 63] +
      BASE64URL[(triple >> 12) & 63] +
      BASE64URL[(triple >> 6) & 63] +
      BASE64URL[triple & 63];
  }
  return out;
}

/**
 * Web Crypto rather than node's `crypto.randomBytes`: this module is bundled into the
 * browser alongside the booking form, and a node-only import would break that build.
 */
export function randomSlugSuffix(): string {
  const bytes = new Uint8Array(SLUG_SUFFIX_BYTES);
  globalThis.crypto.getRandomValues(bytes);
  return toBase64Url(bytes);
}

/**
 * Generated once, at creation, and frozen: renaming a vacancy must never invalidate a
 * link that has already been sent (01 §01.2).
 */
export function generateVacancySlug(title: string): string {
  return `${slugifyTitle(title)}-${randomSlugSuffix()}`;
}

/* ------------------------------------------------------------------ *
 * Booking — spec 02
 * ------------------------------------------------------------------ */

export const BOOKING_LIMITS = {
  personNameMax: 50,
  noteMax: 2000,
  cvMaxBytes: 10 * 1024 * 1024,
} as const;

export const CV_EXTENSIONS = ['.pdf', '.doc', '.docx', '.rtf', '.txt'] as const;

/** The `accept` attribute for the file chooser — same list, one source. */
export const CV_ACCEPT = CV_EXTENSIONS.join(',');

export function validateCandidateFirstName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(HIRING_MESSAGES.booking.firstName.required);
  if (value.length > BOOKING_LIMITS.personNameMax) {
    return fail(HIRING_MESSAGES.booking.firstName.tooLong);
  }
  return ok(value);
}

export function validateCandidateLastName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(HIRING_MESSAGES.booking.lastName.required);
  if (value.length > BOOKING_LIMITS.personNameMax) {
    return fail(HIRING_MESSAGES.booking.lastName.tooLong);
  }
  return ok(value);
}

export function validateBookingNote(input: string | null | undefined): FieldResult {
  const value = (input ?? '').trim();
  if (value.length > BOOKING_LIMITS.noteMax) return fail(HIRING_MESSAGES.booking.note.tooLong);
  return ok(value);
}

export interface CvCandidate {
  fileName: string;
  sizeBytes: number;
}

export type CvResult = { valid: true } | { valid: false; error: string };

export function cvExtension(fileName: string): string {
  const dot = (fileName ?? '').lastIndexOf('.');
  return dot === -1 ? '' : fileName.slice(dot).toLowerCase();
}

/**
 * Order matters: an unsupported type is reported before a size problem, so a 20 MB
 * `.pages` file is told the truth about why it cannot be accepted.
 */
export function validateCv(file: CvCandidate | null | undefined): CvResult {
  if (!file || !file.fileName) return { valid: false, error: HIRING_MESSAGES.booking.cv.required };

  const extension = cvExtension(file.fileName);
  if (!CV_EXTENSIONS.includes(extension as (typeof CV_EXTENSIONS)[number])) {
    return { valid: false, error: HIRING_MESSAGES.booking.cv.unsupportedType };
  }
  if (!file.sizeBytes || file.sizeBytes <= 0) {
    return { valid: false, error: HIRING_MESSAGES.booking.cv.empty };
  }
  if (file.sizeBytes > BOOKING_LIMITS.cvMaxBytes) {
    return { valid: false, error: HIRING_MESSAGES.booking.cv.tooLarge };
  }
  return { valid: true };
}

export type BookingField = 'firstName' | 'lastName' | 'email' | 'cv' | 'note';

/** Top-to-bottom order on the booking form. */
export const BOOKING_FIELD_ORDER: readonly BookingField[] = [
  'firstName',
  'lastName',
  'email',
  'cv',
  'note',
];

export interface BookingInput {
  firstName: string;
  lastName: string;
  email: string;
  note?: string | null;
  cv?: CvCandidate | null;
}

export interface BookingValidation {
  valid: boolean;
  errors: Partial<Record<BookingField, string>>;
  firstInvalidField: BookingField | null;
  value: { firstName: string; lastName: string; email: string; note: string };
}

export function validateBooking(input: Partial<BookingInput>): BookingValidation {
  const errors: Partial<Record<BookingField, string>> = {};

  const firstName = validateCandidateFirstName(input.firstName ?? '');
  if (!firstName.valid) errors.firstName = firstName.error;

  const lastName = validateCandidateLastName(input.lastName ?? '');
  if (!lastName.valid) errors.lastName = lastName.error;

  const email = validateEmail(input.email ?? '');
  if (!email.valid) errors.email = email.error;

  const cv = validateCv(input.cv);
  if (!cv.valid) errors.cv = cv.error;

  const note = validateBookingNote(input.note);
  if (!note.valid) errors.note = note.error;

  const firstInvalidField = BOOKING_FIELD_ORDER.find((field) => errors[field]) ?? null;

  return {
    valid: firstInvalidField === null,
    errors,
    firstInvalidField,
    value: {
      firstName: firstName.valid ? firstName.value : (input.firstName ?? ''),
      lastName: lastName.valid ? lastName.value : (input.lastName ?? ''),
      email: normalizeEmail(input.email ?? ''),
      note: note.valid ? note.value : (input.note ?? ''),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Application status — spec 05 §01
 * ------------------------------------------------------------------ */

/**
 * The board's five columns. `Application.status` **is** the column — there is no
 * mirrored field to keep in sync (05 §01.2). Declared here because a booking writes
 * `scheduled` long before the board itself exists.
 */
export const APPLICATION_STATUSES = ['scheduled', 'didnt_pass', 'maybe', 'passed', 'offer'] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

/** Columns number independently, in clean multiples (05 §03.8). */
export const POSITION_STEP = 1000;

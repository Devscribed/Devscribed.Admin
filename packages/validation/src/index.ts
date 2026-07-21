/**
 * Signup validation — the single source of truth shared by the Next.js form and the
 * NestJS API, so a message can never drift between client and server.
 *
 * Every message below is verbatim from spec 01 (Functional Requirement 14).
 */

export const MESSAGES = {
  orgName: {
    required: 'Organization name is required',
    tooLong: 'Organization name must be at most 100 characters',
  },
  firstName: {
    required: 'First name is required',
    tooLong: 'First name must be at most 50 characters',
    invalidChars: 'First name may contain only letters, hyphens, apostrophes, and spaces',
  },
  lastName: {
    required: 'Last name is required',
    tooLong: 'Last name must be at most 50 characters',
    invalidChars: 'Last name may contain only letters, hyphens, apostrophes, and spaces',
  },
  email: {
    required: 'Email is required',
    invalid: 'Enter a valid email address',
    tooLong: 'Email must be at most 254 characters',
    duplicate: 'This email is already registered',
  },
  password: {
    required: 'Password is required',
    tooShort: 'Password must be at least 8 characters',
    tooLong: 'Password must be at most 128 characters',
    noLetter: 'Password must contain at least one letter',
    noDigit: 'Password must contain at least one digit',
  },
  generic: 'Something went wrong. Please try again.',
} as const;

export const LIMITS = {
  orgNameMax: 100,
  personNameMax: 50,
  emailMax: 254,
  passwordMin: 8,
  passwordMax: 128,
} as const;

export type SignupField = 'orgName' | 'firstName' | 'lastName' | 'email' | 'password';

/** Top-to-bottom field order, as rendered on /signup. Drives focus on submit-blocked. */
export const SIGNUP_FIELD_ORDER: readonly SignupField[] = [
  'orgName',
  'firstName',
  'lastName',
  'email',
  'password',
];

export type FieldResult =
  | { valid: true; value: string }
  | { valid: false; error: string };

const ok = (value: string): FieldResult => ({ valid: true, value });
const fail = (error: string): FieldResult => ({ valid: false, error });

/** Letters (any script), hyphens, apostrophes and spaces only. */
const PERSON_NAME_PATTERN = /^[\p{L}\-' ]+$/u;

/** local@domain.tld — a local part, a domain, at least one dot, and a TLD. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)*\.[A-Za-z]{2,}$/;

export function validateOrgName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(MESSAGES.orgName.required);
  if (value.length > LIMITS.orgNameMax) return fail(MESSAGES.orgName.tooLong);
  return ok(value);
}

function validatePersonName(
  input: string,
  messages: typeof MESSAGES.firstName | typeof MESSAGES.lastName,
): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(messages.required);
  if (value.length > LIMITS.personNameMax) return fail(messages.tooLong);
  if (!PERSON_NAME_PATTERN.test(value)) return fail(messages.invalidChars);
  return ok(value);
}

export const validateFirstName = (input: string): FieldResult =>
  validatePersonName(input, MESSAGES.firstName);

export const validateLastName = (input: string): FieldResult =>
  validatePersonName(input, MESSAGES.lastName);

/** Lowercased and trimmed — the form stored and compared for uniqueness. */
export function normalizeEmail(input: string): string {
  return (input ?? '').trim().toLowerCase();
}

export function validateEmail(input: string): FieldResult {
  const value = normalizeEmail(input);
  if (value.length === 0) return fail(MESSAGES.email.required);
  if (value.length > LIMITS.emailMax) return fail(MESSAGES.email.tooLong);
  if (!EMAIL_PATTERN.test(value)) return fail(MESSAGES.email.invalid);
  return ok(value);
}

/** Passwords are never trimmed — surrounding whitespace is part of the secret. */
export function validatePassword(input: string): FieldResult {
  const value = input ?? '';
  if (value.length === 0) return fail(MESSAGES.password.required);
  if (value.length < LIMITS.passwordMin) return fail(MESSAGES.password.tooShort);
  if (value.length > LIMITS.passwordMax) return fail(MESSAGES.password.tooLong);
  if (!/\p{L}/u.test(value)) return fail(MESSAGES.password.noLetter);
  if (!/\d/.test(value)) return fail(MESSAGES.password.noDigit);
  return ok(value);
}

export const FIELD_VALIDATORS: Record<SignupField, (input: string) => FieldResult> = {
  orgName: validateOrgName,
  firstName: validateFirstName,
  lastName: validateLastName,
  email: validateEmail,
  password: validatePassword,
};

export interface SignupInput {
  orgName: string;
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  /** IANA zone from Intl.DateTimeFormat().resolvedOptions().timeZone. */
  timezone?: string;
}

export interface SignupValidation {
  valid: boolean;
  errors: Partial<Record<SignupField, string>>;
  /** First failing field in top-to-bottom order — where focus goes on submit-blocked. */
  firstInvalidField: SignupField | null;
  value: Record<SignupField, string>;
}

export function validateSignup(input: Partial<SignupInput>): SignupValidation {
  const errors: Partial<Record<SignupField, string>> = {};
  const value = {} as Record<SignupField, string>;

  for (const field of SIGNUP_FIELD_ORDER) {
    const result = FIELD_VALIDATORS[field](input[field] ?? '');
    if (result.valid) {
      value[field] = result.value;
    } else {
      errors[field] = result.error;
      value[field] = input[field] ?? '';
    }
  }

  const firstInvalidField = SIGNUP_FIELD_ORDER.find((f) => errors[f]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

export type MembershipRole = 'admin' | 'member';
export type MembershipStatus = 'active' | 'invited' | 'deactivated';

export interface CreatorMembership {
  accountId: string;
  organizationId: string;
  role: MembershipRole;
  status: MembershipStatus;
}

/**
 * The organization creator is always its first admin (FR-7) — there is no separate
 * owner concept, so this factory is the only place the creator's role is decided.
 */
export function createAdminMembership(input: {
  accountId: string;
  organizationId: string;
}): CreatorMembership {
  return {
    accountId: input.accountId,
    organizationId: input.organizationId,
    role: 'admin',
    status: 'active',
  };
}

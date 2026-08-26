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

/* ------------------------------------------------------------------ *
 * Spec 02 — authentication, forgot-password, reset-password
 * ------------------------------------------------------------------ */

/**
 * Messages the server returns for whole-request outcomes, as opposed to the
 * per-field messages in MESSAGES. Verbatim from spec 02.
 */
export const AUTH_MESSAGES = {
  /** Unknown email and wrong password share this one string (requirement 4). */
  invalidCredentials: 'Invalid email or password',
  /** Deliberately distinct — retrying cannot fix it (requirement 6). */
  deactivated: 'Your account has been deactivated, contact your administrator',
  credentialsRequired: 'Email and password are required',
  emailRequired: 'Email is required',
  /** Returned whether or not the address is registered (requirement 7). */
  resetLinkSent: 'If an account exists, a reset link has been sent',
  resetTokenInvalid: 'This reset link is invalid or has expired',
  resetSuccess: 'Your password has been reset',
  passwordMismatch: 'Passwords do not match',
} as const;

/**
 * Login checks presence only. The signup policy must not apply: an account made
 * before a policy change still has to sign in, and "your password is too short"
 * would tell a stranger the account exists.
 */
export function validatePasswordPresent(input: string): FieldResult {
  const value = input ?? '';
  if (value.length === 0) return fail(MESSAGES.password.required);
  return ok(value);
}

export type LoginField = 'email' | 'password';

/** Top-to-bottom order on /login — drives focus on submit-blocked. */
export const LOGIN_FIELD_ORDER: readonly LoginField[] = ['email', 'password'];

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginValidation {
  valid: boolean;
  errors: Partial<Record<LoginField, string>>;
  firstInvalidField: LoginField | null;
  value: Record<LoginField, string>;
}

export function validateLogin(input: Partial<LoginInput>): LoginValidation {
  const validators: Record<LoginField, (value: string) => FieldResult> = {
    email: validateEmail,
    password: validatePasswordPresent,
  };

  const errors: Partial<Record<LoginField, string>> = {};
  const value = {} as Record<LoginField, string>;

  for (const field of LOGIN_FIELD_ORDER) {
    const result = validators[field](input[field] ?? '');
    if (result.valid) {
      value[field] = result.value;
    } else {
      errors[field] = result.error;
      value[field] = input[field] ?? '';
    }
  }

  const firstInvalidField = LOGIN_FIELD_ORDER.find((f) => errors[f]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

/* ------------------------------------------------------------------ *
 * Spec 04 — member list management
 * ------------------------------------------------------------------ */

/**
 * The whole-request outcomes of removing a member, verbatim from spec 04's Error
 * Messages table. Only the `DELETE` path is here: the rest of that screen — search,
 * the removed filter, restore — arrives with the spec itself.
 */
export const MEMBER_MESSAGES = {
  removeForbidden: 'You do not have permission to remove members',
  cannotRemoveSelf: 'You cannot remove yourself from the organization',
  lastAdmin: 'Organization must retain at least one admin',
  alreadyRemoved: 'Member is already removed',
} as const;

/** Removing a member is `admin`/`manager`, the same pair that manages hiring. */
export const MEMBER_MANAGE_ROLES: readonly string[] = ['admin', 'manager'];

export const canManageMembers = (role: string): boolean => MEMBER_MANAGE_ROLES.includes(role);

export type MembershipRole = 'admin' | 'member';
/** `removed` is the soft-deleted state (specs 02 and 04). */
export type MembershipStatus = 'active' | 'invited' | 'removed';

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

/* ------------------------------------------------------------------ *
 * Hiring — specs 01 (vacancies), 02 (booking page), 03 (candidate database),
 * 04 (candidate card), 05 (board) and 06 (libraries)
 * ------------------------------------------------------------------ */

export * from './hiring';
export * from './hiring-time';
export * from './hiring-slots';
export * from './hiring-card';
export * from './hiring-board';
export * from './hiring-autosave';
export * from './hiring-libraries';
export * from './hiring-candidates';
export * from './hiring-interviews';

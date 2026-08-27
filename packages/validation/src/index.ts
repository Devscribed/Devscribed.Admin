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
  /** Spec 03 requirement 11 — the invitation role picker. */
  role: {
    required: 'Role is required',
    invalid: 'Invalid role',
  },
  /** Spec 06 requirement 9 — account-settings edit-information fields. */
  phone: {
    invalid: 'Enter a valid phone number',
    countryCodeRequired: 'Select a country code',
  },
  timezone: {
    required: 'Timezone is required',
  },
  firstDayOfWeek: {
    invalid: 'Invalid first day of week',
  },
  generic: 'Something went wrong. Please try again.',
} as const;

export const LIMITS = {
  orgNameMax: 100,
  personNameMax: 50,
  emailMax: 254,
  passwordMin: 8,
  passwordMax: 128,
  /** Spec 05 requirement 6 — job title on the member detail page. */
  jobTitleMax: 100,
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
  /**
   * Deliberately distinct — retrying cannot fix it (requirement 6). Verbatim wording
   * from spec 04's Error Messages table (the source of truth for this string as of
   * spec 04; spec 02's prose predates it and has not been updated to match).
   */
  deactivated: 'Your account has been deactivated. Contact your administrator.',
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

/** Spec 01 requirement 7; widened to four roles by spec 03. */
export type MembershipRole = 'admin' | 'manager' | 'user' | 'viewer';
/**
 * `removed` is the soft-deleted state (specs 02 and 04). There is no `invited` status —
 * an unaccepted invitee has no `Membership` row at all; invitation state lives entirely
 * in the `Invitation` table (spec 03).
 */
export type MembershipStatus = 'active' | 'removed';

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
 * Spec 03 — user invitation
 * ------------------------------------------------------------------ */

/** Alias kept local to the invitation surface, matching spec 03's own naming. */
export type Role = MembershipRole;

export const ROLE_VALUES: readonly Role[] = ['admin', 'manager', 'user', 'viewer'];

export function isValidRole(input: string): input is Role {
  return (ROLE_VALUES as readonly string[]).includes(input);
}

/**
 * Whole-request outcome messages for spec 03 — self-invitation, role authority,
 * already-a-member, token validity, and accept-time password check. Field-level
 * messages (email, role, name, password) live in `MESSAGES`, following the
 * `AUTH_MESSAGES` precedent of a section-specific export for non-field messages.
 */
export const INVITE_MESSAGES = {
  selfInvitation: 'You cannot invite yourself',
  alreadyMember: 'This person is already a member of your organization',
  roleAuthority: 'You do not have permission to assign the admin role',
  permissionDenied: 'You do not have permission to invite members',
  tokenExpired: 'This invitation has expired',
  tokenInvalid: 'This invitation is no longer valid',
  incorrectPassword: 'Incorrect password',
} as const;

function validateRole(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(MESSAGES.role.required);
  if (!isValidRole(value)) return fail(MESSAGES.role.invalid);
  return ok(value);
}

/**
 * Case-insensitive comparison after normalization (spec 03 requirement 1 / TC-03-UNIT-03).
 * Pure so it can be unit-tested directly; the service supplies both emails from the
 * session and the request body.
 */
export function isSelfInvitation(inviterEmail: string, inviteeEmail: string): boolean {
  return normalizeEmail(inviterEmail) === normalizeEmail(inviteeEmail);
}

/**
 * `admin` may assign any role. `manager` may assign `manager`/`user`/`viewer` but not
 * `admin`. `user`/`viewer` cannot invite at all — callers must reject those before
 * reaching this check (spec 03 requirement 4).
 */
export function canAssignRole(inviterRole: Role, targetRole: Role): boolean {
  if (inviterRole === 'admin') return true;
  if (inviterRole === 'manager') return targetRole !== 'admin';
  return false;
}

export type InviteCreateField = 'email' | 'role';

/** Top-to-bottom order on the invite modal. */
export const INVITE_CREATE_FIELD_ORDER: readonly InviteCreateField[] = ['email', 'role'];

export interface InviteCreateInput {
  email: string;
  role: string;
}

export interface InviteCreateValidation {
  valid: boolean;
  errors: Partial<Record<InviteCreateField, string>>;
  firstInvalidField: InviteCreateField | null;
  value: Record<InviteCreateField, string>;
}

/**
 * Field-level validation only (email format/length, role enum membership). Role
 * *authority* (can this inviter assign this role?) and the DB-backed checks
 * (self-invitation, already-a-member) are not field errors and stay out of this pure
 * validator — see `canAssignRole` and the service layer.
 */
export function validateInviteCreate(input: Partial<InviteCreateInput>): InviteCreateValidation {
  const validators: Record<InviteCreateField, (value: string) => FieldResult> = {
    email: validateEmail,
    role: validateRole,
  };

  const errors: Partial<Record<InviteCreateField, string>> = {};
  const value = {} as Record<InviteCreateField, string>;

  for (const field of INVITE_CREATE_FIELD_ORDER) {
    const result = validators[field](input[field] ?? '');
    if (result.valid) {
      value[field] = result.value;
    } else {
      errors[field] = result.error;
      value[field] = input[field] ?? '';
    }
  }

  const firstInvalidField = INVITE_CREATE_FIELD_ORDER.find((f) => errors[f]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

export type InviteAcceptField = 'firstName' | 'lastName' | 'password';

/** Top-to-bottom order on the new-account accept form. */
export const INVITE_ACCEPT_FIELD_ORDER: readonly InviteAcceptField[] = [
  'firstName',
  'lastName',
  'password',
];

export interface InviteAcceptNewAccountInput {
  firstName: string;
  lastName: string;
  password: string;
}

export interface InviteAcceptNewAccountValidation {
  valid: boolean;
  errors: Partial<Record<InviteAcceptField, string>>;
  firstInvalidField: InviteAcceptField | null;
  value: Record<InviteAcceptField, string>;
}

/**
 * New-account accept-invite validation (spec 03 requirement 5, requirement 11's
 * "new account" table). Reuses the exact name/password rules from spec 01 — the
 * messages are verbatim-identical by construction, not by duplication.
 */
export function validateInviteAcceptNewAccount(
  input: Partial<InviteAcceptNewAccountInput>,
): InviteAcceptNewAccountValidation {
  const validators: Record<InviteAcceptField, (value: string) => FieldResult> = {
    firstName: validateFirstName,
    lastName: validateLastName,
    password: validatePassword,
  };

  const errors: Partial<Record<InviteAcceptField, string>> = {};
  const value = {} as Record<InviteAcceptField, string>;

  for (const field of INVITE_ACCEPT_FIELD_ORDER) {
    const result = validators[field](input[field] ?? '');
    if (result.valid) {
      value[field] = result.value;
    } else {
      errors[field] = result.error;
      value[field] = input[field] ?? '';
    }
  }

  const firstInvalidField = INVITE_ACCEPT_FIELD_ORDER.find((f) => errors[f]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

/* ------------------------------------------------------------------ *
 * Spec 04 — member list & management
 * ------------------------------------------------------------------ */

/**
 * Whole-request outcome messages for spec 04's delete/restore endpoints. Verbatim
 * from spec 04's Error Messages table.
 */
export const MEMBER_MESSAGES = {
  cannotRemoveSelf: 'You cannot remove yourself from the organization',
  lastAdminGuard: 'Organization must retain at least one admin',
  alreadyRemoved: 'Member is already removed',
  deleteForbidden: 'You do not have permission to remove members',
  notRemoved: 'Member is not in removed status',
  restoreForbidden: 'You do not have permission to restore members',
  /**
   * Spec 05 additions — verbatim from spec 05's Error Messages table. `lastAdminGuard`
   * above is reused as-is (the zero-admin guard message is identical between the
   * delete flow and the role-change flow).
   */
  editForbidden: 'You do not have permission to edit members',
  memberRemoved: 'Cannot edit a removed member',
  roleAuthority: 'You do not have permission to assign this role',
  jobTitleTooLong: 'Job title must be at most 100 characters',
  memberNotFound: 'Member not found',
  viewForbidden: 'You do not have permission to view this member',
} as const;

/**
 * The capability names in spec 04's Roles & Permission Matrix table. `'invite'` is
 * spec 03's capability, included here so `can()` is a single source of truth for the
 * whole matrix rather than splitting it awkwardly across two modules.
 */
export type MemberCapability =
  | 'view-list'
  | 'invite'
  | 'delete-restore'
  | 'edit-detail'
  /** Spec 07 additions — the Vacation tab / financial-settings capabilities. */
  | 'view-vacation'
  | 'view-own-vacation-balance'
  | 'edit-member-financials';

/**
 * Pure lookup against spec 04's Roles & Permission Matrix (TC-04-UNIT-05), widened by
 * spec 05's `edit-detail` (requirement 11 — same admin/manager-only shape as
 * `delete-restore`, kept as a distinct key since it gates a different endpoint).
 * `admin` and `manager` get every capability; `user` and `viewer` get read-only list
 * access and nothing else.
 */
const CAPABILITY_MATRIX: Record<Role, Record<MemberCapability, boolean>> = {
  admin: {
    'view-list': true,
    invite: true,
    'delete-restore': true,
    'edit-detail': true,
    'view-vacation': true,
    'view-own-vacation-balance': true,
    'edit-member-financials': true,
  },
  manager: {
    'view-list': true,
    invite: true,
    'delete-restore': true,
    'edit-detail': true,
    'view-vacation': true,
    'view-own-vacation-balance': true,
    'edit-member-financials': true,
  },
  user: {
    'view-list': true,
    invite: false,
    'delete-restore': false,
    'edit-detail': false,
    'view-vacation': false,
    'view-own-vacation-balance': true,
    'edit-member-financials': false,
  },
  viewer: {
    'view-list': true,
    invite: false,
    'delete-restore': false,
    'edit-detail': false,
    'view-vacation': false,
    'view-own-vacation-balance': false,
    'edit-member-financials': false,
  },
};

export function can(role: Role, capability: MemberCapability): boolean {
  return CAPABILITY_MATRIX[role]?.[capability] ?? false;
}

/** The subset of a member's fields the pure search/filter logic below needs. */
export interface SearchableMember {
  id: string;
  fullName: string;
  email: string;
  status: MembershipStatus;
}

/**
 * Case-insensitive partial match against full name OR email (requirement 3). A
 * plain substring test on lower-cased strings — no regex compiled from user input,
 * so arbitrary special characters (TC-04-UNIT-03) can never crash or be interpreted
 * as anything other than literal text; they simply fail to match.
 */
export function matchesMemberSearch(
  member: Pick<SearchableMember, 'fullName' | 'email'>,
  term: string,
): boolean {
  const query = (term ?? '').trim().toLowerCase();
  if (query.length === 0) return true;
  return (
    member.fullName.toLowerCase().includes(query) || member.email.toLowerCase().includes(query)
  );
}

export interface VisibleMembersOptions {
  search?: string;
  showRemoved?: boolean;
}

/**
 * Composes the removed-filter and the search filter (requirements 2, 4, 5): default
 * is active-only; `showRemoved` is an additive reveal, not a replace, and the search
 * term applies across whichever set is currently visible.
 */
export function visibleMembers<T extends SearchableMember>(
  members: readonly T[],
  options: VisibleMembersOptions = {},
): T[] {
  const showRemoved = options.showRemoved ?? false;
  return members.filter(
    (member) =>
      (showRemoved || member.status === 'active') && matchesMemberSearch(member, options.search ?? ''),
  );
}

/* ------------------------------------------------------------------ *
 * Spec 05 — member detail: about
 * ------------------------------------------------------------------ */

/**
 * Job title (requirement 6): optional/clearable, max 100 chars. Trimmed like every
 * other free-text field in this module — a title of only whitespace is treated as
 * cleared rather than counted toward the length limit.
 */
export function validateJobTitle(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length > LIMITS.jobTitleMax) return fail(MEMBER_MESSAGES.jobTitleTooLong);
  return ok(value);
}

/**
 * The role options a caller may assign to a member currently holding `targetCurrentRole`
 * (spec 05 requirement 8 / the Roles & Permission Matrix). This is the single source of
 * truth behind both `canChangeRole` and the API's `availableRoles` field — an `admin`
 * has blanket authority regardless of the target's current role; a `manager` only has
 * authority over targets currently `user`/`viewer`, and even then may never assign
 * `admin`; `user`/`viewer` callers have no authority at all.
 *
 * Two independent facts collapse into one function here rather than a 2-arg
 * `canChangeRole(callerRole, role)`, because the matrix genuinely depends on both the
 * target's *current* role (does the caller have any authority over this member?) and
 * the *desired* role (is this specific assignment allowed?) — collapsing them into a
 * single role parameter can't distinguish TC-05-UNIT-03 cases 1 and 4 (manager
 * changing a `user` target to `manager` vs. to `admin`) from cases 5 and 6 (manager
 * touching a `manager`/`admin` target at all).
 */
export function getAvailableRoles(callerRole: Role, targetCurrentRole: Role): Role[] {
  if (callerRole === 'admin') return [...ROLE_VALUES];
  if (callerRole === 'manager') {
    if (targetCurrentRole === 'user' || targetCurrentRole === 'viewer') {
      return ['manager', 'user', 'viewer'];
    }
    return [];
  }
  return [];
}

/**
 * Pure role-change-authority check (TC-05-UNIT-03): may `callerRole` change a member
 * currently holding `targetCurrentRole` to `newRole`? Built on `getAvailableRoles` so
 * the two can never drift. Note this only answers the authority question for a given
 * transition — the service layer additionally short-circuits this check entirely when
 * `newRole === targetCurrentRole` (spec 05 requirement 5's note / TC-05-INT-15: a
 * job-title-only save that resends the unchanged role must not be blocked even when
 * the caller has no authority over that role).
 */
export function canChangeRole(callerRole: Role, targetCurrentRole: Role, newRole: Role): boolean {
  return getAvailableRoles(callerRole, targetCurrentRole).includes(newRole);
}

/**
 * Avatar initials (requirement 4 / TC-05-UNIT-04): uppercase first character of first
 * name + uppercase first character of last name. Spread (not indexing) to take a full
 * Unicode code point rather than a UTF-16 code unit, and `toLocaleUpperCase` (not
 * `toUpperCase`) so accented letters like "María" uppercase correctly ("M", not a
 * mis-cased or unchanged character).
 */
export function getAvatarInitials(firstName: string, lastName: string): string {
  const firstChar = [...(firstName ?? '').trim()][0] ?? '';
  const lastChar = [...(lastName ?? '').trim()][0] ?? '';
  return (firstChar + lastChar).toLocaleUpperCase();
}

/* ------------------------------------------------------------------ *
 * Spec 06 — account settings
 * ------------------------------------------------------------------ */

import { isPossiblePhoneNumber } from 'libphonenumber-js';
import type { CountryCode } from 'libphonenumber-js';

/**
 * Whole-request outcome messages for spec 06 — the change-email, change-password, and
 * email-confirmation flows. Field-level messages (name, email, password) live in
 * `MESSAGES`, following the `AUTH_MESSAGES`/`MEMBER_MESSAGES` precedent of a
 * section-specific export for non-field messages. Verbatim from spec 06 requirement 9.
 *
 * The confirm-password mismatch string is intentionally absent — it is identical to
 * `AUTH_MESSAGES.passwordMismatch` ('Passwords do not match') and is reused from there
 * rather than retyped, so the two flows can never drift.
 */
export const ACCOUNT_MESSAGES = {
  /** Change email — the new address equals the current one (case-insensitive). */
  sameAsCurrentEmail: 'This is already your email address',
  /** Change email — the new address already belongs to another account (server-side). */
  emailInUse: 'This email is already in use',
  /** Change password — the current-password field is empty. */
  currentPasswordRequired: 'Current password is required',
  /** Change password — the supplied current password is wrong (server-side). */
  currentPasswordIncorrect: 'Current password is incorrect',
  /** Change password — the confirm field is empty. */
  confirmPasswordRequired: 'Please confirm your new password',
  /** Email confirmation — the token is past its 24-hour expiry. */
  confirmationExpired: 'This confirmation link has expired',
  /** Email confirmation — the token is used, invalidated, not found, or malformed. */
  confirmationInvalid: 'This confirmation link is no longer valid',
} as const;

/**
 * Phone number validation for the selected country (requirement 4 / TC-06-UNIT-03,
 * TC-06-UNIT-10). Phone is optional and informational only; `countryCode` is an
 * ISO 3166-1 alpha-2 code (e.g. "US").
 *
 * Rules: empty number with no country code is valid (phone omitted); a number with no
 * country code selected fails with "Select a country code"; a number that does not fit
 * the selected country fails with "Enter a valid phone number".
 *
 * We use `isPossiblePhoneNumber` (length/prefix plausibility) rather than
 * `isValidPhoneNumber` (full national-number assignment) deliberately: the spec's
 * canonical example "+1 (555) 123-4567" uses the 555 exchange, which is a reserved
 * fictional range, so `isValidPhoneNumber(..., 'US')` returns false — it would reject
 * both TC-06-UNIT-03 step 1 and TC-06-UNIT-10 step 3, which the spec requires to pass.
 * `isPossiblePhoneNumber` accepts those while still rejecting the too-short "12345".
 */
export function validatePhoneNumber(phoneNumber: string, countryCode: string): FieldResult {
  const number = (phoneNumber ?? '').trim();
  const country = (countryCode ?? '').trim();

  // Phone is optional: nothing entered → valid, stored as empty.
  if (number.length === 0) return ok('');

  // A number was entered but no country was selected — we cannot interpret it.
  if (country.length === 0) return fail(MESSAGES.phone.countryCodeRequired);

  // An unknown country code, or any parsing failure, is treated as an invalid number
  // rather than throwing out of the pure validator.
  try {
    if (!isPossiblePhoneNumber(number, country as CountryCode)) {
      return fail(MESSAGES.phone.invalid);
    }
  } catch {
    return fail(MESSAGES.phone.invalid);
  }

  return ok(number);
}

/**
 * Timezone (requirement 4 / TC-06-UNIT-12): required, non-empty. The IANA zone itself is
 * chosen from a curated list on the client; the shared layer only guards presence, since
 * the spec exercises empty-vs-populated and not membership in the full IANA database.
 */
export function validateTimezone(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(MESSAGES.timezone.required);
  return ok(value);
}

/** The only accepted first-day-of-week values (requirement 4). Monday is the default. */
export const FIRST_DAY_OF_WEEK_VALUES = ['Monday', 'Sunday'] as const;

export type FirstDayOfWeek = (typeof FIRST_DAY_OF_WEEK_VALUES)[number];

export function isFirstDayOfWeek(input: string): input is FirstDayOfWeek {
  return (FIRST_DAY_OF_WEEK_VALUES as readonly string[]).includes(input);
}

/**
 * First day of week (requirement 4 / TC-06-UNIT-06): must be exactly "Monday" or
 * "Sunday". Any other value — including an empty selection — is rejected.
 */
export function validateFirstDayOfWeek(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (!isFirstDayOfWeek(value)) return fail(MESSAGES.firstDayOfWeek.invalid);
  return ok(value);
}

/**
 * True when the requested new email equals the account's current email after
 * normalization (requirement 2 / TC-06-UNIT-08). Case- and whitespace-insensitive via
 * `normalizeEmail`; the change-email service uses this to reject a no-op change with
 * `ACCOUNT_MESSAGES.sameAsCurrentEmail`.
 */
export function isSameAsCurrentEmail(currentEmail: string, newEmail: string): boolean {
  return normalizeEmail(currentEmail) === normalizeEmail(newEmail);
}

/**
 * Email-change confirmation token expiry (requirement 7 / TC-06-UNIT-09). Validity is
 * `now < expiresAt`, so the boundary is exclusive: a token is expired at exactly
 * `expiresAt` (`CreatedAt + 24h`) and after. Pure date math, shared so the confirm
 * screen and the API compute expiry identically.
 */
export function isEmailChangeTokenExpired(now: Date, expiresAt: Date): boolean {
  return now.getTime() >= expiresAt.getTime();
}

/* --- Change password -------------------------------------------------------- */

/**
 * Current-password presence (requirement 3 / TC-06-UNIT-11). Never trimmed — surrounding
 * whitespace is part of the secret. Correctness of the password is a server-side check
 * (`ACCOUNT_MESSAGES.currentPasswordIncorrect`), not a field rule.
 */
export function validateCurrentPassword(input: string): FieldResult {
  const value = input ?? '';
  if (value.length === 0) return fail(ACCOUNT_MESSAGES.currentPasswordRequired);
  return ok(value);
}

/**
 * New-password confirmation (requirement 3 / TC-06-UNIT-07): empty → "Please confirm your
 * new password"; non-empty but not byte-for-byte equal to the new password → "Passwords do
 * not match" (reused from `AUTH_MESSAGES`). Comparison is case-sensitive and untrimmed.
 */
export function validatePasswordConfirmation(newPassword: string, confirmation: string): FieldResult {
  const value = confirmation ?? '';
  if (value.length === 0) return fail(ACCOUNT_MESSAGES.confirmPasswordRequired);
  if (value !== (newPassword ?? '')) return fail(AUTH_MESSAGES.passwordMismatch);
  return ok(value);
}

export type ChangePasswordField = 'currentPassword' | 'newPassword' | 'passwordConfirmation';

/** Top-to-bottom order in the Change Password modal — drives focus on submit-blocked. */
export const CHANGE_PASSWORD_FIELD_ORDER: readonly ChangePasswordField[] = [
  'currentPassword',
  'newPassword',
  'passwordConfirmation',
];

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
  passwordConfirmation: string;
}

export interface ChangePasswordValidation {
  valid: boolean;
  errors: Partial<Record<ChangePasswordField, string>>;
  firstInvalidField: ChangePasswordField | null;
  value: Record<ChangePasswordField, string>;
}

/**
 * Composite change-password validation (requirement 3 / TC-06-UNIT-11). Current password
 * present, new password meets the spec-01 policy (reused via `validatePassword`), and the
 * confirmation matches. The confirmation rule spans two inputs, so this cannot use the
 * simple per-field validator map that the other composites use.
 */
export function validateChangePassword(input: Partial<ChangePasswordInput>): ChangePasswordValidation {
  const currentPassword = input.currentPassword ?? '';
  const newPassword = input.newPassword ?? '';
  const passwordConfirmation = input.passwordConfirmation ?? '';

  const results: Record<ChangePasswordField, FieldResult> = {
    currentPassword: validateCurrentPassword(currentPassword),
    newPassword: validatePassword(newPassword),
    passwordConfirmation: validatePasswordConfirmation(newPassword, passwordConfirmation),
  };

  const errors: Partial<Record<ChangePasswordField, string>> = {};
  const value = {} as Record<ChangePasswordField, string>;

  for (const field of CHANGE_PASSWORD_FIELD_ORDER) {
    const result = results[field];
    if (result.valid) {
      value[field] = result.value;
    } else {
      errors[field] = result.error;
      value[field] = input[field] ?? '';
    }
  }

  const firstInvalidField = CHANGE_PASSWORD_FIELD_ORDER.find((f) => errors[f]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

/* --- Edit information ------------------------------------------------------- */

export type AccountSettingsField =
  | 'firstName'
  | 'lastName'
  | 'phoneCountryCode'
  | 'phoneNumber'
  | 'timezone'
  | 'firstDayOfWeek';

/** Top-to-bottom field order on the Edit Information form (requirement 4 / UI section). */
export const ACCOUNT_SETTINGS_FIELD_ORDER: readonly AccountSettingsField[] = [
  'firstName',
  'lastName',
  'phoneCountryCode',
  'phoneNumber',
  'timezone',
  'firstDayOfWeek',
];

export interface AccountSettingsInput {
  firstName: string;
  lastName: string;
  /** ISO 3166-1 alpha-2 country code; may be null/empty when no phone is set. */
  phoneCountryCode: string;
  /** May be null/empty — phone is optional. */
  phoneNumber: string;
  timezone: string;
  firstDayOfWeek: string;
}

export interface AccountSettingsValidation {
  valid: boolean;
  errors: Partial<Record<AccountSettingsField, string>>;
  firstInvalidField: AccountSettingsField | null;
  value: Record<AccountSettingsField, string>;
}

/**
 * Composite Edit-Information validation (requirement 4 / TC-06-INT-12,13,17). Names reuse
 * the spec-01 rules; the phone country-code and number are one rule spanning two fields,
 * so the single phone error is routed to the correct `field-error-{fieldName}` id — a
 * missing country code keys `phoneCountryCode` ("Select a country code"), a number that
 * does not fit the country keys `phoneNumber` ("Enter a valid phone number").
 */
export function validateAccountSettings(input: Partial<AccountSettingsInput>): AccountSettingsValidation {
  const errors: Partial<Record<AccountSettingsField, string>> = {};
  const value = {} as Record<AccountSettingsField, string>;

  const firstName = validateFirstName(input.firstName ?? '');
  if (firstName.valid) value.firstName = firstName.value;
  else {
    errors.firstName = firstName.error;
    value.firstName = input.firstName ?? '';
  }

  const lastName = validateLastName(input.lastName ?? '');
  if (lastName.valid) value.lastName = lastName.value;
  else {
    errors.lastName = lastName.error;
    value.lastName = input.lastName ?? '';
  }

  // Phone country code + number: one rule, two possible field ids.
  const phoneCountryCode = (input.phoneCountryCode ?? '').trim();
  const phone = validatePhoneNumber(input.phoneNumber ?? '', input.phoneCountryCode ?? '');
  if (phone.valid) {
    value.phoneCountryCode = phoneCountryCode;
    value.phoneNumber = phone.value;
  } else if (phone.error === MESSAGES.phone.countryCodeRequired) {
    errors.phoneCountryCode = phone.error;
    value.phoneCountryCode = phoneCountryCode;
    value.phoneNumber = input.phoneNumber ?? '';
  } else {
    errors.phoneNumber = phone.error;
    value.phoneCountryCode = phoneCountryCode;
    value.phoneNumber = input.phoneNumber ?? '';
  }

  const timezone = validateTimezone(input.timezone ?? '');
  if (timezone.valid) value.timezone = timezone.value;
  else {
    errors.timezone = timezone.error;
    value.timezone = input.timezone ?? '';
  }

  const firstDayOfWeek = validateFirstDayOfWeek(input.firstDayOfWeek ?? '');
  if (firstDayOfWeek.valid) value.firstDayOfWeek = firstDayOfWeek.value;
  else {
    errors.firstDayOfWeek = firstDayOfWeek.error;
    value.firstDayOfWeek = input.firstDayOfWeek ?? '';
  }

  const firstInvalidField = ACCOUNT_SETTINGS_FIELD_ORDER.find((f) => errors[f]) ?? null;
  return { valid: firstInvalidField === null, errors, firstInvalidField, value };
}

/* ------------------------------------------------------------------ *
 * Spec 07 — member financial settings
 * ------------------------------------------------------------------ */

/**
 * Whole-request and field-level messages for spec 07's Vacation tab / financial
 * settings, verbatim from spec 07's Validation Rules and Error Messages tables.
 * Follows the `MEMBER_MESSAGES` precedent of a section-specific export that carries
 * both the per-field strings (routed to `field-error-{fieldName}` ids and the PUT
 * `{errors:{...}}` contract) and the non-field outcome strings.
 *
 * Note the thousands separators in the salary/rate ranges — these strings are matched
 * byte-for-byte by both the API and the web form, so the commas are load-bearing.
 */
export const FINANCIALS_MESSAGES = {
  monthlySalaryRange: 'Monthly salary must be between 0.01 and 999,999.99',
  clientHourlyRateRange: 'Client hourly rate must be between 0.01 and 9,999.99',
  vacationDaysRange: 'Vacation days per year must be between 1 and 365',
  invalidCurrency: 'Invalid currency code',
  reservePercentRange: 'Reserve percentage must be between 0.01 and 99.99',
  /** PUT rejects a removed member before validation (TC-07-INT-06). */
  memberRemoved: 'Cannot configure vacation for a removed member',
  /** GET forbidden — viewer, or user viewing another member (TC-07-INT-07/08). */
  viewForbidden: "You do not have permission to view this member's vacation data",
  /** PUT forbidden — caller is user/viewer (TC-07-INT-04). */
  editForbidden: 'You do not have permission to edit financial settings',
} as const;

/** Numeric bounds for the financial fields (spec 07 Validation Rules 1–3, 5). */
export const FINANCIALS_LIMITS = {
  monthlySalaryMin: 0.01,
  monthlySalaryMax: 999999.99,
  clientHourlyRateMin: 0.01,
  clientHourlyRateMax: 9999.99,
  vacationDaysMin: 1,
  vacationDaysMax: 365,
  reservePercentMin: 0.01,
  reservePercentMax: 99.99,
} as const;

/** Fixed constants in the auto-calc formula (requirement 7) — not configurable. */
export const WORKING_DAYS_PER_YEAR = 260;
export const BILLABLE_HOURS_PER_YEAR = 2080;

/**
 * A numeric field either yields a parsed `number` or a message. Financial inputs arrive
 * as JSON numbers from the API and as strings from the web form, so the validators below
 * accept both and coerce defensively; anything non-numeric collapses to `NaN` and is
 * reported as out-of-range rather than throwing out of these pure functions.
 */
export type NumericFieldResult =
  | { valid: true; value: number }
  | { valid: false; error: string };

const okNum = (value: number): NumericFieldResult => ({ valid: true, value });
const failNum = (error: string): NumericFieldResult => ({ valid: false, error });

/**
 * Coerce a JSON number or a form string to a number. Empty/blank strings and null/undefined
 * become `NaN` (treated as "missing/out of range"), never `0` — `Number('')` is `0`, which
 * would silently pass a required field, so blanks are guarded explicitly.
 */
function toFinancialNumber(input: number | string | null | undefined): number {
  if (typeof input === 'number') return input;
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (trimmed.length === 0) return NaN;
    return Number(trimmed);
  }
  return NaN;
}

/**
 * Count decimal places from the original text (for strings) or the number's canonical
 * string form. Used to enforce the "two decimal places" rule without incurring binary
 * float rounding surprises. Values in these ranges never reach exponential notation.
 */
function decimalPlaces(input: number | string): number {
  const s = typeof input === 'string' ? input.trim() : String(input);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/**
 * Shared decimal-field check: required (non-blank/finite), within `[min, max]` inclusive,
 * and at most two decimal places. Every failure maps to the single spec message for that
 * field — the spec exposes only one error per field, so range and precision share it.
 */
function validateDecimalField(
  input: number | string | null | undefined,
  min: number,
  max: number,
  message: string,
): NumericFieldResult {
  const value = toFinancialNumber(input);
  if (!Number.isFinite(value)) return failNum(message);
  if (value < min || value > max) return failNum(message);
  if (decimalPlaces(input as number | string) > 2) return failNum(message);
  return okNum(value);
}

/** MonthlySalary (requirement 2): required, 0.01–999,999.99, ≤2 decimal places. */
export function validateMonthlySalary(
  input: number | string | null | undefined,
): NumericFieldResult {
  return validateDecimalField(
    input,
    FINANCIALS_LIMITS.monthlySalaryMin,
    FINANCIALS_LIMITS.monthlySalaryMax,
    FINANCIALS_MESSAGES.monthlySalaryRange,
  );
}

/** ClientHourlyRate (requirement 3): required, 0.01–9,999.99, ≤2 decimal places. */
export function validateClientHourlyRate(
  input: number | string | null | undefined,
): NumericFieldResult {
  return validateDecimalField(
    input,
    FINANCIALS_LIMITS.clientHourlyRateMin,
    FINANCIALS_LIMITS.clientHourlyRateMax,
    FINANCIALS_MESSAGES.clientHourlyRateRange,
  );
}

/** VacationDaysPerYear (requirement 4): required integer, 1–365. */
export function validateVacationDaysPerYear(
  input: number | string | null | undefined,
): NumericFieldResult {
  const value = toFinancialNumber(input);
  if (!Number.isFinite(value)) return failNum(FINANCIALS_MESSAGES.vacationDaysRange);
  if (!Number.isInteger(value)) return failNum(FINANCIALS_MESSAGES.vacationDaysRange);
  if (value < FINANCIALS_LIMITS.vacationDaysMin || value > FINANCIALS_LIMITS.vacationDaysMax) {
    return failNum(FINANCIALS_MESSAGES.vacationDaysRange);
  }
  return okNum(value);
}

/**
 * VacationReservePercent (requirement 6, when manual): required, 0.01–99.99, ≤2 decimals.
 * Only enforced when `isReservePercentManual` is true — in auto mode the value is computed
 * server-side and any submitted percent is ignored (requirement 7).
 */
export function validateVacationReservePercent(
  input: number | string | null | undefined,
): NumericFieldResult {
  return validateDecimalField(
    input,
    FINANCIALS_LIMITS.reservePercentMin,
    FINANCIALS_LIMITS.reservePercentMax,
    FINANCIALS_MESSAGES.reservePercentRange,
  );
}

/**
 * A pragmatic set of active ISO 4217 alphabetic codes. Not the exhaustive standard — the
 * spec only exercises membership (`USD` valid, `XXXX` invalid, TC-07-INT-03) — but a broad
 * enough real-world set that a currency dropdown built from it is useful on its own.
 */
export const ISO_4217_CURRENCIES: readonly string[] = [
  'AED', 'ARS', 'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CLP', 'CNY', 'COP',
  'CZK', 'DKK', 'EGP', 'EUR', 'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR',
  'ISK', 'JPY', 'KRW', 'MXN', 'MYR', 'NGN', 'NOK', 'NZD', 'PHP', 'PLN',
  'RON', 'RUB', 'SAR', 'SEK', 'SGD', 'THB', 'TRY', 'TWD', 'UAH', 'USD',
  'VND', 'ZAR',
] as const;

const CURRENCY_SET: ReadonlySet<string> = new Set(ISO_4217_CURRENCIES);

/**
 * A currency is valid iff it is exactly three uppercase ASCII letters AND a member of the
 * known set (requirement 5 / TC-07-INT-03 step 5). Lowercase input is rejected — the field
 * stores the canonical uppercase code.
 */
export function isValidCurrency(code: string | null | undefined): boolean {
  const value = code ?? '';
  if (!/^[A-Z]{3}$/.test(value)) return false;
  return CURRENCY_SET.has(value);
}

/** Currency (requirement 5): required, valid ISO 4217 code. */
export function validateCurrency(input: string | null | undefined): FieldResult {
  const value = (input ?? '').trim();
  if (!isValidCurrency(value)) return fail(FINANCIALS_MESSAGES.invalidCurrency);
  return ok(value);
}

export interface CalculateReserveInput {
  monthlySalary: number;
  clientHourlyRate: number;
  vacationDaysPerYear: number;
}

/**
 * Auto-calculated reserve percentage (requirement 7 / TC-07-UNIT-01):
 *
 *   dailySalary          = monthlySalary × 12 / 260
 *   annualVacationCost   = dailySalary × vacationDaysPerYear
 *   expectedAnnualBilling= clientHourlyRate × 2080
 *   percent              = round(annualVacationCost / expectedAnnualBilling × 100, 2)
 *
 * The whole expression is evaluated in full double precision — there is NO intermediate
 * rounding — and only the final ratio is rounded to two decimal places via
 * `Math.round(x * 100) / 100`. Verified to return exactly 3.33 (3000/40/20), 3.70
 * (5000/60/20), 2.66 (2000/25/15), and 4.44 (4000/40/20, TC-07-INT-05).
 */
export function calculateReservePercent(input: CalculateReserveInput): number {
  const { monthlySalary, clientHourlyRate, vacationDaysPerYear } = input;
  const annualVacationCost = ((monthlySalary * 12) / WORKING_DAYS_PER_YEAR) * vacationDaysPerYear;
  const expectedAnnualBilling = clientHourlyRate * BILLABLE_HOURS_PER_YEAR;
  const percent = (annualVacationCost / expectedAnnualBilling) * 100;
  return Math.round(percent * 100) / 100;
}

export type MemberFinancialsField =
  | 'monthlySalary'
  | 'clientHourlyRate'
  | 'vacationDaysPerYear'
  | 'currency'
  | 'vacationReservePercent';

/**
 * Top-to-bottom field order as rendered in the Edit Financial Settings modal — drives
 * focus on submit-blocked and the `firstInvalidField` result.
 */
export const MEMBER_FINANCIALS_FIELD_ORDER: readonly MemberFinancialsField[] = [
  'monthlySalary',
  'clientHourlyRate',
  'vacationDaysPerYear',
  'currency',
  'vacationReservePercent',
];

/**
 * The PUT `.../vacation/financials` request body. The API sends JSON numbers, the web form
 * sends strings, so the numeric fields accept both; the API DTO can be `Partial<...>`.
 * `vacationReservePercent` is only meaningful (and only validated) when
 * `isReservePercentManual` is true.
 */
export interface MemberFinancialsInput {
  monthlySalary: number | string;
  clientHourlyRate: number | string;
  vacationDaysPerYear: number | string;
  currency: string;
  isReservePercentManual: boolean;
  vacationReservePercent?: number | string | null;
}

export interface MemberFinancialsValidation {
  valid: boolean;
  errors: Partial<Record<MemberFinancialsField, string>>;
  firstInvalidField: MemberFinancialsField | null;
  /**
   * Coerced/normalized values for downstream use: numbers for the numeric fields (NaN when
   * that field was invalid), the uppercase currency string, the manual flag, and the reserve
   * percent (null in auto mode, since it is server-computed, not client-supplied).
   */
  value: {
    monthlySalary: number;
    clientHourlyRate: number;
    vacationDaysPerYear: number;
    currency: string;
    isReservePercentManual: boolean;
    vacationReservePercent: number | null;
  };
}

/**
 * Composite validation for the PUT financials contract (requirements 2–6 / TC-07-INT-03).
 * Enforces every field rule and keys errors by the exact `field-error-{fieldName}` ids.
 * The reserve-percent rule is skipped entirely when `isReservePercentManual` is false —
 * in auto mode the percent is computed by `calculateReservePercent`, not submitted.
 */
export function validateMemberFinancials(
  input: Partial<MemberFinancialsInput>,
): MemberFinancialsValidation {
  const errors: Partial<Record<MemberFinancialsField, string>> = {};

  const isManual = input.isReservePercentManual === true;

  const salary = validateMonthlySalary(input.monthlySalary);
  if (!salary.valid) errors.monthlySalary = salary.error;

  const rate = validateClientHourlyRate(input.clientHourlyRate);
  if (!rate.valid) errors.clientHourlyRate = rate.error;

  const days = validateVacationDaysPerYear(input.vacationDaysPerYear);
  if (!days.valid) errors.vacationDaysPerYear = days.error;

  const currency = validateCurrency(input.currency);
  if (!currency.valid) errors.currency = currency.error;

  // Reserve percent is only a field when the manager set it manually.
  let percentValue: number | null = null;
  if (isManual) {
    const percent = validateVacationReservePercent(input.vacationReservePercent ?? undefined);
    if (percent.valid) percentValue = percent.value;
    else errors.vacationReservePercent = percent.error;
  }

  const firstInvalidField = MEMBER_FINANCIALS_FIELD_ORDER.find((f) => errors[f]) ?? null;

  return {
    valid: firstInvalidField === null,
    errors,
    firstInvalidField,
    value: {
      monthlySalary: toFinancialNumber(input.monthlySalary),
      clientHourlyRate: toFinancialNumber(input.clientHourlyRate),
      vacationDaysPerYear: toFinancialNumber(input.vacationDaysPerYear),
      currency: currency.valid ? currency.value : (input.currency ?? '').trim(),
      isReservePercentManual: isManual,
      vacationReservePercent: percentValue,
    },
  };
}

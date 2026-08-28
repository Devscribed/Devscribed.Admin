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
  | 'edit-member-financials'
  /** Spec 08 addition — trigger a manual monthly accrual run (admin only). */
  | 'run-accrual'
  /** Spec 09 additions — the vacation-request lifecycle capabilities. */
  | 'submit-vacation-request'
  | 'review-vacation-requests'
  | 'cancel-own-vacation-request'
  | 'cancel-any-vacation-request'
  /** Spec 10 addition — view the organization-wide Requests page (admin, manager). */
  | 'view-requests'
  /**
   * Spec 11 additions — the Projects capabilities.
   * `manage-projects`: create/edit/archive/restore projects and manage members (admin, manager).
   * `list-assigned-projects`: see assigned active projects in time-entry selectors (admin, manager, user).
   */
  | 'manage-projects'
  | 'list-assigned-projects'
  /**
   * Spec 12 additions — the Time Tracking capabilities (spec 12 Roles & Permission
   * Matrix / "New Capabilities").
   * `view-time-tracking`: view the Time Tracking page and own entries (admin, manager, user).
   * `manage-own-time-entries`: create/edit/delete own time entries (admin, manager, user).
   * `manage-all-time-entries`: view/create/edit/delete any member's entries (admin, manager).
   * `use-timer`: start/stop/discard own timer (admin, manager, user).
   */
  | 'view-time-tracking'
  | 'manage-own-time-entries'
  | 'manage-all-time-entries'
  | 'use-timer';

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
    'run-accrual': true,
    'submit-vacation-request': true,
    'review-vacation-requests': true,
    'cancel-own-vacation-request': true,
    'cancel-any-vacation-request': true,
    'view-requests': true,
    'manage-projects': true,
    'list-assigned-projects': true,
    'view-time-tracking': true,
    'manage-own-time-entries': true,
    'manage-all-time-entries': true,
    'use-timer': true,
  },
  manager: {
    'view-list': true,
    invite: true,
    'delete-restore': true,
    'edit-detail': true,
    'view-vacation': true,
    'view-own-vacation-balance': true,
    'edit-member-financials': true,
    'run-accrual': false,
    'submit-vacation-request': true,
    'review-vacation-requests': true,
    'cancel-own-vacation-request': true,
    'cancel-any-vacation-request': true,
    'view-requests': true,
    'manage-projects': true,
    'list-assigned-projects': true,
    'view-time-tracking': true,
    'manage-own-time-entries': true,
    'manage-all-time-entries': true,
    'use-timer': true,
  },
  user: {
    'view-list': true,
    invite: false,
    'delete-restore': false,
    'edit-detail': false,
    'view-vacation': false,
    'view-own-vacation-balance': true,
    'edit-member-financials': false,
    'run-accrual': false,
    'submit-vacation-request': true,
    'review-vacation-requests': false,
    'cancel-own-vacation-request': true,
    'cancel-any-vacation-request': false,
    'view-requests': false,
    'manage-projects': false,
    'list-assigned-projects': true,
    'view-time-tracking': true,
    'manage-own-time-entries': true,
    'manage-all-time-entries': false,
    'use-timer': true,
  },
  viewer: {
    'view-list': true,
    invite: false,
    'delete-restore': false,
    'edit-detail': false,
    'view-vacation': false,
    'view-own-vacation-balance': false,
    'edit-member-financials': false,
    'run-accrual': false,
    'submit-vacation-request': false,
    'review-vacation-requests': false,
    'cancel-own-vacation-request': false,
    'cancel-any-vacation-request': false,
    'view-requests': false,
    'manage-projects': false,
    'list-assigned-projects': false,
    'view-time-tracking': false,
    'manage-own-time-entries': false,
    'manage-all-time-entries': false,
    'use-timer': false,
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

// ===========================================================================
// spec 08 — Vacation Reserve & Auto-Accrual
// ---------------------------------------------------------------------------
// Pure, isomorphic helpers for the monthly credit accrual engine, the reserve
// balance / available-days calculation, deterministic billing-period labels,
// and the manual-accrual request validator. Every function takes its date
// parts explicitly — none reads the wall clock — so they stay deterministic on
// both the API and the web app.
// ===========================================================================

/**
 * Months in a year. Used to spread the annual billable-hours figure across
 * months in the monthly-credit formula.
 */
export const MONTHS_PER_YEAR = 12;

/**
 * Full-month monthly credit (spec requirement 5, TC-08-UNIT-01 cases 1 & 2).
 *
 *   expectedMonthlyBilling = clientHourlyRate × (BILLABLE_HOURS_PER_YEAR / MONTHS_PER_YEAR)
 *   credit                 = round(expectedMonthlyBilling × vacationReservePercent / 100, 2)
 *
 * Verified: (40, 3.33) → 230.88; (60, 5.00) → 520.00.
 */
export function calculateMonthlyCredit(
  clientHourlyRate: number,
  vacationReservePercent: number,
): number {
  const expectedMonthlyBilling = clientHourlyRate * (BILLABLE_HOURS_PER_YEAR / MONTHS_PER_YEAR);
  const credit = (expectedMonthlyBilling * vacationReservePercent) / 100;
  return Math.round(credit * 100) / 100;
}

/**
 * Pro-rate a full-month credit for a member whose financials were first
 * configured partway through the billing month (spec requirement 6,
 * TC-08-UNIT-01 case 3).
 *
 *   round(fullMonthCredit × workingDaysFromConfig / workingDaysInMonth, 2)
 *
 * Verified: (230.88, 10, 22) → 104.95. Guards a zero/negative denominator by
 * returning 0 rather than producing Infinity/NaN.
 */
export function prorateCredit(
  fullMonthCredit: number,
  workingDaysFromConfig: number,
  workingDaysInMonth: number,
): number {
  if (workingDaysInMonth <= 0) return 0;
  const prorated = (fullMonthCredit * workingDaysFromConfig) / workingDaysInMonth;
  return Math.round(prorated * 100) / 100;
}

/**
 * Count the weekdays (Mon–Fri) in a calendar month. `month` is 1-based (1 =
 * January … 12 = December). No public-holiday calendar — working days are
 * weekdays only (spec "Out of Scope"). Iterates the month in UTC so the result
 * is independent of the host time zone.
 *
 * Sanity: June 2025 → 21.
 */
export function workingDaysInMonth(year: number, month: number): number {
  let count = 0;
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Count the weekdays (Mon–Fri) from `dayOfMonth` (inclusive) to the last day of
 * the month. `month` is 1-based. Used to pro-rate a member's first-month credit
 * from the day their financials became effective (spec requirement 6).
 *
 * Sanity: (2025, 6, 15) → 11. NB: June 15 2025 is a Sunday, so it contributes
 * no weekday. See the discrepancy note where this file's tests are defined.
 */
export function workingDaysFromDateToMonthEnd(
  year: number,
  month: number,
  dayOfMonth: number,
): number {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let count = 0;
  for (let day = dayOfMonth; day <= lastDay; day += 1) {
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    if (dow >= 1 && dow <= 5) count += 1;
  }
  return count;
}

/**
 * Available vacation days from the reserve balance (spec requirements 15–17,
 * TC-08-UNIT-02).
 *
 *   dailySalary   = round(monthlySalary × 12 / WORKING_DAYS_PER_YEAR, 2)
 *   raw           = floor((reserveBalance − pendingHold) / dailySalary)
 *   capped        = min(raw, vacationDaysPerYear − usedDays)
 *   availableDays = max(0, capped)
 *
 * `dailySalary` is a monetary rate, so it is rounded to cents (2dp) before the
 * reserve is divided into whole days. This is what both specs' worked examples
 * assume: spec 08's "138.46" and spec 09's "floor(276.92 / 138.46) = 2". Using the
 * unrounded 138.4615… would floor the spec-09 case-1 quotient (1.99998) down to 1 —
 * an artifact of the already-cent-rounded reserve/hold literals, not the intent.
 * The per-request `deductionAmount` keeps FULL precision (see
 * `calculateDeductionAmount` → 692.31); only this day-count division rounds the rate.
 *
 * Divide-by-zero guard: a non-positive daily salary yields 0. Verified against
 * TC-08-UNIT-02: (1661.54, 3000, 20, 0)→12; (0,…)→0; (2769.23, 3000, 20, 18)→2;
 * (-100,…)→0; and TC-09-UNIT-02 case 1 (pendingHold 1384.62)→2.
 *
 * Spec 09 requirement 8 extends this with an optional `pendingHold` — the sum of
 * `deductionAmount` across the member's pending requests in the current calendar
 * year — subtracted from the reserve before the day count is derived. It defaults
 * to 0, so every spec-08 call site and result is unchanged (backward-compatible).
 */
export function calculateAvailableDays(input: {
  reserveBalance: number;
  monthlySalary: number;
  vacationDaysPerYear: number;
  usedDays: number;
  pendingHold?: number;
}): number {
  const { reserveBalance, monthlySalary, vacationDaysPerYear, usedDays, pendingHold } = input;
  const dailySalary = Math.round(((monthlySalary * 12) / WORKING_DAYS_PER_YEAR) * 100) / 100;
  if (dailySalary <= 0) return 0;
  const raw = Math.floor((reserveBalance - (pendingHold ?? 0)) / dailySalary);
  const capped = Math.min(raw, vacationDaysPerYear - usedDays);
  return Math.max(0, capped);
}

/**
 * English month names, index 0 = January. Deterministic and locale-free so the
 * generated transaction descriptions ("June 2025 accrual") match across the API
 * and the web app regardless of the host locale.
 */
export const MONTH_NAMES: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** "June 2025" — the billing-period label (spec API contract, TC-08-INT-06). */
export function billingPeriodLabel(year: number, month: number): string {
  return `${MONTH_NAMES[month - 1]} ${year}`;
}

/** "June 2025 accrual" — the auto-generated credit description (requirement 5, flow step 2f). */
export function accrualDescription(year: number, month: number): string {
  return `${billingPeriodLabel(year, month)} accrual`;
}

/**
 * Exact error strings from spec 08's Error Messages table. Shared by the API
 * (400/403 bodies) and any client-side pre-validation so the wording stays in
 * one place.
 */
export const ACCRUAL_MESSAGES = {
  invalidMonth: 'Month must be between 1 and 12',
  futurePeriod: 'Cannot run accrual for a future billing period',
  forbidden: 'Only admins can trigger manual accrual',
  noTransactions: 'No reserve transactions yet.',
} as const;

/** The validated shape of a manual-accrual request body. */
export interface AccrualRunInput {
  month: number;
  year: number;
}

export type AccrualRunResult =
  | { valid: true; value: AccrualRunInput }
  | { valid: false; error: string; message: string };

/** Whole-number check that also rejects NaN/Infinity and numeric-looking strings' junk. */
function toInteger(input: unknown): number {
  if (typeof input === 'number') return input;
  if (typeof input === 'string' && input.trim().length > 0) return Number(input);
  return NaN;
}

/**
 * Validate a manual-accrual request (spec requirements 11 & 14, TC-08-INT-06/09).
 * `now` carries the caller's current year/month (1-based) so this stays pure —
 * it never reads the clock itself.
 *
 * - `month` must be an integer 1–12, else `invalid_month`.
 * - the period is "future" iff `year > now.year || (year === now.year && month > now.month)`,
 *   which also catches a non-integer/NaN year (falls through to `future_period`).
 * - forbidden (role) is enforced by the caller via `can(role, 'run-accrual')`;
 *   `ACCRUAL_MESSAGES.forbidden` is the matching 403 body.
 */
export function validateAccrualRun(
  input: { month: unknown; year: unknown },
  now: { year: number; month: number },
): AccrualRunResult {
  const month = toInteger(input.month);
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return { valid: false, error: 'invalid_month', message: ACCRUAL_MESSAGES.invalidMonth };
  }

  const year = toInteger(input.year);
  const isFuture =
    !Number.isInteger(year) || year > now.year || (year === now.year && month > now.month);
  if (isFuture) {
    return { valid: false, error: 'future_period', message: ACCRUAL_MESSAGES.futurePeriod };
  }

  return { valid: true, value: { month, year } };
}

// ===========================================================================
// spec 09 — Vacation Requests
// ---------------------------------------------------------------------------
// Pure, isomorphic helpers for the vacation-request lifecycle: working-day
// counting across an inclusive date range, inclusive-range overlap detection,
// the submission-time deduction amount, and the date-field / cross-year /
// reviewer-comment / review-decision validators. Every function takes its dates
// explicitly (never reads the wall clock) and parses 'YYYY-MM-DD' strings as
// UTC midnight so results are host-time-zone-independent and deterministic on
// both the API and the web app.
//
// The `pendingHold` extension to `calculateAvailableDays` (spec 09 requirement 8)
// lives with the spec-08 implementation above, kept backward-compatible.
// ===========================================================================

/** VacationRequest.Status — the four lifecycle states (spec 09 data model). */
export type VacationRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

/**
 * Parse a 'YYYY-MM-DD' date string as UTC midnight, or pass a `Date` through
 * unchanged. Every spec-09 date helper funnels through this so string and Date
 * inputs are treated identically and the host time zone never shifts a day.
 */
function parseUtcDate(input: string | Date): Date {
  if (input instanceof Date) return input;
  return new Date(`${input}T00:00:00.000Z`);
}

/**
 * Working days in an inclusive date range (spec 09 requirement 2 / TC-09-UNIT-01):
 * the count of weekdays (Mon–Fri, `getUTCDay()` 1..5) from `start` to `end`
 * inclusive. Weekends are excluded; no public-holiday calendar. Returns 0 when
 * `end < start`. Works across a year boundary (the cross-year *request* rule is
 * enforced separately by `validateVacationRequestDates`).
 *
 * Verified: 2025-07-14→2025-07-25 = 10; single Mon 2025-07-14 = 1;
 * Sat 2025-07-12→Sun 2025-07-13 = 0; 2025-12-29→2026-01-02 = 5.
 */
export function calculateWorkingDays(start: string | Date, end: string | Date): number {
  const startDate = parseUtcDate(start);
  const endDate = parseUtcDate(end);
  if (endDate.getTime() < startDate.getTime()) return 0;
  let count = 0;
  const cursor = new Date(startDate.getTime());
  while (cursor.getTime() <= endDate.getTime()) {
    const dow = cursor.getUTCDay();
    if (dow >= 1 && dow <= 5) count += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return count;
}

/**
 * Inclusive-range overlap (spec 09 requirement 5 / TC-09-UNIT-03): true iff the
 * two inclusive date ranges share at least one common day, i.e.
 * `aStart <= bEnd && bStart <= aEnd`. Endpoints touching counts as an overlap.
 *
 * Verified against A = 2025-07-14..2025-07-18: B 07-18..07-25 → true;
 * C 07-21..07-25 → false; D 07-10..07-16 → true; E 07-15..07-17 → true.
 */
export function datesOverlap(
  aStart: string | Date,
  aEnd: string | Date,
  bStart: string | Date,
  bEnd: string | Date,
): boolean {
  const aStartMs = parseUtcDate(aStart).getTime();
  const aEndMs = parseUtcDate(aEnd).getTime();
  const bStartMs = parseUtcDate(bStart).getTime();
  const bEndMs = parseUtcDate(bEnd).getTime();
  return aStartMs <= bEndMs && bStartMs <= aEndMs;
}

/**
 * Submission-time deduction amount (spec 09 requirement 6):
 * `workingDays × dailySalary`, where `dailySalary = monthlySalary × 12 / 260`,
 * rounded to two decimal places. This is the amount held against the balance for
 * a pending request and debited from the reserve on approval.
 *
 * Verified: 10 days @ salary 3000 → 1384.62; 5 days → 692.31.
 */
export function calculateDeductionAmount(workingDays: number, monthlySalary: number): number {
  const dailySalary = (monthlySalary * 12) / WORKING_DAYS_PER_YEAR;
  return Math.round(workingDays * dailySalary * 100) / 100;
}

/**
 * Exact strings from spec 09's Error Messages table, verbatim. The two templated
 * rows are exposed as builder functions; every other row is a static key. Shared
 * by the API (400/403 bodies), the web form (inline errors + toasts), and any
 * client-side pre-validation, so the wording lives in exactly one place.
 *
 * NB: the overlap builder uses an en-dash (` – `) between the dates, matching the
 * spec byte-for-byte — a plain hyphen would fail downstream assertions.
 */
export const REQUEST_MESSAGES = {
  startInPast: 'Start date must be today or later',
  endBeforeStart: 'End date must be on or after start date',
  crossYear: 'Start and end dates must be within the same calendar year',
  insufficientBalance: (n: number): string =>
    `Insufficient vacation balance. You have ${n} day(s) available.`,
  overlap: (startDate: string, endDate: string): string =>
    `This request overlaps with an existing vacation request (${startDate} – ${endDate})`,
  noFinancials: 'Financial settings must be configured before requesting vacation',
  forAnotherMember: 'You can only submit vacation requests for yourself',
  reviewNotPending: 'Only pending requests can be reviewed',
  selfApproval: 'You cannot approve your own vacation request',
  invalidDecision: "Decision must be 'approved' or 'rejected'",
  commentTooLong: 'Comment must be at most 500 characters',
  cancelInvalidStatus: 'Only pending or approved requests can be cancelled',
  cancelForbidden: 'You do not have permission to cancel this request',
  reviewForbidden: 'You do not have permission to review vacation requests',
  noRequests: 'No vacation requests yet.',
  toastSubmitted: 'Vacation request submitted',
  toastApproved: 'Request approved',
  toastRejected: 'Request rejected',
  toastCancelledPending: 'Request cancelled',
  toastCancelledApproved: 'Request cancelled and reserve refunded',
  genericError: 'Something went wrong. Please try again.',
} as const;

/** Max length of an optional reviewer comment (spec 09 Validation Rule 6). */
export const REVIEWER_COMMENT_MAX = 500;

/** Is `s` a parseable 'YYYY-MM-DD' date (strict format + real calendar day)? */
function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return false;
  // Round-trip guard: rejects e.g. 2025-02-30 that JS would roll forward.
  return date.toISOString().slice(0, 10) === s;
}

export interface VacationRequestDatesInput {
  startDate: string;
  endDate: string;
}

export interface VacationRequestDatesResult {
  valid: boolean;
  fieldErrors: { startDate?: string; endDate?: string };
  /** True when start/end parse into different calendar years (surfaced as `cross_year`). */
  crossYear: boolean;
}

/**
 * Date-field + cross-year validation for a vacation request (spec 09 Validation
 * Rules 1–3). `today` ('YYYY-MM-DD') is supplied by the caller so this stays pure.
 *
 * - startDate: required, a valid date, and `>= today` → else `startInPast`.
 * - endDate: required, a valid date, and `>= startDate` → else `endBeforeStart`.
 * - crossYear: `UTCFullYear(start) !== UTCFullYear(end)` (only when both parse).
 *   The cross-year condition is returned via the `crossYear` flag, NOT a field
 *   error — the API surfaces it as a top-level `{ error: 'cross_year' }`.
 *
 * `valid` is true only when there are no field errors AND not crossYear.
 */
export function validateVacationRequestDates(
  input: { startDate?: unknown; endDate?: unknown },
  today: string,
): VacationRequestDatesResult {
  const fieldErrors: { startDate?: string; endDate?: string } = {};

  const rawStart = typeof input.startDate === 'string' ? input.startDate.trim() : '';
  const rawEnd = typeof input.endDate === 'string' ? input.endDate.trim() : '';

  const startValid = rawStart.length > 0 && isValidDateString(rawStart);
  const endValid = rawEnd.length > 0 && isValidDateString(rawEnd);

  // Rule 1 — start required, valid, today-or-later.
  if (!startValid || rawStart < today) {
    fieldErrors.startDate = REQUEST_MESSAGES.startInPast;
  }

  // Rule 2 — end required, valid, on-or-after start. When start is unparseable we
  // cannot compare, so we still require end to be a valid date first.
  if (!endValid || (startValid && rawEnd < rawStart)) {
    fieldErrors.endDate = REQUEST_MESSAGES.endBeforeStart;
  }

  // Rule 3 — cross-year is only meaningful when both endpoints parse.
  let crossYear = false;
  if (startValid && endValid) {
    crossYear =
      parseUtcDate(rawStart).getUTCFullYear() !== parseUtcDate(rawEnd).getUTCFullYear();
  }

  const valid = !fieldErrors.startDate && !fieldErrors.endDate && !crossYear;
  return { valid, fieldErrors, crossYear };
}

/**
 * Optional reviewer comment (spec 09 Validation Rule 6): empty/undefined/null →
 * valid with `value: null`; otherwise max 500 characters → else `commentTooLong`.
 * Not trimmed for the length check — the stored comment is the reviewer's text as
 * typed — but a whitespace-only comment collapses to `null` (treated as omitted).
 */
export function validateReviewerComment(
  comment: string | null | undefined,
): { valid: true; value: string | null } | { valid: false; error: string } {
  if (comment === null || comment === undefined || comment.trim().length === 0) {
    return { valid: true, value: null };
  }
  if (comment.length > REVIEWER_COMMENT_MAX) {
    return { valid: false, error: REQUEST_MESSAGES.commentTooLong };
  }
  return { valid: true, value: comment };
}

/**
 * Review decision guard (spec 09 Error Messages / review contract): the decision
 * must be exactly `'approved'` or `'rejected'`. Anything else is rejected by the
 * caller with `REQUEST_MESSAGES.invalidDecision`.
 */
export function isValidReviewDecision(decision: unknown): decision is 'approved' | 'rejected' {
  return decision === 'approved' || decision === 'rejected';
}

// ---------------------------------------------------------------------------
// Spec 10 — Organization Requests Page
// ---------------------------------------------------------------------------
// Pure helpers for the org-wide Requests page: parsing the `status`/`type`
// query parameters of GET /api/organizations/{orgId}/requests, and the page's
// forbidden / empty-state copy. Page access itself is gated by the
// `view-requests` capability (admin/manager) via `can(...)`.

/** The five valid values of the `status` query parameter (`pending` is the default). */
export type RequestStatusFilter = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'all';

export const REQUEST_STATUS_FILTERS: readonly RequestStatusFilter[] = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
  'all',
];

/**
 * Parse the `status` query parameter. Returns the value when it is one of the
 * five valid filters (case-sensitive, lowercase); otherwise falls back to the
 * default `'pending'` — covering `undefined`, empty string, and any unknown value.
 */
export function parseRequestStatusFilter(value: unknown): RequestStatusFilter {
  return REQUEST_STATUS_FILTERS.includes(value as RequestStatusFilter)
    ? (value as RequestStatusFilter)
    : 'pending';
}

/**
 * Request `type` query parameter. Reserved for future request types; today the
 * only valid (and default) value is `'vacation'`.
 */
export type RequestTypeFilter = 'vacation';

/**
 * Parse the `type` query parameter. Only `'vacation'` is defined today, and any
 * other/absent value falls back to it — so this always resolves to `'vacation'`.
 */
export function parseRequestTypeFilter(_value: unknown): RequestTypeFilter {
  return 'vacation';
}

/**
 * Requests-page copy (spec 10 Error Messages / States). `emptyOther` builds the
 * empty-state message for a non-pending filter from the lowercase status word,
 * e.g. `emptyOther('approved')` → `'No approved requests.'`.
 */
export const REQUESTS_PAGE_MESSAGES = {
  viewForbidden: 'You do not have permission to view requests',
  emptyPending: 'No pending requests.',
  emptyOther: (status: string) => `No ${status} requests.`,
} as const;

// ---------------------------------------------------------------------------
// Spec 11 — Projects
// ---------------------------------------------------------------------------
// Pure, isomorphic helpers for the Projects feature: project-name validation
// (shared by the API's POST/PUT and the web modal), the `status` query-param
// parser for the project list, the bulk add-members empty-array guard, and the
// one source of truth for every project message/toast string. Capabilities
// (`manage-projects`, `list-assigned-projects`) live in `CAPABILITY_MATRIX`
// above and are gated via `can(...)`.

/**
 * Exact strings from spec 11's Error Messages table, verbatim. Shared by the API
 * (400/403/404/409 bodies), the web form (inline errors + toasts), and any
 * client-side pre-validation so the wording lives in exactly one place.
 *
 * NB: `nameInvalidChars` is NOT present in spec 11's Error Messages table — it is a
 * genuine spec gap we fill to satisfy TC-11-INT-17, which requires a `<script>…`
 * payload to be rejected with a validation error on `name` via the allowed-character
 * class. Every other key is byte-for-byte from the spec's table.
 */
export const PROJECT_MESSAGES = {
  nameRequired: 'Project name is required',
  nameTooLong: 'Project name must be at most 100 characters',
  /** Spec gap — not in spec 11's Error Messages table; added for TC-11-INT-17 (see above). */
  nameInvalidChars: 'Project name contains invalid characters',
  nameDuplicate: 'A project with this name already exists',
  alreadyArchived: 'Project is already archived',
  alreadyActive: 'Project is already active',
  membersEmpty: 'At least one member is required',
  membersInvalid: 'One or more members not found or not active',
  forbidden: 'You do not have permission to manage projects',
  notFound: 'Project not found',
  toastCreated: 'Project created',
  toastUpdated: 'Project updated',
  toastArchived: 'Project archived',
  toastRestored: 'Project restored',
  toastMembersAdded: 'Members added',
  toastMemberRemoved: 'Member removed from project',
  archiveConfirm:
    'Archive this project? Members will no longer be able to log time against it.',
  genericError: 'Something went wrong. Please try again.',
  emptyState: 'No projects yet. Create your first project to start tracking time.',
} as const;

/** Max length of a project name in Unicode codepoints (spec 11 Validation Rule 1). */
export const PROJECT_NAME_MAX = 100;

/**
 * Allowed character class for a project name (spec 11 requirement 2): letters of any
 * script (`\p{L}`), digits (`\p{N}`), spaces, hyphens, ampersands, periods, and
 * parentheses. Anchored + `u` flag so a `<`/`>` (or any other character) fails.
 */
const PROJECT_NAME_PATTERN = /^[\p{L}\p{N} \-&.()]+$/u;

/**
 * Project name (spec 11 Validation Rules 1 / TC-11-UNIT-01, TC-11-INT-17): trim first,
 * then check required → too long → invalid chars → valid. Length is measured in Unicode
 * codepoints (`[...name].length`) rather than UTF-16 code units, matching the
 * codepoint-safety approach used elsewhere in this file (see `getAvatarInitials`), so a
 * name of astral-plane characters is counted by visible character, not surrogate pairs.
 */
export function validateProjectName(name: string): FieldResult {
  const value = (name ?? '').trim();
  if (value.length === 0) return fail(PROJECT_MESSAGES.nameRequired);
  if ([...value].length > PROJECT_NAME_MAX) return fail(PROJECT_MESSAGES.nameTooLong);
  if (!PROJECT_NAME_PATTERN.test(value)) return fail(PROJECT_MESSAGES.nameInvalidChars);
  return ok(value);
}

/** The three valid values of the projects `status` query parameter (`active` is default). */
export type ProjectStatusFilter = 'active' | 'archived' | 'all';

export const PROJECT_STATUS_FILTERS: readonly ProjectStatusFilter[] = [
  'active',
  'archived',
  'all',
];

/**
 * Parse the `status` query parameter (GET .../projects?status=...). Returns the value
 * when it is one of the three valid filters (case-sensitive, lowercase); otherwise
 * falls back to the default `'active'` — covering `undefined`, empty string, and any
 * unknown value. Mirrors `parseRequestStatusFilter` (spec 10).
 */
export function parseProjectStatusFilter(value: string | undefined): ProjectStatusFilter {
  return PROJECT_STATUS_FILTERS.includes(value as ProjectStatusFilter)
    ? (value as ProjectStatusFilter)
    : 'active';
}

/**
 * Bulk add-members payload guard (spec 11 requirement / POST .../members contract):
 * at least one membership id is required. A non-array or empty array is rejected with
 * `membersEmpty`. This is the pure "empty array" rule only — the deep checks that every
 * id exists, is active, and belongs to the caller's org are the API's job against the DB.
 */
export function validateMembershipIds(
  ids: unknown,
): { valid: true; value: string[] } | { valid: false; error: string } {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { valid: false, error: PROJECT_MESSAGES.membersEmpty };
  }
  return { valid: true, value: ids as string[] };
}

// ===========================================================================
// spec 12 — Time Tracking
// ---------------------------------------------------------------------------
// Pure, isomorphic helpers for time entries and the running timer: duration
// computation from an HH:MM range, elapsed-time / duration formatting for the
// UI, the timer-stop minute computation (from milliseconds so it stays pure),
// the core create/edit entry validator, the list-query range validator, the
// timer-metadata validator, and the one source of truth for every spec-12
// message/toast string. Capabilities (`view-time-tracking`,
// `manage-own-time-entries`, `manage-all-time-entries`, `use-timer`) live in
// `CAPABILITY_MATRIX` above and are gated via `can(...)`.
//
// Every function that needs "today" takes it as a 'YYYY-MM-DD' argument so it
// stays deterministic on both the API (which passes the member's today) and the
// web app — none of these helpers reads the wall clock.
// ===========================================================================

/** Max length of a time-entry / timer task in Unicode codepoints (Rules 8, 12). */
export const TIME_ENTRY_TASK_MAX = 200;
/** Max length of a time-entry / timer description in Unicode codepoints (Rules 9, 13). */
export const TIME_ENTRY_DESCRIPTION_MAX = 500;
/** Duration bounds in minutes (Rules 4, 5). */
export const DURATION_MINUTES_MIN = 1;
export const DURATION_MINUTES_MAX = 1440;
/** Back-dating window (Rule 3) and list-range window (Rule 11), both in days. */
export const MAX_BACKDATE_DAYS = 90;
export const MAX_RANGE_DAYS = 31;

/**
 * Every string from spec 12's Error Messages table (verbatim), plus the toasts,
 * confirmations, and empty-state copy. Shared by the API (400/403/404/409 bodies)
 * and the web form/toasts so the wording lives in exactly one place.
 *
 * The templated "Timer stopped — {duration} logged" row is exposed as the
 * `timerStoppedToast(durationHuman)` builder below rather than a static key, since
 * it interpolates the formatted duration; `toastTimerStoppedTemplate` documents the
 * raw template. NB: that toast uses an em-dash (` — `), matching the spec
 * byte-for-byte — a plain hyphen would fail downstream assertions.
 */
export const TIME_TRACKING_MESSAGES = {
  // Entry validation (Error Messages table + Validation Rules 1–9).
  dateRequired: 'Date is required',
  dateInvalid: 'Invalid date',
  dateFuture: 'Date cannot be in the future',
  dateTooOld: 'Date cannot be more than 90 days in the past',
  durationRequired: 'Duration is required',
  durationMin: 'Duration must be at least 1 minute',
  durationMax: 'Duration cannot exceed 24 hours',
  endTimeRequired: 'End time is required when start time is provided',
  endBeforeStart: 'End time must be after start time',
  taskTooLong: 'Task must be at most 200 characters',
  descriptionTooLong: 'Description must be at most 500 characters',
  projectInvalid: 'Project not found or archived',
  forbiddenEdit: 'You do not have permission to edit this time entry',
  forbiddenDelete: 'You do not have permission to delete this time entry',
  // Timer errors (API contract error bodies).
  timerAlreadyRunning: 'A timer is already running. Stop it before starting a new one.',
  timerNotRunning: 'No timer is currently running',
  // List-query validation (Validation Rule 11 + range/order rules).
  queryFromRequired: 'From date is required',
  queryToRequired: 'To date is required',
  queryRangeTooLarge: 'Date range cannot exceed 31 days',
  queryInvalidRange: 'From date must be before or equal to to date',
  // Page access.
  viewForbidden: 'You do not have access to time tracking',
  // Toasts.
  toastEntrySaved: 'Time entry saved',
  toastEntryDeleted: 'Time entry deleted',
  toastTimerStarted: 'Timer started',
  /** Documented raw template; build the real string with `timerStoppedToast(...)`. */
  toastTimerStoppedTemplate: 'Timer stopped — {duration} logged',
  toastTimerDiscarded: 'Timer discarded',
  // Confirmations.
  deleteConfirm: 'Delete this time entry? This action cannot be undone.',
  discardConfirm: 'Discard this timer? No time entry will be saved.',
  // Network/server error.
  genericError: 'Something went wrong. Please try again.',
  // Empty states.
  emptyPeriod: 'No time entries for this period.',
  emptyToday: 'No time logged today. Start a timer or add an entry.',
} as const;

/** "Timer stopped — {duration} logged" (Toast row, templated). */
export function timerStoppedToast(durationHuman: string): string {
  return `Timer stopped — ${durationHuman} logged`;
}

/** Strict `HH:MM` (00:00–23:59). */
const HHMM_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Parse `HH:MM` into minutes-since-midnight, or `NaN` when malformed. */
function parseHHMM(input: string): number {
  const match = HHMM_PATTERN.exec((input ?? '').trim());
  if (!match) return NaN;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * Duration in minutes between two same-day `HH:MM` times (spec FR-3, TC-12-UNIT-01).
 * Parses both to minutes-since-midnight and subtracts; the result is rounded UP to
 * the nearest whole minute (whole-minute inputs give the exact difference, so `ceil`
 * is a no-op here). Same-day only — no overnight handling (FR-6). This is the value
 * the API stores on the created entry.
 *
 * Verified: 09:00→11:30 = 150; 09:00→09:01 = 1; 00:00→23:59 = 1439.
 */
export function computeDurationFromRange(startHHMM: string, endHHMM: string): number {
  const start = parseHHMM(startHHMM);
  const end = parseHHMM(endHHMM);
  return Math.ceil(end - start);
}

/**
 * Format elapsed seconds as zero-padded `HH:MM:SS` (spec FR-21, TC-12-UNIT-02). Hours
 * are NOT capped at 24 — a 25-hour timer shows "25:00:00" — but are padded to at least
 * two digits. Used by the topbar indicator and the running-timer panel (both compute
 * elapsed client-side from `startedAt`).
 *
 * Verified: 0 → "00:00:00"; 3661 → "01:01:01"; 86399 → "23:59:59".
 */
export function formatElapsed(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Minutes to log when a timer is stopped (spec FR-14 / API contract, TC-12-UNIT-03):
 * `ceil(elapsedMs / 60000)`, minimum 1. Takes milliseconds — the API computes
 * `now - startedAt` and passes the ms — so this stays pure and deterministic. The
 * client's displayed elapsed time is decorative; the server never reads it back.
 *
 * Verified: 30_000 → 1 (minimum); 61_000 → 2; 7_200_000 → 120.
 */
export function computeTimerStopMinutes(elapsedMs: number): number {
  return Math.max(1, Math.ceil(elapsedMs / 60000));
}

/**
 * Format a whole-minute duration as `"Xh Ym"` (daily-view rows + the
 * "Timer stopped — {duration} logged" toast). Hours = floor(minutes / 60),
 * minutes = minutes % 60. Verified: 150 → "2h 30m"; 60 → "1h 0m"; 5 → "0h 5m".
 */
export function formatDurationHuman(minutes: number): string {
  const whole = Math.max(0, Math.floor(minutes));
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  return `${hours}h ${mins}m`;
}

/**
 * Format a whole-minute duration as total hours to one decimal (calendar/weekly cells).
 * Verified: 480 → "8.0"; 150 → "2.5"; 0 → "0.0".
 */
export function formatHoursOneDecimal(minutes: number): string {
  return (Math.max(0, minutes) / 60).toFixed(1);
}

/** Codepoint length (astral-safe), matching the idiom used by `validateProjectName`. */
function codepointLength(s: string): number {
  return [...s].length;
}

/** Whole-day difference `later - earlier` for two valid 'YYYY-MM-DD' strings. */
function diffInDays(earlier: string, later: string): number {
  return Math.round(
    (parseUtcDate(later).getTime() - parseUtcDate(earlier).getTime()) / 86400000,
  );
}

/** Coerce a JSON number or form string to a number; blanks/nullish → `NaN`. */
function toDurationNumber(input: number | string | null | undefined): number {
  if (typeof input === 'number') return input;
  if (typeof input === 'string' && input.trim().length > 0) return Number(input.trim());
  return NaN;
}

/** The raw request-body shape a time entry arrives as (create/edit). */
export interface TimeEntryInput {
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  durationMinutes?: number | string | null;
  task?: string | null;
  description?: string | null;
}

/** The normalized entry the API persists once validation passes. */
export interface NormalizedTimeEntry {
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  task: string | null;
  description: string | null;
}

export type TimeEntryValidation =
  | { valid: true; value: NormalizedTimeEntry }
  | { valid: false; errors: Record<string, string> };

/**
 * Core time-entry validator (spec 12 Validation Rules 1–9, TC-12-INT-09/28). Enforces
 * every field rule with the EXACT Error Messages strings and collects ALL applicable
 * errors (never stops at the first) so the UI can show every field error at once —
 * matching the collect-all convention of `validateMemberFinancials`/`validateSignup`.
 *
 * `opts.today` ('YYYY-MM-DD') is supplied by the caller (the member's today) so this
 * stays pure and deterministic. Error keys are the `field-error-{name}` testids:
 * `date`, `startTime`, `endTime`, `durationMinutes`, `task`, `description`.
 *
 * Two input modes (FR-3):
 *  - **Time range** (`startTime` present): `endTime` required; both `HH:MM`; end after
 *    start; `durationMinutes` auto-computed via `computeDurationFromRange` (any submitted
 *    duration is ignored — the API contract says the range wins).
 *  - **Duration only** (`startTime` absent): `durationMinutes` required, integer, 1–1440.
 *
 * On success `value` carries the normalized entry: trimmed task/description (empty → null),
 * `startTime`/`endTime` null in duration mode, and the stored `durationMinutes`.
 */
export function validateTimeEntry(
  input: TimeEntryInput,
  opts: { today: string },
): TimeEntryValidation {
  const errors: Record<string, string> = {};
  const today = opts.today;

  // --- date (Rules 1–3) ---
  const rawDate = typeof input.date === 'string' ? input.date.trim() : '';
  if (rawDate.length === 0) {
    errors.date = TIME_TRACKING_MESSAGES.dateRequired;
  } else if (!isValidDateString(rawDate)) {
    errors.date = TIME_TRACKING_MESSAGES.dateInvalid;
  } else if (rawDate > today) {
    errors.date = TIME_TRACKING_MESSAGES.dateFuture;
  } else if (diffInDays(rawDate, today) > MAX_BACKDATE_DAYS) {
    errors.date = TIME_TRACKING_MESSAGES.dateTooOld;
  }

  // --- mode selection ---
  const hasStart = typeof input.startTime === 'string' && input.startTime.trim().length > 0;
  const hasEnd = typeof input.endTime === 'string' && input.endTime.trim().length > 0;

  let normalizedStart: string | null = null;
  let normalizedEnd: string | null = null;
  let durationMinutes = NaN;

  if (hasStart) {
    // --- Mode A: time range (Rules 6, 7) ---
    const startStr = (input.startTime as string).trim();
    const startMin = parseHHMM(startStr);
    if (!hasEnd) {
      errors.endTime = TIME_TRACKING_MESSAGES.endTimeRequired;
    } else {
      const endStr = (input.endTime as string).trim();
      const endMin = parseHHMM(endStr);
      // A malformed or not-after end fails Rule 7 (there is no distinct message for a
      // malformed HH:MM in the spec, so the "after start" message covers it).
      if (!(Number.isFinite(startMin) && Number.isFinite(endMin) && endMin > startMin)) {
        errors.endTime = TIME_TRACKING_MESSAGES.endBeforeStart;
      } else {
        normalizedStart = startStr;
        normalizedEnd = endStr;
        durationMinutes = computeDurationFromRange(startStr, endStr);
      }
    }
  } else {
    // --- Mode B: duration only (Rules 4, 5) ---
    const raw = input.durationMinutes;
    const isMissing =
      raw === null || raw === undefined || (typeof raw === 'string' && raw.trim().length === 0);
    if (isMissing) {
      errors.durationMinutes = TIME_TRACKING_MESSAGES.durationRequired;
    } else {
      const value = toDurationNumber(raw);
      if (!Number.isInteger(value) || value < DURATION_MINUTES_MIN) {
        errors.durationMinutes = TIME_TRACKING_MESSAGES.durationMin;
      } else if (value > DURATION_MINUTES_MAX) {
        errors.durationMinutes = TIME_TRACKING_MESSAGES.durationMax;
      } else {
        durationMinutes = value;
      }
    }
  }

  // --- task (Rule 8) & description (Rule 9): trimmed, codepoint-counted ---
  const task = (input.task ?? '').trim();
  if (codepointLength(task) > TIME_ENTRY_TASK_MAX) {
    errors.task = TIME_TRACKING_MESSAGES.taskTooLong;
  }
  const description = (input.description ?? '').trim();
  if (codepointLength(description) > TIME_ENTRY_DESCRIPTION_MAX) {
    errors.description = TIME_TRACKING_MESSAGES.descriptionTooLong;
  }

  if (Object.keys(errors).length > 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    value: {
      date: rawDate,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      durationMinutes,
      task: task.length > 0 ? task : null,
      description: description.length > 0 ? description : null,
    },
  };
}

export type TimeEntryRangeValidation =
  | { valid: true }
  | { valid: false; error?: string; errors?: Record<string, string>; message?: string };

/**
 * List-query range validator (spec 12 GET /time-entries contract, Validation Rule 11,
 * TC-12-INT-26). `from`/`to` are required and must be valid 'YYYY-MM-DD' dates, `from`
 * must be on or before `to`, and the inclusive span may not exceed 31 days.
 *
 * The return shape mirrors the API's error bodies so the service layer can map cleanly
 * (see how `requests.service.ts` consumes spec 10's `parseRequestStatusFilter`):
 *  - missing `from`/`to` → `{ errors: { from | to } }` (→ `400 { errors: {...} }`).
 *  - `from` after `to`, or a malformed date → `{ error: 'invalid_range', message }`.
 *  - span > 31 days inclusive → `{ error: 'range_too_large', message }`.
 */
export function validateTimeEntryRange(from?: string, to?: string): TimeEntryRangeValidation {
  const rawFrom = typeof from === 'string' ? from.trim() : '';
  const rawTo = typeof to === 'string' ? to.trim() : '';

  const errors: Record<string, string> = {};
  if (rawFrom.length === 0) errors.from = TIME_TRACKING_MESSAGES.queryFromRequired;
  if (rawTo.length === 0) errors.to = TIME_TRACKING_MESSAGES.queryToRequired;
  if (Object.keys(errors).length > 0) return { valid: false, errors };

  if (!isValidDateString(rawFrom) || !isValidDateString(rawTo) || rawFrom > rawTo) {
    return {
      valid: false,
      error: 'invalid_range',
      message: TIME_TRACKING_MESSAGES.queryInvalidRange,
    };
  }

  // Inclusive span: a 31-day window (diff of 30) is allowed; 32 days (diff of 31) is not.
  if (diffInDays(rawFrom, rawTo) + 1 > MAX_RANGE_DAYS) {
    return {
      valid: false,
      error: 'range_too_large',
      message: TIME_TRACKING_MESSAGES.queryRangeTooLarge,
    };
  }

  return { valid: true };
}

/** The raw timer start/update metadata body (all fields optional; `projectId` is a DB concern). */
export interface TimerMetaInput {
  task?: string | null;
  description?: string | null;
}

export type TimerMetaValidation =
  | { valid: true; value: { task: string | null; description: string | null } }
  | { valid: false; errors: Record<string, string> };

/**
 * Timer start/update metadata validator (spec 12 Validation Rules 12–13). `task` (≤200)
 * and `description` (≤500) are both optional and trimmed; length is measured in Unicode
 * codepoints. `projectId` validity (exists / active / same-org) is a DB concern enforced
 * by the API, NOT here. Collects all errors, keyed by `task`/`description`.
 */
export function validateTimerMeta(input: TimerMetaInput): TimerMetaValidation {
  const errors: Record<string, string> = {};

  const task = (input.task ?? '').trim();
  if (codepointLength(task) > TIME_ENTRY_TASK_MAX) {
    errors.task = TIME_TRACKING_MESSAGES.taskTooLong;
  }
  const description = (input.description ?? '').trim();
  if (codepointLength(description) > TIME_ENTRY_DESCRIPTION_MAX) {
    errors.description = TIME_TRACKING_MESSAGES.descriptionTooLong;
  }

  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return {
    valid: true,
    value: {
      task: task.length > 0 ? task : null,
      description: description.length > 0 ? description : null,
    },
  };
}

/* ------------------------------------------------------------------ *
 * Spec 12 (change) — timezone helpers (isomorphic; shared by api + web)
 * ------------------------------------------------------------------ */

/**
 * The effective-timezone rule for Time Tracking: entry `startTime`/`endTime` are absolute
 * UTC instants in the DB; the wall-clock the viewer sees — and the wall-clock the composer
 * types — is interpreted in the session/viewer's `Account.timezone`, or `'UTC'` when that
 * is null/empty. Every helper below treats an empty / unknown / `'UTC'` zone as a pure
 * identity, so the pre-change behavior (UTC wall-clock everywhere) is preserved exactly.
 *
 * These are pure and take every "now" as an argument — the validation package never calls
 * `new Date()` / `Date.now()` itself, so the API and the web app share ONE tested
 * implementation and the two sides can never drift.
 */

interface WallClockParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** UTC calendar/clock components of an instant — the identity fallback for an unset zone. */
function utcParts(instant: Date): WallClockParts {
  return {
    year: instant.getUTCFullYear(),
    month: instant.getUTCMonth() + 1,
    day: instant.getUTCDate(),
    hour: instant.getUTCHours(),
    minute: instant.getUTCMinutes(),
    second: instant.getUTCSeconds(),
  };
}

/**
 * The calendar/clock components of `instant` as seen in `tz`, via the standard
 * `Intl.DateTimeFormat` "format-then-read-parts" trick (hourCycle `'h23'` so a 24:00 never
 * appears). An empty / unknown / `'UTC'` zone — or any `Intl` failure — falls back to UTC.
 */
function wallClockParts(instant: Date, tz: string): WallClockParts {
  if (!tz || tz === 'UTC') return utcParts(instant);
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const map: Record<string, number> = {};
    for (const part of dtf.formatToParts(instant)) {
      if (part.type !== 'literal') map[part.type] = Number(part.value);
    }
    if (!Number.isFinite(map.year)) return utcParts(instant);
    // hourCycle 'h23' still emits an hour of 24 at midnight in some engines — normalize.
    const hour = map.hour === 24 ? 0 : map.hour;
    return {
      year: map.year,
      month: map.month,
      day: map.day,
      hour,
      minute: map.minute,
      second: map.second,
    };
  } catch {
    return utcParts(instant);
  }
}

/**
 * The offset in minutes of `tz` at `instant` (Europe/Berlin in summer → +120,
 * America/New_York in summer → -240). `'UTC'`, an empty string, or an unknown zone → 0.
 */
export function tzOffsetMinutes(tz: string, instant: Date): number {
  if (!tz || tz === 'UTC') return 0;
  const p = wallClockParts(instant, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/**
 * Interpret `${dateISO}T${hhmm}:00` as wall-clock in `tz` and return the absolute UTC
 * instant. Compute a first guess from the offset at the naive-UTC instant, then do ONE
 * refinement pass with the offset at that guess (handling DST boundaries). An empty /
 * `'UTC'` / unknown zone yields the identity (`09:00` → `…T09:00:00.000Z`).
 */
export function zonedWallClockToUtc(dateISO: string, hhmm: string, tz: string): Date {
  const t0 = Date.parse(`${dateISO}T${hhmm}:00Z`);
  if (!Number.isFinite(t0)) return new Date(NaN);
  let guess = t0 - tzOffsetMinutes(tz, new Date(t0)) * 60000;
  guess = t0 - tzOffsetMinutes(tz, new Date(guess)) * 60000;
  return new Date(guess);
}

/** `"HH:MM"` (24h, zero-padded) of the instant `instantISO` as seen in `tz`. */
export function formatWallClockInTz(instantISO: string, tz: string): string {
  const p = wallClockParts(new Date(instantISO), tz);
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

/** Minutes since local midnight of `instantISO` in `tz` (grid block positioning). */
export function minutesOfDayInTz(instantISO: string, tz: string): number {
  const p = wallClockParts(new Date(instantISO), tz);
  return p.hour * 60 + p.minute;
}

/** The `YYYY-MM-DD` local date of `instantISO` in `tz` (timer-stop date + effective "today"). */
export function localDateInTz(instantISO: string, tz: string): string {
  const p = wallClockParts(new Date(instantISO), tz);
  return `${p.year}-${pad2(p.month)}-${pad2(p.day)}`;
}

/**
 * A short GMT-offset label for `tz` at the reference `instant`: `"GMT+2"`, `"GMT-5"`,
 * `"GMT+5:30"`, or `"UTC"` when the offset is zero. The instant is passed in (DST shifts the
 * offset) so the helper stays pure and testable — never an argless `new Date()` inside.
 */
export function gmtLabel(tz: string, instant: Date): string {
  const offset = tzOffsetMinutes(tz, instant);
  if (offset === 0) return 'UTC';
  const sign = offset > 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  return `GMT${sign}${hours}${mins > 0 ? `:${pad2(mins)}` : ''}`;
}

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
export type MemberCapability = 'view-list' | 'invite' | 'delete-restore' | 'edit-detail';

/**
 * Pure lookup against spec 04's Roles & Permission Matrix (TC-04-UNIT-05), widened by
 * spec 05's `edit-detail` (requirement 11 — same admin/manager-only shape as
 * `delete-restore`, kept as a distinct key since it gates a different endpoint).
 * `admin` and `manager` get every capability; `user` and `viewer` get read-only list
 * access and nothing else.
 */
const CAPABILITY_MATRIX: Record<Role, Record<MemberCapability, boolean>> = {
  admin: { 'view-list': true, invite: true, 'delete-restore': true, 'edit-detail': true },
  manager: { 'view-list': true, invite: true, 'delete-restore': true, 'edit-detail': true },
  user: { 'view-list': true, invite: false, 'delete-restore': false, 'edit-detail': false },
  viewer: { 'view-list': true, invite: false, 'delete-restore': false, 'edit-detail': false },
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

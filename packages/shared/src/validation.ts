/**
 * Framework-agnostic validation shared by the API (server-side enforcement) and
 * the web app (client-side inline validation). Keeping these pure and in one
 * place guarantees both sides agree on the rules — and on the exact error
 * messages mandated by spec 01.
 */

import { isRole, Role } from './enums';

/** Organization name max length (spec 01). */
export const ORG_NAME_MAX_LENGTH = 100;

/** First/last name max length (spec 01). */
export const NAME_MAX_LENGTH = 50;

/** Password length bounds (spec 01 / spec 02 shared policy). */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Email max length (spec 01). */
export const EMAIL_MAX_LENGTH = 254;

/** Job title max length (spec 06, requirement 4). */
export const JOB_TITLE_MAX_LENGTH = 100;

/** A validation result that also returns the normalized value on success. */
export type FieldValidation = { valid: true; value: string } | { valid: false; error: string };

/** A pass/fail validation result with an error message on failure. */
export type PolicyValidation = { valid: true } | { valid: false; error: string };

/**
 * Validate and normalize an organization name (spec 01): trimmed of surrounding
 * whitespace, non-empty after trimming, ≤ 100 chars.
 */
export function validateOrgName(input: string): FieldValidation {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Organization name is required' };
  }
  if (trimmed.length > ORG_NAME_MAX_LENGTH) {
    return {
      valid: false,
      error: `Organization name must be at most ${ORG_NAME_MAX_LENGTH} characters`,
    };
  }
  return { valid: true, value: trimmed };
}

// Letters (any script), spaces, hyphens, and apostrophes only.
const NAME_ALLOWED = /^[\p{L} '-]+$/u;

/**
 * Validate a person's name (spec 01): required, trimmed, 1–50 chars, and only
 * letters, hyphens, apostrophes, and spaces. `label` ("First name" / "Last name")
 * is used to build the exact error message.
 */
export function validateName(input: string, label: string): FieldValidation {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: `${label} is required` };
  }
  if (trimmed.length > NAME_MAX_LENGTH) {
    return { valid: false, error: `${label} must be at most ${NAME_MAX_LENGTH} characters` };
  }
  if (!NAME_ALLOWED.test(trimmed)) {
    return {
      valid: false,
      error: `${label} may contain only letters, hyphens, apostrophes, and spaces`,
    };
  }
  return { valid: true, value: trimmed };
}

/**
 * Shared password policy (spec 01 / spec 02): 8–128 characters, at least one
 * letter and one digit. Emits rule-specific messages.
 */
export function validatePassword(password: string): PolicyValidation {
  const value = typeof password === 'string' ? password : '';
  if (value.length === 0) {
    return { valid: false, error: 'Password is required' };
  }
  if (value.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  if (value.length > PASSWORD_MAX_LENGTH) {
    return { valid: false, error: `Password must be at most ${PASSWORD_MAX_LENGTH} characters` };
  }
  if (!/[A-Za-z]/.test(value)) {
    return { valid: false, error: 'Password must contain at least one letter' };
  }
  if (!/\d/.test(value)) {
    return { valid: false, error: 'Password must contain at least one digit' };
  }
  return { valid: true };
}

// Pragmatic email shape check: exactly one @, non-empty local part, and a
// dotted domain. Full RFC 5322 validation is intentionally out of scope.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Is `email` a syntactically valid email address? (specs 01, 04, 07) */
export function isValidEmail(email: string): boolean {
  return typeof email === 'string' && EMAIL_REGEX.test(email.trim());
}

/**
 * Validate an email address (spec 01): required, standard `local@domain.tld`
 * shape, ≤ 254 chars. Returns the trimmed value on success (use
 * {@link normalizeEmail} for the lowercased storage form).
 */
export function validateEmail(input: string): FieldValidation {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Email is required' };
  }
  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: 'Enter a valid email address' };
  }
  if (trimmed.length > EMAIL_MAX_LENGTH) {
    return { valid: false, error: `Email must be at most ${EMAIL_MAX_LENGTH} characters` };
  }
  return { valid: true, value: trimmed };
}

/** Canonical form used for storage and uniqueness checks: trimmed + lowercased. */
export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

/** Whether a password and its confirmation match (spec 02, reset). */
export function passwordsMatch(password: string, confirmation: string): boolean {
  return password === confirmation;
}

/** Whether two emails are the same account after normalization (spec 03, self-invite). */
export function isSameEmail(a: string, b: string): boolean {
  const normalized = normalizeEmail(a);
  return normalized.length > 0 && normalized === normalizeEmail(b);
}

/** A validation result that returns the parsed role on success. */
export type RoleValidation = { valid: true; value: Role } | { valid: false; error: string };

/** Validate an invitation role (spec 03): required and a member of the role enum. */
export function validateRole(role: string): RoleValidation {
  const trimmed = (role ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Role is required' };
  }
  if (!isRole(trimmed)) {
    return { valid: false, error: 'Invalid role' };
  }
  return { valid: true, value: trimmed };
}

/** Normalized invite payload after validation. */
export interface NormalizedInvite {
  email: string;
  role: Role;
}

/**
 * Validate an invite payload (spec 03, requirement 1). Returns either a map of
 * field errors or the normalized data.
 */
export function validateInvite(
  email: string,
  role: string,
): { errors: Record<string, string> } | { errors: null; data: NormalizedInvite } {
  const emailResult = validateEmail(email);
  const roleResult = validateRole(role);

  if (!emailResult.valid || !roleResult.valid) {
    const errors: Record<string, string> = {};
    if (!emailResult.valid) {
      errors.email = emailResult.error;
    }
    if (!roleResult.valid) {
      errors.role = roleResult.error;
    }
    return { errors };
  }

  return {
    errors: null,
    data: { email: normalizeEmail(emailResult.value), role: roleResult.value },
  };
}

/**
 * Validate a job title (spec 06, requirement 4): free text up to 100 chars,
 * may be empty (cleared). Returns the trimmed value on success.
 */
export function validateJobTitle(input: string): FieldValidation {
  const value = input ?? '';
  if (value.length > JOB_TITLE_MAX_LENGTH) {
    return { valid: false, error: `must be at most ${JOB_TITLE_MAX_LENGTH} characters` };
  }
  return { valid: true, value };
}

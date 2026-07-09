/**
 * Framework-agnostic validation shared by the API (server-side enforcement) and
 * the web app (client-side inline validation). Keeping these pure and in one
 * place guarantees both sides agree on the rules.
 */

/** Organization name max length (spec 01, requirement 4). */
export const ORG_NAME_MAX_LENGTH = 100;

/** Minimum password length (spec 02, requirement 3 — shared password policy). */
export const PASSWORD_MIN_LENGTH = 8;

/** Job title max length (spec 06, requirement 4). */
export const JOB_TITLE_MAX_LENGTH = 100;

/** A validation result that also returns the normalized value on success. */
export type FieldValidation = { valid: true; value: string } | { valid: false; error: string };

/** A pass/fail validation result with an error message on failure. */
export type PolicyValidation = { valid: true } | { valid: false; error: string };

/**
 * Validate and normalize an organization name (spec 01, requirement 4):
 * trimmed of surrounding whitespace, non-empty after trimming, ≤ 100 chars.
 */
export function validateOrgName(input: string): FieldValidation {
  const trimmed = (input ?? '').trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'organization name is required' };
  }
  if (trimmed.length > ORG_NAME_MAX_LENGTH) {
    return { valid: false, error: `must be at most ${ORG_NAME_MAX_LENGTH} characters` };
  }
  return { valid: true, value: trimmed };
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

/**
 * Shared password policy (spec 02, requirement 3): minimum 8 characters,
 * at least one letter and one digit.
 */
export function validatePassword(password: string): PolicyValidation {
  if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
    return { valid: false, error: `password must be at least ${PASSWORD_MIN_LENGTH} characters` };
  }
  if (!/[A-Za-z]/.test(password)) {
    return { valid: false, error: 'password must contain at least one letter' };
  }
  if (!/\d/.test(password)) {
    return { valid: false, error: 'password must contain at least one digit' };
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

/** Canonical form used for storage and uniqueness checks: trimmed + lowercased. */
export function normalizeEmail(email: string): string {
  return (email ?? '').trim().toLowerCase();
}

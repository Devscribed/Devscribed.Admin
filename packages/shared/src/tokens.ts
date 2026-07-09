/**
 * Time-limited token helpers shared by the API (enforcement) and tests.
 * Used for password-reset tokens (spec 02) and, later, invitation tokens
 * (spec 04) — both are "issued at T, valid for a TTL" tokens.
 */

/** Password-reset token lifetime (spec 02, requirement 8): 60 minutes. */
export const RESET_TOKEN_TTL_MINUTES = 60;
export const RESET_TOKEN_TTL_MS = RESET_TOKEN_TTL_MINUTES * 60 * 1000;

/** The moment a token issued at `issuedAt` with the given TTL expires. */
export function expiresAt(issuedAt: Date, ttlMs: number): Date {
  return new Date(issuedAt.getTime() + ttlMs);
}

/**
 * Whether a token issued at `issuedAt` with the given TTL is expired at `now`.
 * Expiry is inclusive: a token is expired once the full TTL has elapsed.
 */
export function isExpired(issuedAt: Date, ttlMs: number, now: Date = new Date()): boolean {
  return now.getTime() - issuedAt.getTime() >= ttlMs;
}

import { createHash, randomBytes } from 'crypto';

/** Spec 06, requirement 7. A token at exactly this age is already expired. */
export const EMAIL_CHANGE_TOKEN_TTL_HOURS = 24;

const TOKEN_BYTES = 32;

export interface GeneratedEmailChangeToken {
  /** Goes in the emailed link, and is never persisted. */
  token: string;
  /** Goes in the database, and can never be turned back into the token. */
  tokenHash: string;
}

/** SHA-256, hex-encoded — the only form of an email-change token the database ever sees. */
export function hashEmailChangeToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateEmailChangeToken(): GeneratedEmailChangeToken {
  // base64url: safe in a query string without escaping, so the link survives being
  // copied out of a mail client (same approach as PasswordResetToken, spec 02, and
  // Invitation, spec 03).
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashEmailChangeToken(token) };
}

export function emailChangeTokenExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + EMAIL_CHANGE_TOKEN_TTL_HOURS * 60 * 60_000);
}

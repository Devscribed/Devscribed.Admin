import { createHash, randomBytes } from 'crypto';

/** Spec 02, requirement 9. A token at exactly this age is already expired. */
export const RESET_TOKEN_TTL_MINUTES = 60;

const TOKEN_BYTES = 32;

export interface GeneratedResetToken {
  /** Goes in the emailed link, and is never persisted. */
  token: string;
  /** Goes in the database, and can never be turned back into the token. */
  tokenHash: string;
}

/** SHA-256, hex-encoded — the only form of a reset token the database ever sees. */
export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateResetToken(): GeneratedResetToken {
  // base64url: safe in a query string without escaping, so the link survives
  // being copied out of a mail client.
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashResetToken(token) };
}

export function resetTokenExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + RESET_TOKEN_TTL_MINUTES * 60_000);
}

export interface ResetTokenState {
  expiresAt: Date;
  usedAt: Date | null;
  isInvalidated: boolean;
}

/** All three conditions must hold; expiry is exclusive (requirement 9). */
export function isResetTokenUsable(token: ResetTokenState, now: Date): boolean {
  if (token.isInvalidated) return false;
  if (token.usedAt !== null) return false;
  return now.getTime() < token.expiresAt.getTime();
}

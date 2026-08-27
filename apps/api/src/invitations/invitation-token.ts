import { createHash, randomBytes } from 'crypto';

/** Spec 03, requirement 3. A token at exactly this age is already expired. */
export const INVITATION_TOKEN_TTL_DAYS = 7;

const TOKEN_BYTES = 32;

export interface GeneratedInvitationToken {
  /** Goes in the emailed link, and is never persisted. */
  token: string;
  /** Goes in the database, and can never be turned back into the token. */
  tokenHash: string;
}

/** SHA-256, hex-encoded — the only form of an invitation token the database ever sees. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function generateInvitationToken(): GeneratedInvitationToken {
  // base64url: safe in a query string without escaping, so the link survives being
  // copied out of a mail client (same approach as PasswordResetToken, spec 02).
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  return { token, tokenHash: hashInvitationToken(token) };
}

export function invitationTokenExpiry(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + INVITATION_TOKEN_TTL_DAYS * 24 * 60 * 60_000);
}

export interface InvitationTokenState {
  expiresAt: Date;
  /** "pending" | "used" | "invalidated". */
  status: string;
}

/** Status must be `pending` and expiry is exclusive (requirement 3). */
export function isInvitationTokenUsable(token: InvitationTokenState, now: Date): boolean {
  if (token.status !== 'pending') return false;
  return now.getTime() < token.expiresAt.getTime();
}

import { createHash, randomBytes } from 'node:crypto';

/**
 * Signing tokens, per the shared rule in the area README: 32 random bytes, URL-safe
 * base64, and only the SHA-256 hash is ever stored.
 *
 * This mirrors `auth/reset-token.ts` rather than reusing it on purpose — a password
 * reset and a signing invitation have different lifetimes and different blast radii, and
 * sharing the module would make one of them a silent dependency of the other's tuning.
 */
export interface GeneratedSigningToken {
  token: string;
  tokenHash: string;
}

export function hashSigningToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateSigningToken(): GeneratedSigningToken {
  // 32 bytes = 256 bits. base64url so the token survives being pasted out of an email
  // client and back into an address bar without percent-encoding.
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashSigningToken(token) };
}

/** `SIGNING_TOKEN_TTL_DAYS`, defaulting to the 14 days the spec's env table names. */
export function signingTokenTtlDays(): number {
  const configured = Number(process.env.SIGNING_TOKEN_TTL_DAYS);
  return Number.isFinite(configured) && configured > 0 ? configured : 14;
}

/**
 * The `/sign/{token}` link an invitation carries.
 *
 * It used to be built inside the old port's `issueInvitation`, which — besides minting a
 * token — is all that method ever did. Spec 04 removed the method, because a third-party
 * provider mints nothing of ours, so the three call sites that used to get a link from it
 * (the send, the next signer's turn, and the sweep's reminder) build it here instead. It
 * lives beside the token rather than in a service so that every caller, including the
 * reconciler, gets the same link without importing a service to ask for one.
 *
 * The signing page is a **web** route, not an API route — `/sign/{token}` is the first
 * route in the application with no session at all.
 */
export function signingPageUrl(token: string): string {
  const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');
  return `${base}/sign/${token}`;
}

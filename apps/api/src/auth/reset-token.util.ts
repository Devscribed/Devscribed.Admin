import { createHash, randomBytes } from 'node:crypto';

/** Generate a high-entropy, URL-safe reset token (64 hex chars). */
export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

/**
 * Hash a raw reset token for storage/lookup. Only the hash is persisted; the raw
 * token lives only in the emailed link (spec 02).
 */
export function hashResetToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

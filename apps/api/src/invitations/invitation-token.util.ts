import { createHash, randomBytes } from 'node:crypto';

/** Generate a high-entropy invitation token (64 hex chars). */
export function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hash a raw invitation token for storage/lookup (spec 03). */
export function hashInvitationToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

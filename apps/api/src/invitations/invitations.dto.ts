import type { InviteCreateInput } from '@devscribed/validation';

/** Raw request body for `POST /api/invitations`; every rule lives in `@devscribed/validation`. */
export type InviteCreateDto = Partial<InviteCreateInput>;

/**
 * Raw request body for `POST /api/invitations/accept`. Covers both the new-account and
 * existing-account variants (spec 03) — the service decides which fields matter by
 * checking whether an account already exists for the invitation's email.
 */
export interface InviteAcceptDto {
  token?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  password?: unknown;
  timezone?: unknown;
  orgSwitchConfirmed?: unknown;
}

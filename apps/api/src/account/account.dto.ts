import type { AccountSettingsInput, ChangePasswordInput } from '@devscribed/validation';

/** `PUT /api/account/settings` body — every field is untrusted until validated. */
export type UpdateSettingsDto = Partial<AccountSettingsInput>;

/** `POST /api/account/change-password` body. */
export type ChangePasswordDto = Partial<ChangePasswordInput>;

/** `POST /api/account/change-email` body. */
export interface ChangeEmailDto {
  newEmail?: unknown;
}

/** `POST /api/account/confirm-email` body (public — token alone). */
export interface ConfirmEmailDto {
  token?: unknown;
}

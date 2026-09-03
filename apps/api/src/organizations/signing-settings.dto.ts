/**
 * `PUT /api/organizations/{orgId}/settings/signing`.
 *
 * `confirmed` is part of the request rather than a client-side concern because the server
 * re-validates every rule: the confirmation modal gates its own button, and the API
 * refuses a change that arrives without the acknowledgement regardless of what any
 * client did or did not draw (validation rule 3).
 */
export interface UpdateSigningSettingsDto {
  provider?: string;
  confirmed?: boolean;
}

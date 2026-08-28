'use client';

/* ------------------------------------------------------------------ *
 * Wire shapes — spec 03, "API Contracts"
 *
 * Only what the documented responses promise. Where a screen needs something the
 * contract does not carry, the property is optional and the reader degrades — the
 * API is built in parallel against this same document, so a missing field must
 * never break the screen.
 * ------------------------------------------------------------------ */

/**
 * The eight profile fields, in the order the spec's mockup draws them: the address
 * block first, then the four sensitive ones. This array is the single source of
 * render order for both read mode and edit mode, so the two can never disagree.
 */
export const PROFILE_FIELDS = [
  'addressLine',
  'city',
  'postalCode',
  'country',
  'taxId',
  'dateOfBirth',
  'idDocumentNumber',
  'bankDetails',
] as const;

export type ProfileField = (typeof PROFILE_FIELDS)[number];

/** The labels the spec's mockup prints in the left column. */
export const PROFILE_LABELS: Record<ProfileField, string> = {
  addressLine: 'Address',
  city: 'City',
  postalCode: 'Postal code',
  country: 'Country',
  taxId: 'Tax ID (УНП)',
  dateOfBirth: 'Date of birth',
  idDocumentNumber: 'ID document',
  bankDetails: 'Bank details',
};

export interface ProfileEditor {
  id: string;
  name: string;
}

export interface MemberProfileDto {
  addressLine: string | null;
  city: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  dateOfBirth: string | null;
  idDocumentNumber: string | null;
  bankDetails: string | null;
  /** Requirement 20 — the fields whose value in this response is a mask, not the value. */
  maskedFields: string[];
  /**
   * Documented as always present, but a profile that has never been saved
   * (requirement 14: the row is created lazily) has no timestamp to report, so the
   * footer line reads it as optional and simply omits itself.
   */
  updatedAt?: string | null;
  updatedBy?: ProfileEditor | null;
  canEdit: boolean;
}

/** The `PUT` body — any subset; explicit `null` clears (spec's PUT contract). */
export type MemberProfilePatch = Partial<Record<ProfileField, string | null>>;

export const memberProfileUrl = (orgId: string, memberId: string) =>
  `/api/organizations/${orgId}/members/${encodeURIComponent(memberId)}/profile`;

export const membersUrl = (orgId: string) => `/api/organizations/${orgId}/members`;

/**
 * A row of `GET .../members` (user-management spec 04). Spec 03 needs one thing this
 * documented shape does not promise — the **account** behind the membership, which is
 * what decides `isSelf` and therefore whether the caller may see their own PII. It is
 * read when present; otherwise the caller falls back to the email, which the row does
 * carry and which is unique per account.
 */
export interface MemberRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  accountId?: string;
}

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

/**
 * "14 March 1991" — the mockup's read-mode date of birth.
 *
 * Parsed as UTC because the value is a date, not an instant: `new Date('1991-03-14')`
 * is midnight UTC, and rendering it in a negative-offset zone would print the 13th.
 */
export function formatBirthDate(value: string | null): string | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match === null) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "20 Aug 2026" — the footer's "Last updated {date} by {name}". */
export function formatUpdatedDay(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** True when nothing has ever been filled in — the `profile-empty` state. */
export function isProfileEmpty(profile: MemberProfileDto): boolean {
  return PROFILE_FIELDS.every((field) => (profile[field] ?? '').trim().length === 0);
}

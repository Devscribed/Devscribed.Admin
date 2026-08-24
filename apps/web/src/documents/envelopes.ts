'use client';

import type {
  EnvelopeEventType,
  EnvelopeStatus,
  PdfStatus,
  SignerStatus,
  TemplateFieldType,
} from '@devscribed/validation';

/* ------------------------------------------------------------------ *
 * Wire shapes — spec 02, "API Contracts"
 *
 * Only what the documented responses carry. Where a screen needs something the
 * contract does not promise, the property is optional and the reader falls back —
 * a missing field must degrade the screen, never break it, because the API is
 * built in parallel against this same document.
 * ------------------------------------------------------------------ */

export interface EnvelopeListSigner {
  id: string;
  roleKey: string;
  name: string;
  order: number;
  status: SignerStatus;
}

export interface EnvelopeListItem {
  id: string;
  title: string;
  templateName: string;
  templateVersionNumber: number;
  status: EnvelopeStatus;
  pdfStatus: PdfStatus;
  sentAt: string | null;
  expiresAt: string | null;
  signers: EnvelopeListSigner[];
}

export interface EnvelopeListResponse {
  envelopes: EnvelopeListItem[];
  total: number;
  canManage: boolean;
}

export interface EnvelopeFieldDto {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  /** `sender` or `signer:{roleKey}` (spec 01, validation rule 7). */
  filledBy: string;
  value: string | null;
  autofilled: boolean;
  /** Not in the documented `fields` shape; honoured when the API sends it. */
  maxLength?: number | null;
  options?: string[] | null;
  /**
   * Spec 03. Neither of these is in the documented `GET .../envelopes/{id}` field shape,
   * but the spec's own screens need both, so they are read when the API sends them and
   * the screen degrades without them:
   *
   * - `autofillSource` names the catalogue key behind an autofilled value, which is what
   *   the marker's tooltip prints ("⟲ today" vs "⟲ from profile"). Absent, the marker
   *   still appears and just says "from profile".
   * - `masked` marks a value the caller is not cleared to read (Alt Flow "Manager creates
   *   a contract for a member whose PII they cannot read"; TC-03-INT-08 says the field is
   *   "marked masked for G"). Absent, the field renders as an ordinary editable input.
   */
  autofillSource?: string | null;
  masked?: boolean;
  /** Requirement 10 — this value was shortened to fit `maxLength` and needs the warning. */
  autofillTruncated?: boolean;
}

/** An `autofillGaps` entry — a bound field the subject's profile could not fill. */
export interface AutofillGap {
  key: string;
  label: string;
  source: string;
}

export interface EnvelopeSignerDto {
  id: string;
  roleKey: string;
  label: string;
  name: string;
  email: string;
  order: number;
  status: SignerStatus;
  signedAt: string | null;
  /** Undocumented in the `GET` sample but required by the Signers tab after a decline. */
  declinedAt?: string | null;
  declineReason?: string | null;
  /** `delivered` | `bounced` | … — drives the bounce warning. */
  lastEmailStatus?: string | null;
}

export interface EnvelopeDetail {
  id: string;
  title: string;
  status: EnvelopeStatus;
  template: { id: string; name: string; versionNumber: number };
  fields: EnvelopeFieldDto[];
  signers: EnvelopeSignerDto[];
  /** Present only once sent (documented). Before that the fill form is the document. */
  renderedHtml: string | null;
  documentHash: string | null;
  pdfStatus: PdfStatus;
  expiresAt: string | null;
  sentAt: string | null;
  /**
   * The documented `GET` response carries `expiresAt` (null until send) but no
   * `expiresInDays`, which is the value the draft's "Expires in [n] days" control
   * edits and `PUT` accepts. Read when present; otherwise the form seeds itself
   * from `ENVELOPE_LIMITS.expiryDaysDefault`.
   */
  expiresInDays?: number;
  subjectMembershipId?: string | null;
  voidedAt?: string | null;
  voidReason?: string | null;
  completedAt?: string | null;
  canEdit: boolean;
  canSend: boolean;
  canVoid: boolean;
  canDownload: boolean;
}

export interface CreateEnvelopeResponse {
  id: string;
  templateVersionId: string;
  templateVersionNumber: number;
  title: string;
  status: EnvelopeStatus;
  fieldValues: Record<string, string>;
  /** Requirement 11 — the keys autofill populated, so the fill form can mark them. */
  autofilled: string[];
  /** Requirement 7 / Alt Flow "Incomplete profile". Absent when there was no subject. */
  autofillGaps?: AutofillGap[];
  /** Requirement 10 — keys whose resolved value was shortened to fit `MaxLength`. */
  autofillTruncated?: string[];
  signers: { id: string; roleKey: string; label: string; order: number; name: string; email: string }[];
}

export interface SendEnvelopeResponse {
  status: EnvelopeStatus;
  sentAt: string;
  expiresAt: string;
  documentHash: string;
  notifiedSignerId: string;
}

export interface AuditActor {
  kind: string;
  name?: string | null;
  email?: string | null;
}

export interface AuditEvent {
  id: string;
  type: EnvelopeEventType;
  occurredAt: string;
  actor: AuditActor | null;
  ipAddress: string | null;
  userAgent: string | null;
  documentHash: string | null;
}

export interface AuditResponse {
  events: AuditEvent[];
  chain: { valid: boolean; firstInvalidEventId: string | null };
}

export interface DocumentUrlResponse {
  url: string;
  expiresInSeconds: number;
  sha256?: string;
}

/* ---- Public signing surface ---------------------------------------- */

export type SigningState =
  | 'ready_to_sign'
  | 'already_signed'
  | 'declined'
  | 'voided'
  | 'expired'
  | 'not_your_turn'
  | 'completed'
  /** Local only — every failure that must not distinguish itself collapses here. */
  | 'invalid';

export interface SigningField {
  key: string;
  label: string;
  type: TemplateFieldType;
  required: boolean;
  maxLength?: number | null;
  options?: string[] | null;
}

export interface SigningPayload {
  state: SigningState;
  envelope?: {
    title: string;
    senderOrganizationName: string;
    renderedHtml: string;
    documentHash: string;
    expiresAt: string | null;
  } | null;
  /**
   * `GET /api/sign/{token}` reports the signer's own outcome here; the `POST .../sign`
   * response reports the same two timestamps at the top level. Both are optional, and the
   * panels below read the top-level value first and fall back to this one — which is what
   * lets a *reopened* link still say when it was signed.
   */
  signer?: {
    name: string;
    roleLabel: string;
    status?: SignerStatus;
    signedAt?: string | null;
    declinedAt?: string | null;
  } | null;
  fields?: SigningField[];
  consentText?: string;
  /** Carried by the terminal states; each panel renders only what it was given. */
  signedAt?: string | null;
  declinedAt?: string | null;
  voidedAt?: string | null;
  expiredAt?: string | null;
  reason?: string | null;
  envelopeStatus?: EnvelopeStatus;
  downloadAvailable?: boolean;
}

export interface SignResponse {
  state: SigningState;
  signedAt: string;
  envelopeStatus: EnvelopeStatus;
  downloadAvailable: boolean;
}

/* ------------------------------------------------------------------ *
 * URLs
 * ------------------------------------------------------------------ */

export const envelopesUrl = (orgId: string) => `/api/organizations/${orgId}/envelopes`;

export const envelopeUrl = (orgId: string, envelopeId: string) =>
  `${envelopesUrl(orgId)}/${envelopeId}`;

/** The token is path data from an email; it never reaches a URL unencoded. */
export const signingUrl = (token: string) => `/api/sign/${encodeURIComponent(token)}`;

/* ------------------------------------------------------------------ *
 * Presentation
 * ------------------------------------------------------------------ */

const STATUS_LABELS: Record<EnvelopeStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partially_signed: 'Partially signed',
  completed: 'Completed',
  declined: 'Declined',
  voided: 'Voided',
  expired: 'Expired',
};

export function envelopeStatusLabel(status: EnvelopeStatus): string {
  return STATUS_LABELS[status] ?? status;
}

export type BadgeTone = 'active' | 'inactive' | 'warning' | 'info' | 'neutral';

/**
 * The spec names the tones as Draft neutral, Sent/Partially signed info, Completed
 * success, Declined danger, Voided neutral, Expired warning. Meridian's `Badge` has no
 * `success` or `danger` tone — its vocabulary is active/inactive — so completion maps to
 * `active` (the green pill) and a decline to `inactive` (the red one). The rendered
 * colours are what the spec asked for; only the prop name differs.
 */
export function envelopeStatusTone(status: EnvelopeStatus): BadgeTone {
  switch (status) {
    case 'completed':
      return 'active';
    case 'declined':
      return 'inactive';
    case 'expired':
      return 'warning';
    case 'sent':
    case 'partially_signed':
      return 'info';
    default:
      return 'neutral';
  }
}

const SIGNER_STATUS_LABELS: Record<SignerStatus, string> = {
  pending: 'Pending',
  notified: 'Notified',
  viewed: 'Viewed',
  signed: 'Signed',
  declined: 'Declined',
};

export function signerStatusLabel(status: SignerStatus): string {
  return SIGNER_STATUS_LABELS[status] ?? status;
}

export function signerStatusTone(status: SignerStatus): BadgeTone {
  switch (status) {
    case 'signed':
      return 'active';
    case 'declined':
      return 'inactive';
    case 'viewed':
    case 'notified':
      return 'info';
    default:
      return 'neutral';
  }
}

/** The list column and the audit rows: "20 Aug 2026". */
export function formatDay(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * "20 Aug 2026, 14:02 UTC" — the mockup's signer and audit timestamps.
 *
 * Forced to UTC rather than the viewer's zone: the shared rule is that timestamps are
 * stored in UTC and displayed with their zone named, and an audit line whose meaning
 * depends on where the reader is sitting is not evidence.
 */
export function formatUtcTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  const day = date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const time = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${day}, ${time} UTC`;
}

/** "23 September 2026" — the signing page's long-form expiry and void dates. */
export function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** The header and footer show the hash abbreviated, as the mockup does: `4f3a…9c21`. */
export function abbreviateHash(hash: string | null | undefined): string {
  if (!hash) return '—';
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 4)}…${hash.slice(-4)}`;
}

const EVENT_LABELS: Record<EnvelopeEventType, string> = {
  created: 'Created',
  sent: 'Sent',
  email_accepted: 'Accepted',
  email_delivered: 'Delivered',
  email_bounced: 'Bounced',
  viewed: 'Viewed',
  signed: 'Signed',
  declined: 'Declined',
  reminded: 'Reminded',
  voided: 'Voided',
  expired: 'Expired',
  completed: 'Completed',
  downloaded: 'Downloaded',
  pdf_failed: 'PDF failed',
  tamper_detected: 'Tamper detected',
};

export function eventLabel(type: EnvelopeEventType): string {
  return EVENT_LABELS[type] ?? type;
}

/** A signer owns `signer:{roleKey}`; everything else belongs to the sender. */
export const ownerKeyFor = (roleKey: string) => `signer:${roleKey}`;

/**
 * The role label to print next to a signer-owned field in the fill form's read-only
 * preview ("filled by Contractor"). Falls back to the raw owner string so an owner the
 * client does not recognize still reads as something rather than as blank.
 */
export function ownerLabel(
  filledBy: string,
  signers: readonly { roleKey: string; label: string }[],
): string {
  const roleKey = filledBy.startsWith('signer:') ? filledBy.slice('signer:'.length) : filledBy;
  return signers.find((signer) => signer.roleKey === roleKey)?.label ?? roleKey;
}

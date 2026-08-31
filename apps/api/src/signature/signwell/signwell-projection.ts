import { flattenFields } from './signwell-types';
import type { SignWellDocument } from './signwell-types';

/**
 * Requirement 36 — **a provider response is never logged in full.**
 *
 * `fetchState` and `completedDocument` responses pass through this projection, which
 * keeps status, timestamps, recipient identity and decline reasons, and drops field
 * values. Only the projection may be logged, ever.
 *
 * The field values are the reason. Under spec 03 a field can hold a tax id, a bank
 * account or an identity document number, and a log line is the one place in the system
 * with no access control on it at all. Each field keeps its `api_id` — `Signature_1`,
 * `TextField_1` — which is what a projected field carries in place of its value, and is
 * enough to debug a materialization mismatch.
 *
 * The signing URL is dropped too, and for a stronger reason than tidiness: it is a
 * working link that signs **as** its recipient, sitting next to that recipient's email
 * address.
 */
export interface ProjectedRecipient {
  id: string | null;
  name: string | null;
  email: string | null;
  signingOrder: number | null;
  status: string | null;
  signedAt: string | null;
  declinedAt: string | null;
  declineReason: string | null;
}

export interface ProjectedField {
  apiId: string | null;
  type: string | null;
  required: boolean | null;
  recipientId: string | null;
  page: number | null;
}

export interface ProjectedDocument {
  id: string | null;
  status: string | null;
  testMode: boolean | null;
  archived: boolean | null;
  createdAt: string | null;
  updatedAt: string | null;
  completedAt: string | null;
  declinedAt: string | null;
  declineMessage: string | null;
  errorMessage: string | null;
  /** Ours, and only ours: the two keys we set are what correlates a log line. */
  metadata: { envelopeId: string | null; organizationId: string | null };
  recipients: ProjectedRecipient[];
  fields: ProjectedField[];
  pageCounts: (number | null)[];
}

export function projectDocument(document: SignWellDocument | null | undefined): ProjectedDocument {
  const metadata = (document?.metadata ?? {}) as Record<string, unknown>;

  return {
    id: str(document?.id),
    status: str(document?.status),
    testMode: bool(document?.test_mode),
    archived: bool(document?.archived),
    createdAt: str(document?.created_at),
    updatedAt: str(document?.updated_at),
    completedAt: str(document?.completed_at),
    declinedAt: str(document?.declined_at),
    declineMessage: str(document?.decline_message),
    errorMessage: str(document?.error_message),
    metadata: {
      envelopeId: str(metadata.envelope_id),
      organizationId: str(metadata.organization_id),
    },
    recipients: (document?.recipients ?? []).map((recipient) => ({
      id: str(recipient?.id),
      name: str(recipient?.name),
      email: str(recipient?.email),
      signingOrder: num(recipient?.signing_order),
      status: str(recipient?.status),
      signedAt: str(recipient?.signed_at),
      declinedAt: str(recipient?.declined_at),
      declineReason: str(recipient?.decline_reason),
      // `embedded_signing_url` is deliberately absent, and its absence is the point.
    })),
    // Page-grouped in the real payloads, so it is flattened through the one function that
    // knows that. `value` is deliberately absent.
    fields: flattenFields(document?.fields).map((field) => ({
      apiId: str(field?.api_id),
      type: str(field?.type),
      required: bool(field?.required),
      recipientId: str(field?.recipient_id),
      page: num(field?.page),
    })),
    pageCounts: (document?.files ?? []).map((file) => num(file?.pages_number)),
  };
}

/** One line, safe to log: what the document is, not what is written in it. */
export function describeDocument(document: SignWellDocument | null | undefined): string {
  const projected = projectDocument(document);
  return JSON.stringify({
    id: projected.id,
    status: projected.status,
    envelopeId: projected.metadata.envelopeId,
    recipients: projected.recipients.map((r) => ({ id: r.id, status: r.status })),
    fields: projected.fields.map((f) => ({ apiId: f.apiId, type: f.type, recipientId: f.recipientId })),
  });
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function num(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

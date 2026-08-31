/**
 * The shapes SignWell's API actually returns, as captured against their sandbox on
 * 28 Aug 2026 — not as their documentation describes them. Where the two disagree the
 * observation wins and the difference is written down here, because the next person to
 * read this will otherwise re-derive it from a failing send.
 *
 * Every field is optional or nullable on purpose. This is a foreign JSON document, and a
 * hand-written interface is a claim about it rather than a proof; the projection and the
 * adapter both read defensively so a shape change costs a mapped `null` and never a 500.
 */

/** `fields` is an ARRAY OF ARRAYS, page-grouped. A `fields.map(f => …)` reads nothing. */
export type SignWellFieldPages = readonly (readonly SignWellField[])[];

export interface SignWellField {
  api_id?: string | null;
  type?: string | null;
  required?: boolean | null;
  recipient_id?: string | null;
  page?: number | null;
  /** Under spec 03 this can be a tax id, a bank account, or an identity document number. */
  value?: unknown;
  label?: string | null;
}

export interface SignWellRecipient {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  signing_order?: number | null;
  /**
   * Observed values: `created` before send, then `sent` for the recipient whose turn is
   * open and `waiting` for the rest; `viewed`, `signed` and `declined` afterwards. It was
   * **null on every recipient** in the captured `document_sent` delivery while a `GET`
   * moments later returned them correctly — which is requirement 21 in one observation.
   */
  status?: string | null;
  /**
   * A working link that signs **as this recipient**, returned at creation for every
   * recipient and stable across calls. It is never stored, never logged and never cached
   * (requirement 6), and it is the first thing redacted before a payload is persisted
   * (requirement 35).
   */
  embedded_signing_url?: string | null;
  signed_at?: string | null;
  declined_at?: string | null;
  decline_reason?: string | null;
}

export interface SignWellFile {
  name?: string | null;
  /** `0` until their asynchronous parse has read the file — requirement 38. */
  pages_number?: number | null;
}

export interface SignWellDocument {
  id?: string | null;
  /** `Created` → `Sending` → `Sent` → `Completed`; also `Declined`, `Canceled`, `Expired`. */
  status?: string | null;
  name?: string | null;
  test_mode?: boolean | null;
  archived?: boolean | null;
  created_at?: string | null;
  updated_at?: string | null;
  completed_at?: string | null;
  declined_at?: string | null;
  decline_message?: string | null;
  error_message?: string | null;
  metadata?: Record<string, unknown> | null;
  recipients?: readonly SignWellRecipient[] | null;
  fields?: SignWellFieldPages | readonly SignWellField[] | null;
  files?: readonly SignWellFile[] | null;
  expires_in?: number | null;
}

export interface SignWellDocumentList {
  documents?: readonly SignWellDocument[] | null;
  current_page?: number | null;
  next_page?: number | null;
  total_pages?: number | null;
  total_count?: number | null;
}

export interface SignWellHook {
  id?: string | null;
  callback_url?: string | null;
}

/** The body of a webhook delivery. There is no signature header; the hash is in here. */
export interface SignWellNotificationBody {
  event?: {
    hash?: string | null;
    time?: number | null;
    type?: string | null;
    related_signer?: { email?: string | null; name?: string | null } | null;
  } | null;
  data?: {
    object?: SignWellDocument | null;
    account_id?: string | null;
    workspace_id?: string | null;
  } | null;
}

/**
 * Flattens the page-grouped field structure. Written once, here, because the nesting is
 * the exact trap a redactor and a materialization check both fall into: a flat `.map()`
 * type-checks against the interface above and silently reads nothing.
 */
export function flattenFields(
  fields: SignWellFieldPages | readonly SignWellField[] | null | undefined,
): SignWellField[] {
  if (!Array.isArray(fields)) return [];
  const flat: SignWellField[] = [];
  for (const entry of fields as readonly unknown[]) {
    if (Array.isArray(entry)) {
      for (const field of entry as readonly SignWellField[]) {
        if (field && typeof field === 'object') flat.push(field);
      }
    } else if (entry && typeof entry === 'object') {
      flat.push(entry as SignWellField);
    }
  }
  return flat;
}

/**
 * One field the create request asks for, requirement 14d.
 *
 * `page` and the box are ours: the copy places every field on an execution page it lays out
 * itself (requirement 14e), because nothing here can measure where a block landed on a
 * rendered page.
 */
export interface SignWellCreateField {
  api_id: string;
  type: 'signature' | 'text';
  /** Their recipient id, which our adapter sets to the signing order. */
  recipient_id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
  required: boolean;
}

/** The document body `POST /documents` is sent, field for field from requirement 13. */
export interface SignWellCreateDocumentBody {
  test_mode: boolean;
  draft: false;
  /** `file_url` is never used: it would mean exposing a public URL to an unsigned contract. */
  files: readonly { name: string; file_base64: string }[];
  recipients: readonly {
    id: string;
    name: string;
    email: string;
    signing_order: number;
    send_email: false;
  }[];
  apply_signing_order: true;
  /**
   * Never `true`. SignWell materializes only the fields the request supplies and parses
   * nothing out of the file — BUG-001 measured it against six tag syntaxes and a probe with
   * no tag at all, and every one of them left the document in `Draft` with no fields.
   */
  text_tags: false;
  /** Grouped per file, and we send one file. Each entry names its own page.  */
  fields: readonly (readonly SignWellCreateField[])[];
  embedded_signing: true;
  embedded_signing_notifications: false;
  /** Our sweep sends reminders, so there is one reminder policy and not two. */
  reminders: false;
  expires_in: number;
  name: string;
  /** Correlation without trusting a webhook body to tell us who it is about. */
  metadata: { envelope_id: string; organization_id: string };
  api_application_id?: string;
  allow_decline: true;
  /** Reassignment would break the binding between a signer row and an email address. */
  allow_reassign: false;
}

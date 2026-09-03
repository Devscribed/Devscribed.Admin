/**
 * Envelope validation, the signing state machine, and the audit hash chain —
 * specs/documents/02-envelopes-and-signing.md.
 *
 * Like `documents.ts`, this module is shared verbatim by the Next.js app, the public
 * signing page, and the NestJS API, so a rule can never drift between the three places
 * that enforce it. Two things follow from that and shape the whole file:
 *
 * 1. **Zero dependencies, no DOM, no Node built-ins.** The package compiles to plain
 *    CommonJS in `dist/` and is imported by a browser bundle as well as by a Node
 *    service. `require('crypto')` would either break the client bundle or force every
 *    consumer to configure a polyfill, so SHA-256, Base64 and UTF-8 encoding are
 *    implemented here in pure TypeScript. `computeEventHash` therefore stays
 *    **synchronous and pure**: the API, an offline verifier, and a test all call the same
 *    function and get the same string, which is the entire point of requirement 38.
 *    (The alternative — an injected digest function with a lazily `require`d Node
 *    default — was rejected because it makes the hash depend on which host resolved it,
 *    and a signature's tamper evidence must not have two implementations.)
 *
 * 2. **The functions decide, the tables are data.** The state machine (requirement 36),
 *    the limits, and every error message are exported as data so the API, the UI, and the
 *    tests all read the same table rather than each re-encoding the spec.
 */

import { validateEmail, type FieldResult } from './index';

/* ------------------------------------------------------------------ *
 * Types — these mirror the Prisma enums in apps/api/prisma/schema.prisma
 * one-for-one, including the snake_case spelling, so a value can cross the
 * ORM boundary without a translation layer that could disagree.
 * ------------------------------------------------------------------ */

export type EnvelopeStatus =
  | 'draft'
  | 'sent'
  | 'partially_signed'
  | 'completed'
  | 'declined'
  | 'voided'
  | 'expired';

/** Declaration order is the lifecycle order; the status filter renders in it. */
export const ENVELOPE_STATUSES: readonly EnvelopeStatus[] = [
  'draft',
  'sent',
  'partially_signed',
  'completed',
  'declined',
  'voided',
  'expired',
];

export type SignerStatus = 'pending' | 'notified' | 'viewed' | 'signed' | 'declined';

export const SIGNER_STATUSES: readonly SignerStatus[] = [
  'pending',
  'notified',
  'viewed',
  'signed',
  'declined',
];

export type SignatureType = 'drawn' | 'typed';

export type PdfStatus = 'not_required' | 'pending' | 'ready' | 'failed';

export const PDF_STATUSES: readonly PdfStatus[] = ['not_required', 'pending', 'ready', 'failed'];

/**
 * The event types of the audit trail (Data Model → EnvelopeEvent).
 *
 * Spec 04 adds the last two. A `provider_synced` event records the provider key and the
 * provider's own status string and **nothing else** — no field values, no field keys —
 * which is spec 02 requirement 40 unchanged rather than relaxed for a second writer.
 */
export type EnvelopeEventType =
  | 'created'
  | 'sent'
  | 'email_accepted'
  | 'email_delivered'
  | 'email_bounced'
  | 'viewed'
  | 'signed'
  | 'declined'
  | 'reminded'
  | 'voided'
  | 'expired'
  | 'completed'
  | 'downloaded'
  | 'pdf_failed'
  | 'tamper_detected'
  // Spec 04 — written by the reconciler when a remote provider's state was read and our
  // rows were moved to it.
  | 'provider_synced'
  | 'provider_error';

export const ENVELOPE_EVENT_TYPES: readonly EnvelopeEventType[] = [
  'created',
  'sent',
  'email_accepted',
  'email_delivered',
  'email_bounced',
  'viewed',
  'signed',
  'declined',
  'reminded',
  'voided',
  'expired',
  'completed',
  'downloaded',
  'pdf_failed',
  'tamper_detected',
  'provider_synced',
  'provider_error',
];

/**
 * The hash-chain algorithm version written to `EnvelopeEvent.SchemaVersion`. A change to
 * the concatenation in `computeEventHash` must bump this, so a verifier can tell an old
 * row apart from a tampered one instead of reporting every historical event as broken.
 */
export const EVENT_HASH_SCHEMA_VERSION = 1;

/* ------------------------------------------------------------------ *
 * Limits
 * ------------------------------------------------------------------ */

export const ENVELOPE_LIMITS = {
  titleMax: 200,
  signerNameMax: 100,
  signerEmailMax: 254,
  /** Both the void reason and the decline reason (validation rules 10 and 11). */
  reasonMax: 500,
  typedSignatureMax: 100,
  /** 512 KB, measured on the decoded PNG bytes rather than on the data-URI string:
   *  Base64 inflates by a third, and the cap in the spec is about the image. */
  signatureImageMaxBytes: 524288,
  expiryDaysMin: 1,
  expiryDaysMax: 365,
  expiryDaysDefault: 30,
} as const;

/* ------------------------------------------------------------------ *
 * Messages — every row of the spec's "Error Messages" table, verbatim.
 * Parameterized rows are functions rather than strings with placeholders so that
 * exactly one place knows how the sentence is assembled (the same convention as
 * TEMPLATE_MESSAGES in documents.ts).
 * ------------------------------------------------------------------ */

export const ENVELOPE_MESSAGES = {
  title: {
    required: 'Document title is required',
    /** Validation rule 1 states one message for the whole 1–200 rule; the "Value too
     *  long" row is the only sentence the product has for a length overflow, so an
     *  over-long title borrows it rather than telling the user a filled field is empty. */
    tooLong: 'Document title must be at most 200 characters',
  },
  expiry: {
    outOfRange: 'Expiry must be between 1 and 365 days',
  },
  signer: {
    nameRequired: 'Signer name is required',
    nameTooLong: 'Signer name must be at most 100 characters',
    /** Rule 4 gives a single message for empty, malformed, and over-long alike — the
     *  address is either usable or it is not, and the distinction helps nobody. */
    emailInvalid: 'Enter a valid email address',
  },
  field: {
    required: (label: string) => `${label} is required`,
    tooLong: (label: string, max: number) => `${label} must be at most ${max} characters`,
    invalidDate: 'Enter a valid date',
    invalidNumber: 'Enter a number',
    invalidEmail: 'Enter a valid email address',
  },
  send: {
    missingFields: 'Fill in every required field before sending',
    incompleteSigners: 'Both signers need a name and an email address',
    alreadySent: 'This document has already been sent',
    mailFailure: 'We could not send the invitation. Please try again.',
  },
  edit: {
    afterSend: 'This document has already been sent and cannot be edited',
  },
  void: {
    reasonRequired: 'A reason is required',
    wrongStatus: 'Only sent or partially signed documents can be voided',
  },
  decline: {
    reasonTooLong: 'Reason must be at most 500 characters',
  },
  resend: {
    tooSoon: 'Please wait a moment before resending',
    wrongSigner: "This signer's turn has not started yet",
  },
  pdf: {
    notReady: 'The signed PDF is still being prepared',
    failed: 'The signed PDF could not be generated',
  },
  template: {
    notPublished: 'Select a published template',
    archived: 'This template is archived and cannot be used for new documents',
  },
  signing: {
    invalidLink: 'This signing link is not valid.',
    expired: (date: string) => `This link expired on ${date}.`,
    voided: (date: string) => `This document was withdrawn by the sender on ${date}.`,
    declined: 'This document was declined and is no longer available for signature.',
    notYourTurn: 'It is not your turn to sign yet. We will email you when the document is ready.',
    consentRequired: 'You must agree to sign electronically',
    emptySignature: 'Please draw your signature',
    typedSignatureEmpty: 'Enter your full name to sign',
    signatureTooLarge: 'Signature image is too large',
    integrityFailure: 'We could not verify this document. Please contact the sender.',
    rateLimited: 'Too many requests. Please try again in a moment.',
    /** Requirement 21 — the ESIGN/UETA consent record, rendered in full on the page. */
    consentText:
      'I agree to sign this document electronically and that my electronic signature is legally binding.',
  },
  bounce: (email: string) => `We could not deliver the invitation to ${email}`,
  noPermission: 'You do not have permission to manage documents',
  generic: 'Something went wrong. Please try again.',
  toast: {
    draftSaved: 'Draft saved',
    sent: 'Sent for signature',
    resent: 'Signing link resent',
    voided: 'Document voided',
    signed: 'Thank you. Your signature has been recorded.',
    declined: 'You declined to sign this document.',
  },
  empty: {
    noDocuments: 'No documents yet. Create one from a template to get started.',
  },
} as const;

/* ------------------------------------------------------------------ *
 * State machine
 * ------------------------------------------------------------------ */

/** Requirement 36 / invariant 3 — these four accept no further transition. */
export const TERMINAL_STATUSES: readonly EnvelopeStatus[] = [
  'completed',
  'declined',
  'voided',
  'expired',
];

/**
 * The state machine as data, so the API and the tests read the same table instead of each
 * re-deriving it from the diagram.
 *
 * Note what is *absent*: `draft` can only be sent. A draft is never voided (there is
 * nothing in flight to withdraw — it is deleted instead) and never expires, because
 * `ExpiresAt` is only set at send.
 */
export const ENVELOPE_TRANSITIONS: Record<EnvelopeStatus, readonly EnvelopeStatus[]> = {
  draft: ['sent'],
  sent: ['partially_signed', 'declined', 'voided', 'expired'],
  partially_signed: ['completed', 'declined', 'voided', 'expired'],
  completed: [],
  declined: [],
  voided: [],
  expired: [],
};

export function canTransition(from: EnvelopeStatus, to: EnvelopeStatus): boolean {
  const allowed = ENVELOPE_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

export function isTerminal(status: EnvelopeStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/**
 * Invariant 1 — only a `draft` may be edited or deleted. Kept next to the transition
 * table because "may I edit this?" is the same question as "has it moved on?", and a
 * caller that had to answer it by listing statuses would be the place the rule drifts.
 */
export function canEditOrDelete(status: EnvelopeStatus): boolean {
  return status === 'draft';
}

/** Requirement 32 — only an in-flight envelope can be withdrawn. */
export function canVoid(status: EnvelopeStatus): boolean {
  return status === 'sent' || status === 'partially_signed';
}

/**
 * Requirement 34: expiry is **lazy and authoritative**. A stored status is never trusted
 * over the clock, because the sweep that materializes `expired` is an optimization — if
 * it has not run, or has failed for a day, a link must still be dead. Every read of an
 * envelope and every token validation goes through here.
 *
 * Terminal statuses are left alone: an envelope that completed before its expiry date is
 * completed forever, and re-labelling a voided envelope as expired would rewrite history.
 */
export function effectiveStatus(
  status: EnvelopeStatus,
  expiresAt: Date | null,
  now: Date = new Date(),
): EnvelopeStatus {
  if (isTerminal(status)) return status;
  if (expiresAt === null || expiresAt === undefined) return status;
  return expiresAt.getTime() < now.getTime() ? 'expired' : status;
}

/* ------------------------------------------------------------------ *
 * Field validators
 * ------------------------------------------------------------------ */

const ok = (value: string): FieldResult => ({ valid: true, value });
const fail = (error: string): FieldResult => ({ valid: false, error });

/** Validation rule 1 — required, 1–200 characters. */
export function validateEnvelopeTitle(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(ENVELOPE_MESSAGES.title.required);
  if (value.length > ENVELOPE_LIMITS.titleMax) return fail(ENVELOPE_MESSAGES.title.tooLong);
  return ok(value);
}

/** Validation rule 3 — required before sending, 1–100 characters. */
export function validateSignerName(input: string): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) return fail(ENVELOPE_MESSAGES.signer.nameRequired);
  if (value.length > ENVELOPE_LIMITS.signerNameMax) {
    return fail(ENVELOPE_MESSAGES.signer.nameTooLong);
  }
  return ok(value);
}

/**
 * Validation rule 4 — the address rule is the package's existing one (same pattern, same
 * normalization to lowercase), only the message differs: this surface says
 * "Enter a valid email address" for every failure, including an empty field, because
 * "Email is required" belongs to the signup form and not to a signer row.
 */
export function validateSignerEmail(input: string): FieldResult {
  const result = validateEmail(input ?? '');
  if (result.valid) {
    return result.value.length > ENVELOPE_LIMITS.signerEmailMax
      ? fail(ENVELOPE_MESSAGES.signer.emailInvalid)
      : result;
  }
  return fail(ENVELOPE_MESSAGES.signer.emailInvalid);
}

/**
 * Validation rules 10 and 11 — one function for both reasons, because the only thing that
 * differs between voiding (required) and declining (optional) is the presence check.
 * Absent-and-optional is a valid empty string, not an error.
 */
export function validateReason(
  input: string | null | undefined,
  required: boolean,
): FieldResult {
  const value = (input ?? '').trim();
  if (value.length === 0) {
    return required ? fail(ENVELOPE_MESSAGES.void.reasonRequired) : ok('');
  }
  if (value.length > ENVELOPE_LIMITS.reasonMax) {
    return fail(ENVELOPE_MESSAGES.decline.reasonTooLong);
  }
  return ok(value);
}

/**
 * Validation rule 2 — an integer between 1 and 365.
 *
 * `unknown` rather than `number` on purpose: this value arrives from a JSON body and from
 * an `<input type="number">`, so the string `"30"` and the number `30.5` both have to be
 * handled here rather than by every caller. One message covers every failure, matching the
 * single row in the error table.
 */
export function validateExpiryDays(
  input: unknown,
): { valid: true; value: number } | { valid: false; error: string } {
  const raw = typeof input === 'string' ? input.trim() : input;
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw !== '' ? Number(raw) : NaN;

  if (!Number.isInteger(n)) return { valid: false, error: ENVELOPE_MESSAGES.expiry.outOfRange };
  if (n < ENVELOPE_LIMITS.expiryDaysMin || n > ENVELOPE_LIMITS.expiryDaysMax) {
    return { valid: false, error: ENVELOPE_MESSAGES.expiry.outOfRange };
  }
  return { valid: true, value: n };
}

/* ------------------------------------------------------------------ *
 * Signatures
 * ------------------------------------------------------------------ */

export type SignaturePayload =
  | { type: 'drawn'; image: string }
  | { type: 'typed'; name: string };

const PNG_DATA_URI = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/;

/**
 * Requirement 22 and validation rules 8–9. A drawn signature must be a PNG data URI, at
 * most 512 KB decoded, and carry actual ink; a typed one is 1–100 non-whitespace
 * characters.
 *
 * The wire shape is `{ type, value }` (the `POST /api/sign/{token}/sign` contract), but
 * the returned discriminated union names the payload for what it is — `image` or `name` —
 * so a caller cannot store a typed name in the image column. Both spellings are accepted
 * on input so the UI can hold its state in whichever shape suits it.
 */
export function validateSignature(
  payload: unknown,
): { valid: true; value: SignaturePayload } | { valid: false; error: string } {
  if (typeof payload !== 'object' || payload === null) {
    return { valid: false, error: ENVELOPE_MESSAGES.signing.emptySignature };
  }

  const p = payload as Record<string, unknown>;

  if (p.type === 'typed') {
    const raw = p.name ?? p.value;
    const name = typeof raw === 'string' ? raw.trim() : '';
    if (name.length === 0) {
      return { valid: false, error: ENVELOPE_MESSAGES.signing.typedSignatureEmpty };
    }
    if (name.length > ENVELOPE_LIMITS.typedSignatureMax) {
      return { valid: false, error: ENVELOPE_MESSAGES.signing.typedSignatureEmpty };
    }
    return { valid: true, value: { type: 'typed', name } };
  }

  if (p.type === 'drawn') {
    const raw = p.image ?? p.value;
    if (typeof raw !== 'string') {
      return { valid: false, error: ENVELOPE_MESSAGES.signing.emptySignature };
    }
    const image = raw.trim();
    const match = PNG_DATA_URI.exec(image);
    if (!match) {
      // Not a data URI at all, or a data URI of some other type. Both are "there is no
      // drawing here" from the signer's point of view, and the error table has exactly
      // one sentence for that.
      return { valid: false, error: ENVELOPE_MESSAGES.signing.emptySignature };
    }

    const bytes = decodeBase64(match[1].replace(/\s+/g, ''));
    if (bytes === null) {
      return { valid: false, error: ENVELOPE_MESSAGES.signing.emptySignature };
    }
    if (bytes.length > ENVELOPE_LIMITS.signatureImageMaxBytes) {
      return { valid: false, error: ENVELOPE_MESSAGES.signing.signatureTooLarge };
    }
    if (pngHasInk(bytes) === false) {
      return { valid: false, error: ENVELOPE_MESSAGES.signing.emptySignature };
    }
    return { valid: true, value: { type: 'drawn', image } };
  }

  return { valid: false, error: ENVELOPE_MESSAGES.signing.emptySignature };
}

/* ------------------------------------------------------------------ *
 * Field ownership (requirement 19)
 * ------------------------------------------------------------------ */

const SIGNER_PREFIX = 'signer:';

/**
 * `FilledBy` is `sender` or `signer:{roleKey}` (spec 01, FR-26). An owner may be given
 * either way — `'contractor'` and `'signer:contractor'` mean the same thing — so a caller
 * holding a bare role key does not have to remember to prefix it.
 */
function ownerMatches(filledBy: string, owner: string): boolean {
  const f = (filledBy ?? '').trim();
  const o = (owner ?? '').trim();
  if (o === 'sender') return f === 'sender';
  const normalized = o.startsWith(SIGNER_PREFIX) ? o : SIGNER_PREFIX + o;
  return f === normalized;
}

/** The keys of `fields` this owner is allowed to write, in declaration order. */
export function fieldsOwnedBy(
  fields: readonly { key: string; filledBy: string }[],
  owner: string,
): string[] {
  return fields.filter((f) => ownerMatches(f.filledBy, owner)).map((f) => f.key);
}

/**
 * Requirement 19: "The server ignores any attempt to submit values for a field the signer
 * does not own." Ignores, not rejects — a signing page that 400s because it echoed back a
 * sender-owned value it was shown read-only would be a support ticket, not a defence, and
 * the defence is the same either way: the value never reaches the merge.
 *
 * Values are normalized to strings because `FieldValues` is a `{ key: string }` map;
 * anything that is not a scalar (an array, an object, a nested payload) is dropped rather
 * than stringified, since there is no field type it could belong to.
 */
export function filterSubmittedValues(
  submitted: Record<string, unknown>,
  fields: readonly { key: string; filledBy: string }[],
  owner: string,
): Record<string, string> {
  const owned = new Set(fieldsOwnedBy(fields, owner));
  const result: Record<string, string> = {};

  for (const key of Object.keys(submitted ?? {})) {
    if (!owned.has(key)) continue;
    const value = submitted[key];
    if (value === null || value === undefined) {
      // A cleared input, not a missing one — required-ness is checked separately.
      result[key] = '';
    } else if (typeof value === 'string') {
      result[key] = value;
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      result[key] = String(value);
    }
  }

  return result;
}

/* ------------------------------------------------------------------ *
 * Audit hash chain (requirements 38–39)
 * ------------------------------------------------------------------ */

/**
 * A stable JSON encoding: object keys sorted recursively, array order preserved.
 *
 * Key order in `Metadata` is an accident of whichever code path built the object, so
 * hashing `JSON.stringify(metadata)` directly would make an event's hash depend on the
 * insertion order of a map — the chain would break for reasons that have nothing to do
 * with tampering.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function canonicalize(value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      // `undefined` members are dropped rather than encoded as null: JSON.stringify
      // drops them too, so keeping them would make the canonical form disagree with
      // what the database actually stored.
      if (source[key] === undefined) continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  // Functions and symbols cannot appear in Metadata; encode them as absent.
  return null;
}

export interface ChainInput {
  previousEventHash: string | null;
  envelopeId: string;
  type: string;
  /** ISO-8601, UTC — the exact string stored on the row, never a re-formatted Date. */
  occurredAt: string;
  /** `ActorAccountId ?? ActorEmail ?? ''`, resolved by the caller. */
  actor: string | null;
  metadata: unknown;
}

/**
 * Requirement 38, exactly as written there:
 *
 *   EventHash = SHA-256( PreviousEventHash ‖ EnvelopeId ‖ Type ‖ OccurredAt(ISO-8601)
 *                        ‖ (ActorAccountId ?? ActorEmail ?? '') ‖ canonicalJson(Metadata) )
 *
 * The parts are concatenated with no separator because the spec says so and because two
 * implementations of one hash are worse than any theoretical improvement to it. The
 * concatenation is still unambiguous in practice: the first three parts have fixed shapes
 * (a 64-character hex digest or the empty string for the genesis event, a UUID, a value
 * from the closed `EnvelopeEventType` set), the timestamp is fixed-width ISO-8601, and the
 * canonical JSON that ends the string always starts with one of `{`, `[`, `"` or a digit.
 */
export function computeEventHash(input: ChainInput): string {
  const parts =
    (input.previousEventHash ?? '') +
    input.envelopeId +
    input.type +
    input.occurredAt +
    (input.actor ?? '') +
    canonicalJson(input.metadata);
  return sha256Hex(utf8Encode(parts));
}

export interface ChainLink extends ChainInput {
  eventHash: string;
}

/**
 * Requirement 39 — recompute the chain and report the **first** divergence.
 *
 * Reporting the first one rather than a list is deliberate: once a link is wrong every
 * subsequent link is wrong too, so a list would be noise. The index is what the audit
 * endpoint turns into `firstInvalidEventId`.
 *
 * Both halves are checked. A row whose `EventHash` no longer matches its own contents
 * catches an edited event; a row whose `PreviousEventHash` no longer matches its
 * predecessor catches a *deleted* one, which is the case an "each row hashes itself"
 * scheme would miss entirely.
 */
export function verifyChain(
  events: readonly ChainLink[],
): { valid: true } | { valid: false; brokenAtIndex: number } {
  let previous: string | null = null;

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const expectedPrevious = i === 0 ? '' : previous;
    // The genesis event may store the empty previous hash as either '' or NULL.
    if ((event.previousEventHash ?? '') !== (expectedPrevious ?? '')) {
      return { valid: false, brokenAtIndex: i };
    }
    const recomputed = computeEventHash(event);
    if (recomputed !== event.eventHash) {
      return { valid: false, brokenAtIndex: i };
    }
    previous = recomputed;
  }

  return { valid: true };
}

/* ================================================================== *
 * Primitives — SHA-256, Base64, UTF-8, and just enough PNG.
 *
 * Everything below is implementation detail that exists only because this package
 * has no dependencies and must run unchanged in Node and in a browser bundle.
 * ================================================================== */

/** UTF-8 bytes, hand-rolled so the module needs neither TextEncoder nor Buffer typings. */
function utf8Encode(input: string): Uint8Array {
  const bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let code = input.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < input.length) {
      const next = input.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (next - 0xdc00);
        i++;
      }
    }
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Returns null for anything that is not well-formed standard Base64. */
export function decodeBase64(input: string): Uint8Array | null {
  const value = input ?? '';
  if (value.length % 4 !== 0) return null;

  let padding = 0;
  if (value.endsWith('==')) padding = 2;
  else if (value.endsWith('=')) padding = 1;

  const body = value.slice(0, value.length - padding);
  const out = new Uint8Array((value.length / 4) * 3 - padding);
  let outIndex = 0;
  let buffer = 0;
  let bits = 0;

  for (let i = 0; i < body.length; i++) {
    const index = BASE64_ALPHABET.indexOf(body[i]);
    if (index < 0) return null;
    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[outIndex++] = (buffer >> bits) & 0xff;
    }
  }

  return outIndex === out.length ? out : out.subarray(0, outIndex);
}

const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const HEX = '0123456789abcdef';

/**
 * SHA-256 (FIPS 180-4) over raw bytes, returning lowercase hex.
 *
 * Exported because the same digest secures three different things in this area — the
 * event chain here, `DocumentHash` at send (requirement 10), and `SignedPdfHash` at
 * completion — and they must all be the one implementation.
 */
export function sha256Hex(bytes: Uint8Array): string {
  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ]);

  // Padding: the message, a 0x80 byte, zeroes, then the bit length as a 64-bit big-endian
  // integer. The high 32 bits are always zero here — a 512 MB signature is not a concern.
  const bitLength = bytes.length * 8;
  const paddedLength = ((bytes.length + 9 + 63) >> 6) << 6;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  padded[paddedLength - 4] = (bitLength >>> 24) & 0xff;
  padded[paddedLength - 3] = (bitLength >>> 16) & 0xff;
  padded[paddedLength - 2] = (bitLength >>> 8) & 0xff;
  padded[paddedLength - 1] = bitLength & 0xff;

  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        (padded[offset + i * 4] << 24) |
        (padded[offset + i * 4 + 1] << 16) |
        (padded[offset + i * 4 + 2] << 8) |
        padded[offset + i * 4 + 3];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, hh] = [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7]];

    for (let i = 0; i < 64; i++) {
      const s1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (hh + s1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const s0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0] + a) >>> 0;
    h[1] = (h[1] + b) >>> 0;
    h[2] = (h[2] + c) >>> 0;
    h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0;
    h[5] = (h[5] + f) >>> 0;
    h[6] = (h[6] + g) >>> 0;
    h[7] = (h[7] + hh) >>> 0;
  }

  let out = '';
  for (let i = 0; i < 8; i++) {
    const value = h[i];
    for (let shift = 28; shift >= 0; shift -= 4) {
      out += HEX[(value >>> shift) & 0xf];
    }
  }
  return out;
}

/** SHA-256 of a string's UTF-8 bytes — the form the API needs for `DocumentHash`. */
export function sha256HexOfString(input: string): string {
  return sha256Hex(utf8Encode(input));
}

function rotr(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0;
}

/* ------------------------------------------------------------------ *
 * PNG ink detection
 *
 * "A drawn signature with no ink is rejected" (requirement 22) cannot be answered from
 * the file's framing alone: a blank canvas and a signed one differ only in pixel data,
 * and the pixel data is DEFLATE-compressed. So this section decompresses the IDAT stream,
 * reverses the row filters, and looks for a single non-transparent pixel.
 *
 * The rule it follows: this check can only ever *prove* emptiness. Anything it cannot
 * analyse — an interlaced image, 16-bit samples, a format with no alpha channel at all —
 * returns `null` and the signature is accepted. Rejecting a signature the signer really
 * drew is the worse failure by a wide margin.
 * ------------------------------------------------------------------ */

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** true = ink found, false = provably blank, null = cannot tell. */
export function pngHasInk(bytes: Uint8Array): boolean | null {
  if (bytes.length < 8) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_MAGIC[i]) return null;

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat: Uint8Array[] = [];

  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type =
      String.fromCharCode(bytes[offset + 4]) +
      String.fromCharCode(bytes[offset + 5]) +
      String.fromCharCode(bytes[offset + 6]) +
      String.fromCharCode(bytes[offset + 7]);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) return null;

    if (type === 'IHDR') {
      if (length < 13) return null;
      width = readUint32(bytes, dataStart);
      height = readUint32(bytes, dataStart + 4);
      bitDepth = bytes[dataStart + 8];
      colorType = bytes[dataStart + 9];
      interlace = bytes[dataStart + 12];
    } else if (type === 'IDAT') {
      idat.push(bytes.subarray(dataStart, dataEnd));
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4; // skip the CRC
  }

  // Only the shape a <canvas> actually produces is analysed: 8-bit, non-interlaced, with
  // an alpha channel. Everything else is unanalysable rather than empty.
  if (interlace !== 0 || bitDepth !== 8) return null;
  if (colorType !== 4 && colorType !== 6) return null;
  if (width <= 0 || height <= 0 || idat.length === 0) return null;

  const channels = colorType === 6 ? 4 : 2;
  const bytesPerPixel = channels;
  const stride = width * bytesPerPixel;
  const expected = height * (stride + 1);

  const compressed = concatBytes(idat);
  // Skip the 2-byte zlib header; the trailing Adler-32 is simply never read.
  if (compressed.length < 3) return null;
  const raw = inflate(compressed.subarray(2), expected);
  if (raw === null || raw.length < expected) return null;

  const alphaOffset = channels - 1;
  const line = new Uint8Array(stride);
  const previous = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    const filter = raw[rowStart];
    for (let x = 0; x < stride; x++) {
      line[x] = unfilterByte(filter, raw[rowStart + 1 + x], line, previous, x, bytesPerPixel);
    }
    for (let x = alphaOffset; x < stride; x += bytesPerPixel) {
      if (line[x] !== 0) return true;
    }
    previous.set(line);
  }

  return false;
}

function unfilterByte(
  filter: number,
  value: number,
  line: Uint8Array,
  previous: Uint8Array,
  x: number,
  bpp: number,
): number {
  const a = x >= bpp ? line[x - bpp] : 0;
  const b = previous[x];
  const c = x >= bpp ? previous[x - bpp] : 0;
  switch (filter) {
    case 0:
      return value & 0xff;
    case 1:
      return (value + a) & 0xff;
    case 2:
      return (value + b) & 0xff;
    case 3:
      return (value + ((a + b) >> 1)) & 0xff;
    case 4:
      return (value + paeth(a, b, c)) & 0xff;
    default:
      return value & 0xff;
  }
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array {
  let total = 0;
  for (const chunk of chunks) total += chunk.length;
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * DEFLATE (RFC 1951) — decompression only, stopping at `limit` bytes.
 * ------------------------------------------------------------------ */

interface Huffman {
  counts: Uint16Array;
  symbols: Uint16Array;
}

function buildHuffman(lengths: Uint8Array, count: number): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < count; i++) counts[lengths[i]]++;
  counts[0] = 0;

  const offsets = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offsets[i] = offsets[i - 1] + counts[i - 1];

  const symbols = new Uint16Array(count);
  for (let i = 0; i < count; i++) {
    if (lengths[i] !== 0) symbols[offsets[lengths[i]]++] = i;
  }

  return { counts, symbols };
}

const LENGTH_BASE = [
  3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
  163, 195, 227, 258,
];
const LENGTH_EXTRA = [
  0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];
const DIST_BASE = [
  1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049,
  3073, 4097, 6145, 8193, 12289, 16385, 24577,
];
const DIST_EXTRA = [
  0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13,
];
const CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

/**
 * Returns the inflated bytes, or null if the stream is malformed. `limit` bounds the work:
 * the caller knows exactly how many raw bytes a PNG of the declared size produces, so a
 * corrupt or hostile stream cannot make this run unbounded.
 */
function inflate(input: Uint8Array, limit: number): Uint8Array | null {
  const out = new Uint8Array(limit);
  let outIndex = 0;
  let bytePos = 0;
  let bitBuffer = 0;
  let bitCount = 0;

  const readBit = (): number => {
    if (bitCount === 0) {
      if (bytePos >= input.length) return -1;
      bitBuffer = input[bytePos++];
      bitCount = 8;
    }
    const bit = bitBuffer & 1;
    bitBuffer >>= 1;
    bitCount--;
    return bit;
  };

  const readBits = (n: number): number => {
    let value = 0;
    for (let i = 0; i < n; i++) {
      const bit = readBit();
      if (bit < 0) return -1;
      value |= bit << i;
    }
    return value;
  };

  const decodeSymbol = (table: Huffman): number => {
    let code = 0;
    let first = 0;
    let index = 0;
    for (let length = 1; length <= 15; length++) {
      const bit = readBit();
      if (bit < 0) return -1;
      code |= bit;
      const count = table.counts[length];
      if (code - first < count) return table.symbols[index + (code - first)];
      index += count;
      first = (first + count) << 1;
      code <<= 1;
    }
    return -1;
  };

  let fixedLiteral: Huffman | null = null;
  let fixedDistance: Huffman | null = null;

  for (;;) {
    const last = readBit();
    if (last < 0) return null;
    const type = readBits(2);
    if (type < 0) return null;

    if (type === 0) {
      // Stored: discard the remaining bits of the current byte, then copy verbatim.
      bitCount = 0;
      if (bytePos + 4 > input.length) return null;
      const length = input[bytePos] | (input[bytePos + 1] << 8);
      bytePos += 4;
      if (bytePos + length > input.length || outIndex + length > limit) return null;
      out.set(input.subarray(bytePos, bytePos + length), outIndex);
      bytePos += length;
      outIndex += length;
    } else if (type === 1 || type === 2) {
      let literal: Huffman;
      let distance: Huffman;

      if (type === 1) {
        if (fixedLiteral === null || fixedDistance === null) {
          const literalLengths = new Uint8Array(288);
          for (let i = 0; i < 288; i++) {
            literalLengths[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
          }
          const distanceLengths = new Uint8Array(30).fill(5);
          fixedLiteral = buildHuffman(literalLengths, 288);
          fixedDistance = buildHuffman(distanceLengths, 30);
        }
        literal = fixedLiteral;
        distance = fixedDistance;
      } else {
        const hlit = readBits(5) + 257;
        const hdist = readBits(5) + 1;
        const hclen = readBits(4) + 4;
        if (hlit < 257 || hdist < 1 || hclen < 4) return null;

        const codeLengths = new Uint8Array(19);
        for (let i = 0; i < hclen; i++) {
          const value = readBits(3);
          if (value < 0) return null;
          codeLengths[CODE_LENGTH_ORDER[i]] = value;
        }
        const codeTable = buildHuffman(codeLengths, 19);

        const lengths = new Uint8Array(hlit + hdist);
        let i = 0;
        while (i < lengths.length) {
          const symbol = decodeSymbol(codeTable);
          if (symbol < 0) return null;
          if (symbol < 16) {
            lengths[i++] = symbol;
          } else if (symbol === 16) {
            if (i === 0) return null;
            const repeat = 3 + readBits(2);
            const previous = lengths[i - 1];
            for (let r = 0; r < repeat && i < lengths.length; r++) lengths[i++] = previous;
          } else if (symbol === 17) {
            const repeat = 3 + readBits(3);
            for (let r = 0; r < repeat && i < lengths.length; r++) lengths[i++] = 0;
          } else {
            const repeat = 11 + readBits(7);
            for (let r = 0; r < repeat && i < lengths.length; r++) lengths[i++] = 0;
          }
        }

        literal = buildHuffman(lengths.subarray(0, hlit), hlit);
        distance = buildHuffman(lengths.subarray(hlit), hdist);
      }

      for (;;) {
        const symbol = decodeSymbol(literal);
        if (symbol < 0) return null;
        if (symbol === 256) break;

        if (symbol < 256) {
          if (outIndex >= limit) return out;
          out[outIndex++] = symbol;
        } else {
          const lengthIndex = symbol - 257;
          if (lengthIndex >= LENGTH_BASE.length) return null;
          const length = LENGTH_BASE[lengthIndex] + readBits(LENGTH_EXTRA[lengthIndex]);
          const distanceSymbol = decodeSymbol(distance);
          if (distanceSymbol < 0 || distanceSymbol >= DIST_BASE.length) return null;
          const offset = DIST_BASE[distanceSymbol] + readBits(DIST_EXTRA[distanceSymbol]);
          if (offset > outIndex) return null;
          for (let i = 0; i < length; i++) {
            if (outIndex >= limit) return out;
            out[outIndex] = out[outIndex - offset];
            outIndex++;
          }
        }
      }
    } else {
      return null;
    }

    if (last === 1) break;
  }

  return outIndex === limit ? out : out.subarray(0, outIndex);
}

/**
 * Requirement 35 — a notification payload is redacted **before it is stored**, never on
 * read, and a payload that fails to redact is not stored at all.
 *
 * Three things become the literal string `"[redacted]"`:
 *
 *  1. **Every `recipients[].embedded_signing_url`.** This is the first thing redacted and
 *     the reason the requirement was rewritten: observed, every delivery carries the whole
 *     document, and that includes a working link that signs **as that recipient**, sitting
 *     next to that recipient's email address. Stored verbatim it would put live signing
 *     credentials in a forensics table, at rest, for as long as the row lives.
 *  2. **Every `value` under `data.object.fields`.** Under spec 03 that can be a tax id, a
 *     bank account, or an identity document number — the exact class of data spec 02
 *     requirement 40 keeps out of the audit trail, which this table sits beside. Each
 *     field keeps its `api_id` (`Signature_1`, `TextField_1`), which is what a redacted
 *     row carries in place of the value.
 *  3. **Every `data.object.metadata` key outside our own two.** `envelope_id` and
 *     `organization_id` are ours and are what correlate the row; anything else came from
 *     somewhere we do not control.
 *
 * WATCH THE SHAPE. `data.object.fields` in the real captured deliveries is an **array of
 * arrays**, page-grouped. A redactor written as `fields.map(f => …)` type-checks against a
 * hand-written interface and silently redacts nothing. So this walks the structure
 * recursively and redacts by key wherever it finds one, which is also what makes it total:
 * a shape change on their side cannot quietly reopen the leak.
 *
 * `event.hash`, `event.time` and `event.type` survive, so a stored row can still be
 * re-verified against the hash SignWell produced.
 */

export const REDACTED = '[redacted]';

/** Our own metadata keys, which are the only ones that survive. */
const OUR_METADATA_KEYS = new Set(['envelope_id', 'organization_id']);

/** Redacted wherever they appear, at any depth. */
const CREDENTIAL_KEYS = new Set(['embedded_signing_url', 'embedded_edit_url', 'embedded_preview_url']);

interface WalkContext {
  /** Inside a `fields` subtree, where `value` is a contract field value. */
  inFields: boolean;
  /** Inside a `metadata` object, where every key but ours is foreign. */
  inMetadata: boolean;
}

/**
 * Returns a redacted deep copy. Throws rather than returning a partially-redacted body:
 * a payload that fails to redact is not stored at all.
 */
export function redactProviderPayload(body: unknown): unknown {
  const redacted = walk(body, { inFields: false, inMetadata: false }, 0);

  // The belt to the recursion's braces. If any credential key survived — a shape we did
  // not anticipate, a getter, a prototype oddity — nothing is stored.
  const serialized = JSON.stringify(redacted);
  if (serialized === undefined) {
    throw new PayloadNotRedactableError('the payload is not serializable');
  }
  for (const key of CREDENTIAL_KEYS) {
    const pattern = new RegExp(`"${key}":\\s*(?!"\\[redacted\\]")(?!null)`);
    if (pattern.test(serialized)) {
      throw new PayloadNotRedactableError(`a ${key} survived redaction`);
    }
  }

  return redacted;
}

export class PayloadNotRedactableError extends Error {
  constructor(reason: string) {
    super(`Refusing to store a provider payload: ${reason}`);
    this.name = 'PayloadNotRedactableError';
  }
}

const MAX_DEPTH = 32;

function walk(node: unknown, context: WalkContext, depth: number): unknown {
  if (depth > MAX_DEPTH) {
    // A body deep enough to hit this is not one we understand well enough to store.
    throw new PayloadNotRedactableError('the payload nests deeper than we will walk');
  }

  if (Array.isArray(node)) {
    return node.map((entry) => walk(entry, context, depth + 1));
  }
  if (node === null || typeof node !== 'object') return node;

  const source = node as Record<string, unknown>;
  const result: Record<string, unknown> = {};

  for (const key of Object.keys(source)) {
    const value = source[key];

    if (CREDENTIAL_KEYS.has(key)) {
      // Null is already nothing; replacing it would invent a value that was not sent.
      result[key] = value === null || value === undefined ? value : REDACTED;
      continue;
    }

    if (context.inMetadata && !OUR_METADATA_KEYS.has(key)) {
      result[key] = value === null || value === undefined ? value : REDACTED;
      continue;
    }

    // `value` is only a contract field value inside a `fields` subtree. Redacting every
    // key called `value` everywhere would also blank things that are not field data.
    if (context.inFields && key === 'value') {
      result[key] = value === null || value === undefined ? value : REDACTED;
      continue;
    }

    result[key] = walk(
      value,
      {
        inFields: context.inFields || key === 'fields',
        inMetadata: context.inMetadata || key === 'metadata',
      },
      depth + 1,
    );
  }

  return result;
}

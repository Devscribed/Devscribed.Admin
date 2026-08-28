/**
 * Requirement 14 — **the placeholder collision**, which is the single most dangerous
 * detail in this integration.
 *
 * SignWell's text tags are delimited by `{{` and `}}` — byte for byte, our own
 * placeholder syntax from spec 01. At send the frozen HTML deliberately still carries
 * `{{signer_owned_key}}` literally, because those values do not exist yet, and
 * `envelope-renderer.ts` marks every signature block with `data-signer-role` and leaves an
 * empty, named slot inside it. Those two facts are exactly what this translation consumes,
 * and it consumes nothing else: it never re-renders the document and never touches a word
 * of it.
 *
 * The assertion at the end is the part that matters. After translation **no `{{…}}` may
 * remain that we did not emit**, and any residual aborts the send with
 * `document_tags_unresolved` before a document is created and before a webhook can exist.
 * It has to be an abort rather than a warning because SignWell does not strip tags — we
 * hide them by painting them the page background colour — so an unresolved placeholder
 * would be *invisible* in the signed PDF and would still consume a field. A contract with
 * an extra invisible field on it is not something anyone should be able to sign.
 *
 * The tag vocabulary, from the sandbox run recorded in the spec: `{{Signature_n}}` binds a
 * signature to recipient *n*, `{{Text_n}}` a text field, and a `:n` suffix makes it not
 * required. Observed, three such tags produced exactly three fields — `signature` for
 * recipient 1, `signature` and a non-required `text` for recipient 2 — with coordinates
 * derived from each tag's position and size.
 */

/** A signer-owned template field, as the translation needs to see it. */
export interface TaggableField {
  key: string;
  /** The role that fills it — the `{roleKey}` of `filledBy: "signer:{roleKey}"`. */
  roleKey: string;
  required: boolean;
}

export interface TaggableSigner {
  roleKey: string;
  /** 1-based. It is the recipient number the tag binds to, and mirrors `signing_order`. */
  order: number;
}

/** One field we expect SignWell's parse to have produced (requirement 38). */
export interface ExpectedTagField {
  type: 'signature' | 'text';
  /** The recipient number, which is the signer's order. */
  recipientNumber: number;
  required: boolean;
  /** The template field key for a text tag; absent for a signature block. */
  fieldKey?: string;
}

export interface TranslatedDocument {
  html: string;
  expectedFields: readonly ExpectedTagField[];
}

/** Raised by rule (c). Names the offending keys, because the sender has to fix them. */
export class UnresolvedPlaceholdersError extends Error {
  constructor(readonly keys: readonly string[]) {
    super(`Unresolved placeholders: ${keys.join(', ')}`);
    this.name = 'UnresolvedPlaceholdersError';
  }
}

/**
 * The empty signature slot `envelope-renderer.ts` freezes into every signature block. It
 * is matched literally rather than by pattern for the same reason it is written by one
 * function there: a regex over author-controlled HTML is a way to over-match, and the
 * anchor must not be able to drift between the writer and this reader.
 */
function signatureSlot(roleKey: string): string {
  return `<span class="signature-mark" data-signature-for="${escapeAttribute(roleKey)}"></span>`;
}

/**
 * Tags are painted in the page background colour, because SignWell does not strip them
 * and they would otherwise print on the signed PDF. Our templates are our own HTML with a
 * known white page background — recorded in the spec's Known Gaps as exactly that
 * assumption.
 */
function hidden(tag: string): string {
  return `<span style="color:#ffffff">${tag}</span>`;
}

export function signatureTag(recipientNumber: number): string {
  return `{{Signature_${recipientNumber}}}`;
}

export function textTag(recipientNumber: number, required: boolean): string {
  return `{{Text_${recipientNumber}${required ? '' : ':n'}}}`;
}

/**
 * Translates the frozen HTML into a copy carrying SignWell's text tags.
 *
 * A **copy**, always: `Envelope.renderedHtml` and `documentHash` keep describing exactly
 * the bytes spec 02 froze, and requirement 29 says outright that the hash of what we sent
 * and the hash of what they returned describe two different documents rather than
 * pretending one verifies the other.
 */
export function translateToTextTags(
  frozenHtml: string,
  signers: readonly TaggableSigner[],
  signerOwnedFields: readonly TaggableField[],
): TranslatedDocument {
  const recipientOf = new Map(signers.map((signer) => [signer.roleKey, signer.order]));

  // Only fields whose role actually has a signer are translatable. A signer-owned
  // placeholder naming a role nobody fills falls through to the residual check below,
  // which is edge case 2 — and that is the gate that matters, because spec 01's
  // validation should have caught it and this is the one that stops an invisible field
  // reaching a signed contract.
  const taggable = new Map<string, { recipientNumber: number; required: boolean }>();
  for (const field of signerOwnedFields) {
    const recipientNumber = recipientOf.get(field.roleKey);
    if (recipientNumber === undefined) continue;
    taggable.set(field.key, { recipientNumber, required: field.required });
  }

  const expectedFields: ExpectedTagField[] = [];
  const residual: string[] = [];

  // (a) Signer-owned placeholders become text tags bound to that signer's index.
  //
  // Every `{{…}}` in the document is visited, and anything not in `taggable` is a
  // residual rather than something to leave alone: a sender value that itself contained
  // braces (edge case 1), an unbound placeholder (edge case 2), or a template that
  // slipped past spec 01's validation all land here.
  let html = frozenHtml.replace(/\{\{([^{}]*)\}\}/g, (match, inner: string) => {
    const key = inner.trim();
    const field = taggable.get(key);
    if (!field) {
      residual.push(key);
      return match;
    }
    expectedFields.push({
      type: 'text',
      recipientNumber: field.recipientNumber,
      required: field.required,
      fieldKey: key,
    });
    return hidden(textTag(field.recipientNumber, field.required));
  });

  if (residual.length > 0) {
    // Before a document is created and before a webhook can exist. Nothing was spent and
    // nothing is half-created.
    throw new UnresolvedPlaceholdersError([...new Set(residual)]);
  }

  // (b) Signature blocks emit a signature tag sized to the block. Two blocks carrying the
  // same `data-signer-role` both emit tags for the same recipient, which is permitted —
  // one signer may sign in two places (edge case 3).
  for (const signer of signers) {
    const slot = signatureSlot(signer.roleKey);
    const occurrences = html.split(slot).length - 1;
    if (occurrences === 0) continue;

    html = html
      .split(slot)
      .join(`<span class="signature-mark">${hidden(signatureTag(signer.order))}</span>`);

    for (let i = 0; i < occurrences; i++) {
      expectedFields.push({ type: 'signature', recipientNumber: signer.order, required: true });
    }
  }

  return { html, expectedFields };
}

/**
 * The same escaping `envelope-renderer.ts` applies when it writes the anchor, so the
 * needle this module builds is byte-identical to the one that was written. It is
 * duplicated rather than imported so this module stays dependency-free and can be unit
 * tested on its own.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

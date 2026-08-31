/**
 * Requirement 14 — the copy of the frozen document that goes to a provider which places
 * fields by coordinate, and the field list that goes with it.
 *
 * Two facts shape this module, and an earlier version of it ran them together.
 *
 * The first is that **the frozen HTML still carries `{{signer_owned_key}}` literally**, and
 * `envelope-renderer.ts` marks every signature block with `data-signer-role` and leaves an
 * empty, named slot inside it. Those two facts are what this translation consumes, and it
 * consumes nothing else: it never re-renders the document and never touches a word of it.
 *
 * The second is that **nothing here is emitted for the provider to find**. SignWell
 * materializes only the fields the request supplies (requirement 13), so this module builds
 * a field list rather than a tag. There is no vocabulary to get right and nothing painted
 * the page background colour to hide it.
 *
 * The assertion at the end still matters, and its reason has changed rather than gone away.
 * After the copy is built **no `{{…}}` may remain**, and any residual aborts the send with
 * `document_tags_unresolved` before a document is created and before a webhook can exist.
 * It is no longer that a stray placeholder would be invisible: it is that it would be
 * *visible* — a literal `{{rate}}` printed on a contract somebody is about to sign, in a
 * document our own hash calls final.
 *
 * Where the fields go is requirement 14e, and `envelope-renderer.ts` owns the grid: the
 * copy hoists the signature section onto an execution page at the front, so every field is
 * on page 1 at a coordinate that is arithmetic rather than measurement.
 */

/* ------------------------------------------------------------------ *
 * The execution page — requirement 14e
 *
 * A provider that places fields by coordinate needs a page number and a box per field, and
 * nothing here can measure one: `PdfRenderer` is an abstraction over a Lambda, and a
 * block's height depends on its content. So fields are never placed against the prose. The
 * copy hoists the signature section onto a page of its own at the front and lays it out on
 * the fixed grid below — every field on page 1, every row the same size whatever the
 * contract says.
 *
 * The constants are the spec's, in PDF points. Two of them describe the *renderer's* page
 * setup rather than ours, which is why requirement 14e lists them and Known Gaps names the
 * one this repository cannot see.
 *
 * They live here, and `envelope-renderer.ts` imports them rather than the other way round,
 * for a reason that is not taste: this module is loaded by the unit suite, which runs
 * without the shared validation package built, and the renderer imports that package.
 * ------------------------------------------------------------------ */

export interface FieldBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const EXECUTION_PAGE = {
  /** A4's 18mm print margin plus the document's own `body { margin: 2.5rem }`. */
  contentLeft: 81,
  /** The same sum with the 20mm top margin. */
  contentTop: 86.7,
  headingHeight: 48,
  rowHeight: 72,
  boxWidth: 240,
  boxHeight: 36,
  boxOffsetY: 2,
  /** What fits above A4's bottom margin. A tenth field has nowhere to go. */
  maxRows: 9,
} as const;

/**
 * The box for the row at `index`, or `null` when there is no such row. `null` is a refusal,
 * not a default: a field with no box aborts the send before a document is created, because
 * a guessed coordinate is a signature line in the middle of somebody's contract.
 */
export function executionPageRowBox(index: number): FieldBox | null {
  if (!Number.isInteger(index) || index < 0 || index >= EXECUTION_PAGE.maxRows) return null;

  const rowTop =
    EXECUTION_PAGE.contentTop + EXECUTION_PAGE.headingHeight + index * EXECUTION_PAGE.rowHeight;

  return {
    x: EXECUTION_PAGE.contentLeft,
    y: rowTop + EXECUTION_PAGE.boxOffsetY,
    width: EXECUTION_PAGE.boxWidth,
    height: EXECUTION_PAGE.boxHeight,
  };
}

/**
 * The geometry, written onto the row that draws it. The adapter reads these back rather
 * than recomputing the grid, so the drawn row and the field box cannot drift apart — the
 * same bargain `signatureSlot` makes between the writer and this reader.
 */
export function fieldBoxAttributes(
  kind: 'signature' | 'text',
  ref: string,
  box: FieldBox | null,
): string {
  if (!box) return '';
  return (
    ` data-field-kind="${kind}" data-field-ref="${escapeAttribute(ref)}"` +
    ` data-field-x="${box.x}" data-field-y="${box.y}"` +
    ` data-field-width="${box.width}" data-field-height="${box.height}"`
  );
}

/**
 * The signature section's bounds in the frozen HTML. Comment markers rather than a pattern
 * over `<div class="signatures">…</div>`: the section contains divs of its own, so a reader
 * that matched tags would have to count them, and this one does not have to.
 */
export const SIGNATURES_START = '<!--signatures:start-->';
export const SIGNATURES_END = '<!--signatures:end-->';
export const SIGNATURES_OPEN = '<div class="signatures">';
export const SIGNATURES_CLOSE = '</div>';

/** A signer-owned template field, as the translation needs to see it. */
export interface TaggableField {
  key: string;
  /** The role that fills it — the `{roleKey}` of `filledBy: "signer:{roleKey}"`. */
  roleKey: string;
  required: boolean;
}

export interface TaggableSigner {
  roleKey: string;
  /** 1-based. It is the recipient number the field binds to, and mirrors `signing_order`. */
  order: number;
}

/** One field the request asks the provider to create (requirements 14d and 38). */
export interface ExpectedTagField {
  type: 'signature' | 'text';
  /** The recipient number, which is the signer's order. */
  recipientNumber: number;
  required: boolean;
  /** The template field key for a text field; absent for a signature block. */
  fieldKey?: string;
}

export interface TranslatedDocument {
  html: string;
  expectedFields: readonly ExpectedTagField[];
}

/** One field box, as the copy carries it and the adapter reads it back. */
export interface SignWellFieldBox extends FieldBox {
  kind: 'signature' | 'text';
  /** The signer's role key for a signature, the template field key for a text field. */
  ref: string;
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
 * The attributes `fieldBoxAttributes` wrote, read back in the order it writes them. The
 * needle is the writer's own output rather than a tolerant pattern, which is the same
 * bargain `signatureSlot` makes: this reader cannot drift from that writer without failing
 * loudly, and it cannot match markup nobody generated.
 */
const FIELD_BOX =
  /data-field-kind="(signature|text)" data-field-ref="([^"]*)" data-field-x="([-\d.]+)" data-field-y="([-\d.]+)" data-field-width="([-\d.]+)" data-field-height="([-\d.]+)"/g;

export function readSignWellFieldBoxes(html: string): SignWellFieldBox[] {
  const boxes: SignWellFieldBox[] = [];
  for (const match of (html ?? '').matchAll(FIELD_BOX)) {
    boxes.push({
      kind: match[1] as 'signature' | 'text',
      ref: unescapeAttribute(match[2]),
      x: Number(match[3]),
      y: Number(match[4]),
      width: Number(match[5]),
      height: Number(match[6]),
    });
  }
  return boxes;
}

/**
 * Builds the copy of the frozen HTML that goes to SignWell, and the field list beside it.
 *
 * A **copy**, always: `Envelope.renderedHtml` and `documentHash` keep describing exactly
 * the bytes spec 02 froze, and requirement 29 says outright that the hash of what we sent
 * and the hash of what they returned describe two different documents rather than
 * pretending one verifies the other.
 */
export function prepareSignWellDocument(
  frozenHtml: string,
  signers: readonly TaggableSigner[],
  signerOwnedFields: readonly TaggableField[],
): TranslatedDocument {
  const recipientOf = new Map(signers.map((signer) => [signer.roleKey, signer.order]));

  // Only fields whose role actually has a signer are placeable. A signer-owned placeholder
  // naming a role nobody fills falls through to the residual check below, which is edge
  // case 2 — and that is the gate that matters, because spec 01's validation should have
  // caught it and this is the one that stops a raw `{{…}}` reaching a signed contract.
  const placeable = new Map<string, { recipientNumber: number; required: boolean }>();
  for (const field of signerOwnedFields) {
    const recipientNumber = recipientOf.get(field.roleKey);
    if (recipientNumber === undefined) continue;
    placeable.set(field.key, { recipientNumber, required: field.required });
  }

  const expectedFields: ExpectedTagField[] = [];
  const residual: string[] = [];
  /** Entry keys in the order the reader meets them, which is the order they are numbered. */
  const entries: string[] = [];

  // (a) Every `{{…}}` in the document is visited, and anything not placeable is a residual
  // rather than something to leave alone: a sender value that itself contained braces
  // (edge case 1), an unbound placeholder (edge case 2), or a template that slipped past
  // spec 01's validation all land here.
  //
  // A placeable one becomes a numbered blank pointing at its row on the execution page,
  // because that is where the signer will type it. The same key twice is one field and two
  // references to it.
  let html = (frozenHtml ?? '').replace(/\{\{([^{}]*)\}\}/g, (match, inner: string) => {
    const key = inner.trim();
    const field = placeable.get(key);
    if (!field) {
      residual.push(key);
      return match;
    }

    let number = entries.indexOf(key) + 1;
    if (number === 0) {
      entries.push(key);
      number = entries.length;
      expectedFields.push({
        type: 'text',
        recipientNumber: field.recipientNumber,
        required: field.required,
        fieldKey: key,
      });
    }
    return `<span class="signer-entry-ref">______ [${number}]</span>`;
  });

  if (residual.length > 0) {
    // Before a document is created and before a webhook can exist. Nothing was spent and
    // nothing is half-created.
    throw new UnresolvedPlaceholdersError([...new Set(residual)]);
  }

  // (b) A signer with a signature block gets one signature field, bound to their recipient
  // number. One block per signer is what the renderer writes, and the execution page holds
  // one row per signer, so a document carrying two blocks for one role would leave the
  // second without a box and abort in the adapter rather than send a field nobody reaches
  // (edge case 3).
  for (const signer of [...signers].sort((a, b) => a.order - b.order)) {
    if (!html.includes(signatureSlot(signer.roleKey))) continue;
    expectedFields.push({ type: 'signature', recipientNumber: signer.order, required: true });
  }

  return { html: hoistExecutionPage(html, entries, placeable), expectedFields };
}

/**
 * Kept under its old name for the send path, which is not this change's to edit. The name
 * describes what this module used to do; `prepareSignWellDocument` describes what it does.
 */
export { prepareSignWellDocument as translateToTextTags };

/**
 * Requirement 14e — the signature section becomes a page of its own at the front, carrying
 * the signer-entry rows underneath the signature rows.
 *
 * Underneath, and not above, for a reason worth stating: the signature rows' boxes are
 * written by `envelope-renderer.ts` into the frozen HTML, so their row indices have to mean
 * the same thing whether or not any entry rows exist. Entries take the rows after them.
 */
function hoistExecutionPage(
  html: string,
  entries: readonly string[],
  placeable: ReadonlyMap<string, { recipientNumber: number; required: boolean }>,
): string {
  const start = html.indexOf(SIGNATURES_START);
  const end = html.indexOf(SIGNATURES_END);
  // A document with no signature section has nothing to hoist and no fields to place. The
  // adapter refuses it a moment later, on the field list, which is where that refusal names
  // the signer it is missing.
  if (start < 0 || end < start) return html;

  const section = html.slice(start + SIGNATURES_START.length, end);
  const rows = section.startsWith(SIGNATURES_OPEN)
    ? section.slice(SIGNATURES_OPEN.length, section.length - SIGNATURES_CLOSE.length)
    : section;

  const signatureRows = readSignWellFieldBoxes(rows).filter(
    (box) => box.kind === 'signature',
  ).length;

  const entryRows = entries
    .map((key, index) => {
      const recipientNumber = placeable.get(key)?.recipientNumber ?? 0;
      const box = executionPageRowBox(signatureRows + index);
      return (
        `<div class="signer-entry"${fieldBoxAttributes('text', key, box)}>` +
        `<div class="signature-line"></div>` +
        `<div class="signature-label">[${index + 1}] ${escapeAttribute(key)}</div>` +
        `<div class="signature-name">To be completed by signer ${recipientNumber}</div></div>`
      );
    })
    .join('');

  const executionPage =
    '<div class="signatures execution-page">' +
    '<div class="execution-heading">Signature page</div>' +
    rows +
    entryRows +
    '</div>';

  const withoutSection = html.slice(0, start) + html.slice(end + SIGNATURES_END.length);
  return withoutSection.replace('<body>', `<body>\n${executionPage}`);
}

/**
 * The same escaping `envelope-renderer.ts` applies when it writes an anchor, so the needles
 * this module builds are byte-identical to the ones that were written. It is duplicated
 * rather than imported because the renderer's own copy is `escapeHtml` from the shared
 * validation package, and a second name for the same five replacements is cheaper than a
 * reader that has to check they are the same five.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function unescapeAttribute(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

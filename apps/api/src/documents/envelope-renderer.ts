import { escapeHtml, substitute } from '@devscribed/validation';
import {
  SIGNATURES_CLOSE,
  SIGNATURES_END,
  SIGNATURES_OPEN,
  SIGNATURES_START,
  executionPageRowBox,
  fieldBoxAttributes,
} from './signwell-text-tags';

/*
 * Spec 04 requirement 14e — the execution page. A provider that places fields by coordinate
 * needs a page number and a box per field, and nothing here can measure one, so this
 * renderer stamps each signature row with the box the grid computes for it and the copy
 * that goes to such a provider hoists the section onto a page of its own.
 *
 * The grid lives in `signwell-text-tags.ts` — which is where it is read back, and which
 * stays free of every import this file has, because the unit suite loads it without the
 * shared validation package built.
 */

export interface RenderSigner {
  /** The template's role key. It is what anchors this signer's signature block. */
  roleKey: string;
  roleLabel: string;
  name: string;
  order: number;
}

/**
 * One signature as it has been captured so far, ready to be drawn onto its line.
 *
 * `signatureImage` is whatever the provider stored — a signer-supplied data URI for a
 * drawn signature, our own SVG for a typed one — and is deliberately typed as possibly
 * absent, because "this signer has not signed yet" is the normal case on a part-signed
 * envelope and must leave the block empty rather than throw.
 */
export interface CapturedSignature {
  roleKey: string;
  signatureImage: string | null | undefined;
  signerName: string;
}

export interface RenderEnvelopeInput {
  title: string;
  bodyHtml: string;
  values: Record<string, string>;
  signers: readonly RenderSigner[];
  /**
   * The keys of the fields a signer fills in on the signing page (`filledBy` of
   * `signer:{roleKey}`, spec 01 requirement 26). Their placeholders are left standing in
   * the frozen HTML — see the note on `renderEnvelopeDocument`.
   */
  signerOwnedKeys?: readonly string[];
}

/** The subset of `readFields()` this module needs, so it does not depend on the service. */
export interface FieldOwnership {
  key: string;
  filledBy: string;
}

export function signerOwnedFieldKeys(fields: readonly FieldOwnership[]): string[] {
  return fields
    .filter((field) => (field.filledBy ?? '').trim().startsWith('signer:'))
    .map((field) => field.key);
}

/**
 * The frozen document as a *reader* should see it: the stored HTML with the envelope's
 * current values filled into the placeholders the freeze deliberately left standing.
 *
 * Presentation only. The caller never writes the result back, so the stored column and
 * its hash are untouched and requirement 23's integrity check keeps recomputing over
 * exactly the bytes that were signed. It exists so a counterparty is never shown raw
 * `{{contractor_bank}}` template syntax on the signing page or the envelope detail.
 */
export function presentDocument(
  renderedHtml: string,
  values: Record<string, string>,
  signatures: readonly CapturedSignature[] = [],
): string {
  return drawSignatures(substitute(renderedHtml, values ?? {}), signatures);
}

/* ------------------------------------------------------------------ *
 * Signatures on the line
 *
 * The signature blocks are frozen with an empty, named slot in them rather than with the
 * images, for the same reason the signer-owned placeholders are left standing: at send
 * nobody has signed yet, and `renderedHtml` is written once (invariant 5). So the slot is
 * an *anchor* — an attribute, never prose — that the two downstream passes find and fill:
 * `presentDocument` for display, and the provider's `finalize` for the completed PDF.
 * Neither writes back, so the stored bytes and `documentHash` stay exactly what was
 * signed.
 * ------------------------------------------------------------------ */

/**
 * The empty slot as it is frozen, and the needle the fill passes look for. Both sides go
 * through this one function so the anchor cannot drift between writer and reader.
 */
function signatureSlot(roleKey: string): string {
  return `<span class="signature-mark" data-signature-for="${escapeHtml(roleKey)}"></span>`;
}

/**
 * A stored signature image is signer-supplied data, so it is re-checked here rather than
 * trusted because it came out of our own column: only a base64 data URI of a known image
 * type reaches the document, and it is escaped into the attribute like any other value.
 * Anything else — a `javascript:` URI, an HTML fragment, a stray quote — yields `null`
 * and leaves the line blank, which is the honest rendering of "we have no signature we
 * can vouch for" and can never become an injection path.
 *
 * `svg+xml` is on the list because a typed signature is rendered as an SVG data URI
 * (`typedSignatureImage`); an SVG loaded through `<img src>` cannot run script, and the
 * document's own CSP allows `img-src data:` and nothing else.
 */
const SIGNATURE_IMAGE = /^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;

export function signatureImageSrc(image: string | null | undefined): string | null {
  const value = (image ?? '').trim();
  if (!SIGNATURE_IMAGE.test(value)) return null;
  // The validator tolerates whitespace inside the base64 payload (it survives from the
  // wire), so it is stripped rather than emitted into an attribute.
  return value.replace(/\s+/g, '');
}

/**
 * Draws every signature captured so far into its own block, and leaves the rest empty.
 *
 * Pure: it takes HTML and returns HTML, so both callers can use it on a copy and neither
 * can accidentally persist the result. HTML written before this change carries no slots,
 * so it passes through untouched — an existing envelope keeps its stored bytes and its
 * stored hash.
 */
/**
 * The envelope's signer rows as this module wants them. Structural rather than a Prisma
 * type so the renderer keeps knowing nothing about the database — the same reason
 * `FieldOwnership` exists.
 */
export function capturedSignatures(
  signers: readonly { roleKey: string; name: string; signatureImage: string | null }[],
): CapturedSignature[] {
  return (signers ?? [])
    .filter((signer) => signer.signatureImage)
    .map((signer) => ({
      roleKey: signer.roleKey,
      signatureImage: signer.signatureImage,
      signerName: signer.name,
    }));
}

export function drawSignatures(html: string, signatures: readonly CapturedSignature[]): string {
  let result = html ?? '';

  for (const signature of signatures ?? []) {
    const src = signatureImageSrc(signature.signatureImage);
    if (!src) continue;

    const slot = signatureSlot(signature.roleKey);
    // Literal replacement, not a regex: the needle is built by the same function that
    // wrote it, so no role key needs escaping twice and no pattern can over-match.
    const filled =
      `<span class="signature-mark" data-signature-for="${escapeHtml(signature.roleKey)}">` +
      `<img src="${escapeHtml(src)}" alt="Signature of ${escapeHtml(signature.signerName)}" />` +
      '</span>';
    result = result.split(slot).join(filled);
  }

  return result;
}

/**
 * The document as it is frozen at send (requirement 10) — the pinned version's body with
 * the real values substituted in.
 *
 * This is deliberately a sibling of `template-preview.renderer.ts` rather than a mode of
 * it. The preview renders synthetic values and is allowed to change whenever the editor
 * wants a nicer preview; *this* output is hashed, signed, and kept as the record. A
 * shared function would make a cosmetic tweak to the editor able to change the hash of a
 * document that has already been signed, which is the one thing the frozen HTML exists
 * to prevent.
 *
 * `substitute` escapes every value, and the body was allow-list sanitized on save
 * (spec 01), so neither an author nor a signer can inject markup here.
 *
 * Only *sender-owned* values are substituted. A signer-owned field has no value yet at
 * send — substituting it would blank the placeholder for good, because this HTML is
 * written once and never rewritten (invariant 5), and the signed PDF would then be
 * missing the very clause the signer typed. Its placeholder is therefore left standing
 * in the frozen bytes and filled in on the way out: `presentDocument` for display, and
 * the signature provider's `finalize` for the completed document.
 */
export function renderEnvelopeDocument(input: RenderEnvelopeInput): string {
  const signerOwned = new Set(input.signerOwnedKeys ?? []);
  const frozen: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.values ?? {})) {
    if (!signerOwned.has(key)) frozen[key] = value;
  }
  // Mapping a signer-owned key to its own placeholder is how the token is kept literal
  // without a second substitution routine: `escapeHtml` does not touch braces, so
  // `{{key}}` comes back out of `substitute` byte for byte and stays substitutable.
  for (const key of signerOwned) frozen[key] = `{{${key}}}`;

  const body = substitute(input.bodyHtml ?? '', frozen);

  // The geometry rides on a wrapper rather than on the block itself, and that is not
  // cosmetic: spec 02's suite asserts `<div class="signature-block" data-signer-role="…">`
  // byte for byte, and requirement 10 says that suite passes unedited.
  const signatures = [...input.signers]
    .sort((a, b) => a.order - b.order)
    .map(
      (signer, index) =>
        `<div class="signature-slot"${fieldBoxAttributes(
          'signature',
          signer.roleKey,
          executionPageRowBox(index),
        )}>` +
        `<div class="signature-block" data-signer-role="${escapeHtml(signer.roleKey)}">` +
        // The slot is empty at send and filled on the way out — see `drawSignatures`.
        `<div class="signature-line">${signatureSlot(signer.roleKey)}</div>` +
        `<div class="signature-label">${escapeHtml(signer.roleLabel)}</div>` +
        `<div class="signature-name">${escapeHtml(signer.name)}</div></div></div>`,
    )
    .join('');

  // The CSP is the second lock behind `<iframe sandbox="">`: this document is served to
  // an unauthenticated signing page and is also handed to the PDF renderer, so it must
  // be inert even when it is opened outside the frame the app puts it in.
  return `<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>${escapeHtml(input.title)}</title>
<style>
body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 2.5rem; color: #111; }
table { border-collapse: collapse; }
td, th { border: 1px solid #999; padding: 0.25rem 0.5rem; }
.signatures { display: flex; gap: 3rem; margin-top: 4rem; }
.signature-slot { flex: 1; }
.signature-block { flex: 1; }
/* The line keeps its height whether or not it carries an image, so a part-signed
   document and a signed one lay out identically. */
.signature-line { border-bottom: 1px solid #111; height: 2.5rem; display: flex; align-items: flex-end; overflow: hidden; }
.signature-mark img { max-height: 2.4rem; max-width: 100%; }
.signature-label { font-weight: bold; margin-top: 0.25rem; }
.signature-name { color: #444; font-size: 10pt; }
/* The execution page — spec 04 requirement 14e. The class is added only to the copy sent
   to a provider that places fields by coordinate, so on the internal path every rule below
   matches nothing and the document renders exactly as it always did. Lengths are in points
   because the grid the field boxes are computed on is in points. */
.execution-page { display: block; margin: 0; padding: 0; break-after: page; page-break-after: always; }
.execution-page .execution-heading { height: 48pt; margin: 0; padding: 0; font-size: 14pt; line-height: 48pt; font-weight: bold; }
.execution-page .signature-slot,
.execution-page .signer-entry { display: block; height: 72pt; width: 240pt; margin: 0; padding: 0; }
.execution-page .signature-block { display: block; height: 72pt; margin: 0; padding: 0; }
.execution-page .signature-line { height: 40pt; margin: 0; }
.execution-page .signature-label { height: 16pt; margin: 0; font-size: 11pt; line-height: 16pt; }
.execution-page .signature-name { height: 16pt; margin: 0; font-size: 10pt; line-height: 16pt; }
.signer-entry-ref { color: #444; }
</style>
</head>
<body>
<div class="document-body">${body}</div>
${SIGNATURES_START}${SIGNATURES_OPEN}${signatures}${SIGNATURES_CLOSE}${SIGNATURES_END}
</body>
</html>`;
}

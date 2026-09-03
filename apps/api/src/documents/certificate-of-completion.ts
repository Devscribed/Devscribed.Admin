import { escapeHtml, substitute } from '@devscribed/validation';
// The anchor contract (what the slot looks like, and what may be drawn into it) lives
// with the renderer that writes it, so writer and reader cannot drift apart.
import { drawSignatures, signatureImageSrc } from './envelope-renderer';
import type { AssemblySigner, AssemblySignerField, DocumentAssembly } from '../signature/signing-provider';

/**
 * The Certificate of Completion, and the wrapper that carries it.
 *
 * It moved here from `internal-signature-provider.ts` **unchanged** when spec 04 replaced
 * the port: the new port has no `finalize`, and leaving the certificate inside the
 * adapter would have made it unreachable from the completion service. Every byte of the
 * HTML, the stylesheet, the substitution order and the wrapper CSP is what spec 02
 * shipped, because requirement 10 makes spec 02's suite passing unedited the acceptance
 * test for this whole rewrite — and the certificate is hashed into a PDF that people
 * keep.
 *
 * Requirement 28: this is **not** produced for an envelope whose provider supplies its
 * own completed document. Their audit page is the certificate, and issuing both would put
 * two documents in the record with different timestamps for the same act.
 */

/**
 * The signed document followed by its Certificate of Completion — the HTML that becomes
 * the stored PDF.
 */
export function assembleCompletedDocument(request: DocumentAssembly): string {
  // The signed document is used as frozen. The only thing done to it is filling in the
  // placeholders the freeze deliberately left standing for the signer-owned fields —
  // `substitute` touches nothing else and escapes every value, so a signer can no more
  // inject markup here than a sender could at send. Re-*rendering* it from the template
  // would quietly defeat the guarantee the frozen `renderedHtml` exists to give; this
  // does not, because every word that was hashed is still there unchanged.
  // Then the signatures go onto the lines the freeze left empty. A contract whose own
  // signature block is blank is not a signed contract, however complete the certificate
  // below it is — the certificate is attribution, the block is the signature itself.
  // Same discipline as the values: fill the anchors, never rewrite the words.
  const document = drawSignatures(
    substitute(request.renderedHtml, request.fieldValues ?? {}),
    request.signers.map((signer) => ({
      roleKey: signer.roleKey,
      signatureImage: signer.signatureImage,
      signerName: signer.name,
    })),
  );

  // The wrapper carries its own CSP, at least as restrictive as the one frozen into
  // `renderedHtml`. That inner policy is a `<meta>` tag inside a fragment that is
  // embedded here, so it no longer applies to anything — this document is what becomes
  // the PDF and what the completion mail links to, and it is assembled from
  // author-controlled template HTML plus signer-supplied images. It must be inert
  // wherever it is opened, not only inside the frame the app puts it in.
  // `style-src 'unsafe-inline'` is what the stylesheet below needs; nothing here loads,
  // submits, or navigates anywhere, so everything else is denied.
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
    "img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">" +
    `<title>${escapeHtml(request.title)}</title>${CERTIFICATE_STYLES}</head><body>` +
    `<section class="document">${document}</section>` +
    certificateOfCompletion(request) +
    '</body></html>'
  );
}

const CERTIFICATE_STYLES =
  '<style>' +
  'body{font-family:Helvetica,Arial,sans-serif;color:#111827;font-size:12px}' +
  '.certificate{page-break-before:always;padding-top:8px}' +
  '.certificate h1{font-size:18px;margin:0 0 4px}' +
  '.certificate .meta{color:#4b5563;margin-bottom:16px}' +
  '.certificate table{border-collapse:collapse;width:100%;margin-bottom:14px}' +
  '.certificate th,.certificate td{border:1px solid #d1d5db;padding:6px 8px;' +
  'text-align:left;vertical-align:top;word-break:break-word}' +
  '.certificate th{width:34%;background:#f9fafb;font-weight:600}' +
  '.certificate h2{font-size:13px;margin:0 0 4px}' +
  // The signer-values table is a real three-column table, not the label/value pairs the
  // rest of the certificate uses, so it must not inherit the 34% label column.
  '.certificate table.entered th{width:auto}' +
  '.certificate img{max-height:64px}' +
  '.hash{font-family:Menlo,Consolas,monospace;font-size:10px}' +
  '</style>';

/**
 * The Certificate of Completion, requirement 28 field for field: envelope id, template
 * name and version, document hash, and per signer the name, email, signature image, the
 * signed timestamp in UTC *and* in the organization timezone, IP address, user agent, and
 * consent timestamp.
 *
 * Every value is escaped. The document above it was sanitized on save and its values
 * escaped at substitution, but the certificate carries signer-supplied strings — a name,
 * a user agent — that were never near the sanitizer.
 */
function certificateOfCompletion(request: DocumentAssembly): string {
  const signers = [...request.signers]
    .sort((a, b) => a.order - b.order)
    .map((signer) => signerBlock(signer, request.organizationTimeZone))
    .join('');

  return (
    '<section class="certificate">' +
    '<h1>Certificate of Completion</h1>' +
    `<p class="meta">Completed ${escapeHtml(formatUtc(request.completedAt))}</p>` +
    '<table>' +
    row('Envelope id', request.envelopeId) +
    row('Document', request.title) +
    row('Template', `${request.templateName} (version ${request.templateVersion})`) +
    `<tr><th>Document hash (SHA-256)</th><td class="hash">${escapeHtml(
      request.documentHash,
    )}</td></tr>` +
    '</table>' +
    signerEnteredValues(request.signerEnteredFields) +
    signers +
    '</section>'
  );
}

/**
 * Requirement 26's other half, on the record side: these values were typed on the signing
 * page *after* the document was frozen, so the certificate names them. Without this the
 * completed PDF would show them indistinguishably from the sender's own values, and
 * nothing in the artefact would say who put them there.
 *
 * The values themselves are not repeated — they are in the document above, and the
 * certificate's job here is attribution, not duplication.
 */
function signerEnteredValues(fields: readonly AssemblySignerField[]): string {
  if (!fields || fields.length === 0) return '';

  const rows = fields
    .map(
      (field) =>
        `<tr><td>${escapeHtml(field.key)}</td><td>${escapeHtml(field.label)}</td>` +
        `<td>${escapeHtml(`${field.signerName} (${field.roleLabel})`)}</td></tr>`,
    )
    .join('');

  return (
    '<h2>Values entered during signing</h2>' +
    '<table class="entered"><thead><tr><th>Field</th><th>Label</th><th>Entered by</th>' +
    `</tr></thead><tbody>${rows}</tbody></table>`
  );
}

function signerBlock(signer: AssemblySigner, timeZone: string): string {
  // The same guard the document body goes through. Escaping alone already stops attribute
  // breakout, but the certificate and the document must not disagree about what counts as
  // a signature: a stored value the document declines to draw would otherwise appear here
  // as a broken image, which reads as "the signature is missing from the record" when the
  // truth is "we hold something we cannot vouch for". An empty cell says that honestly;
  // the rest of the row — who signed, when, from where — is unaffected and still stands.
  const src = signatureImageSrc(signer.signatureImage);

  return (
    '<table>' +
    row(`Signer ${signer.order} — ${signer.roleLabel}`, signer.name) +
    row('Email', signer.email) +
    `<tr><th>Signature (${escapeHtml(signer.method)})</th><td>` +
    (src
      ? `<img src="${escapeHtml(src)}" alt="Signature of ${escapeHtml(signer.name)}">`
      : '') +
    '</td></tr>' +
    row('Signed (UTC)', formatUtc(signer.signedAt)) +
    row(`Signed (${timeZone})`, formatInZone(signer.signedAt, timeZone)) +
    row('Consent accepted (UTC)', formatUtc(signer.consentAcceptedAt)) +
    row('IP address', signer.ipAddress) +
    row('User agent', signer.userAgent) +
    '</table>'
  );
}

function row(label: string, value: string): string {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

/** ISO-8601 to the second. Every timestamp is stored in UTC; this is the record form. */
export function formatUtc(at: Date): string {
  return `${at.toISOString().slice(0, 19).replace('T', ' ')} UTC`;
}

export function formatInZone(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'medium',
    }).format(at);
  } catch {
    // An unknown zone must not be able to stop a completed envelope from producing its
    // certificate — the UTC row above is the authoritative one either way.
    return formatUtc(at);
  }
}

import { escapeHtml, substitute } from '@devscribed/validation';
import { Injectable } from '@nestjs/common';
// The anchor contract (what the slot looks like, and what may be drawn into it) lives
// with the renderer that writes it, so writer and reader cannot drift apart.
import { drawSignatures, signatureImageSrc } from '../documents/envelope-renderer';
import {
  AppliedSignature,
  FinalizeRequest,
  FinalizeSigner,
  FinalizeSignerField,
  FinalizedDocument,
  InvitationRequest,
  IssuedInvitation,
  SignatureProvider,
  SignatureRequest,
} from './signature-provider';
import { generateSigningToken, signingTokenTtlDays } from './signing-token';

/**
 * The in-house Simple Electronic Signature implementation.
 *
 * Its identity class is stated in the area README: possession of the email is the
 * identity proof, and the audit trail is the evidence. That is why every field the
 * Certificate of Completion needs — IP, user agent, consent timestamp — is a required
 * input here rather than something the provider is trusted to have recorded somewhere.
 */
@Injectable()
export class InternalSignatureProvider extends SignatureProvider {
  readonly key = 'internal';

  async issueInvitation(request: InvitationRequest): Promise<IssuedInvitation> {
    const { token, tokenHash } = generateSigningToken();
    const ttlDays = request.ttlDays ?? signingTokenTtlDays();
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    const base = (process.env.APP_PUBLIC_URL || 'http://localhost:3000').replace(/\/+$/, '');

    return {
      // Our own signer id: under a third-party provider this would be their request id,
      // which is the whole reason the column is a free-form string.
      providerRef: request.signerId,
      token,
      tokenHash,
      expiresAt,
      // The signing page is a web route, not an API route — `/sign/{token}` is the first
      // route in the application with no session at all.
      signingUrl: `${base}/sign/${token}`,
    };
  }

  async applySignature(request: SignatureRequest): Promise<AppliedSignature> {
    const signatureImage =
      request.method === 'drawn'
        ? requireDrawnImage(request.drawnImage)
        : typedSignatureImage(requireTypedName(request.typedName));

    return {
      signatureImage,
      method: request.method,
      signedAt: request.signedAt,
      providerRef: request.signerId,
    };
  }

  async finalize(request: FinalizeRequest): Promise<FinalizedDocument> {
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
    const html =
      '<!doctype html><html><head><meta charset="utf-8">' +
      '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; ' +
      "img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'\">" +
      `<title>${escapeHtml(request.title)}</title>${CERTIFICATE_STYLES}</head><body>` +
      `<section class="document">${document}</section>` +
      certificateOfCompletion(request) +
      '</body></html>';

    return { html, providerRef: request.envelopeId };
  }
}

function requireDrawnImage(image: string | undefined): string {
  // Structural check only. "A drawn signature with no ink" is a validation rule and lives
  // in `packages/validation`; what the provider guarantees is that it never stores
  // something that is not an image.
  //
  // The check is `signatureImageSrc`'s and not a looser one of its own: a `startsWith`
  // test would admit strings the renderer will later refuse to draw, and a column whose
  // contents cannot be rendered is worse than a rejected signature — the signer is still
  // in front of us and can sign again, while the envelope is not. So the writer and the
  // reader agree on what a signature is, in exactly one place. The normalized form is
  // stored, so what the column holds is what the document will carry.
  const src = signatureImageSrc(image);
  if (!src) {
    throw new Error('A drawn signature must be an image data URI');
  }
  return src;
}

function requireTypedName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('A typed signature must have a name');
  return trimmed;
}

/**
 * Requirement 22 asks for a typed name "rendered into an image". The image is an SVG data
 * URI rather than a PNG: rasterizing text in the API process would mean shipping a font
 * and a rasterizer alongside the Chromium the renderer already owns.
 * The column stores a data URI either way, and both the signing page and the PDF
 * renderer draw an SVG and a PNG identically — while the SVG additionally keeps the
 * typed name readable as text inside the artefact, which is a small evidentiary win.
 */
export function typedSignatureImage(name: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="420" height="90" viewBox="0 0 420 90">` +
    `<text x="12" y="58" font-family="Georgia,'Times New Roman',serif" font-size="40" ` +
    `font-style="italic" fill="#111827">${escapeHtml(name)}</text>` +
    `<line x1="8" y1="72" x2="412" y2="72" stroke="#9ca3af" stroke-width="1"/></svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
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
function certificateOfCompletion(request: FinalizeRequest): string {
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
function signerEnteredValues(fields: readonly FinalizeSignerField[]): string {
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

function signerBlock(signer: FinalizeSigner, timeZone: string): string {
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

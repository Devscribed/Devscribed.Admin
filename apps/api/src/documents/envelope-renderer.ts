import { escapeHtml, substitute } from '@devscribed/validation';

export interface RenderSigner {
  roleLabel: string;
  name: string;
  order: number;
}

export interface RenderEnvelopeInput {
  title: string;
  bodyHtml: string;
  values: Record<string, string>;
  signers: readonly RenderSigner[];
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
 */
export function renderEnvelopeDocument(input: RenderEnvelopeInput): string {
  const body = substitute(input.bodyHtml ?? '', input.values ?? {});

  const signatures = [...input.signers]
    .sort((a, b) => a.order - b.order)
    .map(
      (signer) =>
        '<div class="signature-block"><div class="signature-line"></div>' +
        `<div class="signature-label">${escapeHtml(signer.roleLabel)}</div>` +
        `<div class="signature-name">${escapeHtml(signer.name)}</div></div>`,
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
.signature-block { flex: 1; }
.signature-line { border-bottom: 1px solid #111; height: 2.5rem; }
.signature-label { font-weight: bold; margin-top: 0.25rem; }
.signature-name { color: #444; font-size: 10pt; }
</style>
</head>
<body>
<div class="document-body">${body}</div>
<div class="signatures">${signatures}</div>
</body>
</html>`;
}

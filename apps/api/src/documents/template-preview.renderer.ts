import { escapeHtml, substitute } from '@devscribed/validation';
import type { SignerRole } from '@devscribed/validation';

export interface PreviewField {
  key: string;
  label: string;
}

/**
 * Renders a version with **synthetic** values (FR-31): every placeholder becomes its
 * field label in brackets — `[Full name]`. Nothing here reads a member, an account, or
 * an envelope, and it takes no database handle at all, which is the cheapest way to
 * guarantee that property rather than merely assert it.
 *
 * A placeholder with no matching field falls back to its own key so the author can see
 * which token is undefined instead of a silent gap — the read-time counterpart of the
 * `unknown_placeholders` publish check.
 */
export function renderPreview(
  bodyHtml: string,
  fields: readonly PreviewField[],
  signerRoles: readonly SignerRole[],
): string {
  const values: Record<string, string> = {};
  for (const field of fields) values[field.key] = `[${field.label}]`;

  // `substitute` escapes every value, so a label containing markup cannot introduce it.
  const body = substitute(bodyHtml ?? '', values);

  const signatures = [...signerRoles]
    .sort((a, b) => a.order - b.order)
    .map(
      (role) =>
        `<div class="signature-block"><div class="signature-line"></div>` +
        `<div class="signature-label">${escapeHtml(role.label)}</div>` +
        `<div class="signature-hint">[Signature]</div></div>`,
    )
    .join('');

  // The client already renders this in `<iframe sandbox="">`; the CSP is the second
  // lock, so a preview opened outside that frame — saved to disk, mailed, piped into a
  // renderer — still cannot script, fetch, or phone home.
  return `<html>
<head>
<meta charset="utf-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" />
<title>Template preview</title>
<style>
body { font-family: Georgia, 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; margin: 2.5rem; color: #111; }
table { border-collapse: collapse; }
td, th { border: 1px solid #999; padding: 0.25rem 0.5rem; }
.signatures { display: flex; gap: 3rem; margin-top: 4rem; }
.signature-block { flex: 1; }
.signature-line { border-bottom: 1px solid #111; height: 2.5rem; }
.signature-label { font-weight: bold; margin-top: 0.25rem; }
.signature-hint { color: #777; font-size: 10pt; }
</style>
</head>
<body>
<div class="template-body">${body}</div>
<div class="signatures">${signatures}</div>
</body>
</html>`;
}

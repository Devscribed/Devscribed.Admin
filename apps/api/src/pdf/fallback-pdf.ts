/**
 * A tiny, dependency-free PDF writer.
 *
 * It exists for one situation: no Chromium executable can be resolved. That happens on a
 * fresh clone before `npx playwright install`, on a CI image without browsers, and in a
 * container that has the JavaScript but not the binary. Requirement 31 says a render
 * failure must never lose a captured signature, and the completion path has to end with
 * real bytes it can hash and store — so the renderer degrades to this instead of
 * throwing.
 *
 * What it produces is a genuine, valid, single-page PDF containing the document's text,
 * not a placeholder blob: `%PDF` header, four objects, a real cross-reference table, a
 * trailer. It is deliberately not a layout engine — no CSS, no fonts beyond Helvetica,
 * no pagination past one page. It is a fallback, and the caller logs loudly when it is
 * used.
 */

const PAGE_WIDTH = 595; // A4 at 72dpi
const PAGE_HEIGHT = 842;
const MARGIN = 56;
const LINE_HEIGHT = 14;
const FONT_SIZE = 10;
const MAX_CHARS_PER_LINE = 95;

export function renderFallbackPdf(html: string): Buffer {
  const lines = wrap(htmlToText(html));
  return buildPdf(lines);
}

/**
 * Crude but predictable: drop script and style bodies entirely, turn block-level tags
 * into line breaks, strip the rest, and decode the handful of entities our own escaping
 * produces. Anything cleverer would be a parser, and a parser is what Chromium is for.
 */
export function htmlToText(html: string): string[] {
  const withoutHead = (html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  const withBreaks = withoutHead
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer|table)>/gi, '\n')
    .replace(/<[^>]+>/g, '');

  const decoded = withBreaks
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');

  return decoded
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0);
}

function wrap(paragraphs: readonly string[]): string[] {
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let remaining = paragraph;
    while (remaining.length > MAX_CHARS_PER_LINE) {
      const cut = remaining.lastIndexOf(' ', MAX_CHARS_PER_LINE);
      const at = cut > 0 ? cut : MAX_CHARS_PER_LINE;
      lines.push(remaining.slice(0, at));
      remaining = remaining.slice(at).trimStart();
    }
    lines.push(remaining);
  }

  // One page only — see the note above. The marker is honest about the truncation
  // rather than silently dropping the rest of a contract.
  const maxLines = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT);
  if (lines.length > maxLines) {
    return [...lines.slice(0, maxLines - 1), '[truncated - rendered without a browser]'];
  }

  return lines.length > 0 ? lines : ['(empty document)'];
}

/** Escapes the three characters that are syntax inside a PDF string literal. */
function escapePdfText(text: string): string {
  return text.replace(/([\\()])/g, '\\$1');
}

function buildPdf(lines: readonly string[]): Buffer {
  const content =
    `BT /F1 ${FONT_SIZE} Tf ${LINE_HEIGHT} TL ${MARGIN} ${PAGE_HEIGHT - MARGIN} Td\n` +
    lines.map((line) => `(${escapePdfText(toLatin1(line))}) Tj T*`).join('\n') +
    '\nET\n';

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
      '/Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'latin1'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(body, 'latin1');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) xref += `${String(offset).padStart(10, '0')} 00000 n \n`;

  const trailer =
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\n` +
    `startxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(body + xref + trailer, 'latin1');
}

/**
 * Helvetica with WinAnsi encoding cannot express Cyrillic, and the production renderer
 * (a Chromium layer bundling a Cyrillic font) is the answer to that. Rather than emit
 * bytes that render as tofu, unmappable characters become `?` — visibly wrong, which is
 * the point: this output is never the signed artefact of record without a loud warning
 * in the log beside it.
 */
function toLatin1(text: string): string {
  return [...text].map((character) => (character.charCodeAt(0) < 256 ? character : '?')).join('');
}

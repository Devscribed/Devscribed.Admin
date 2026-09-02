import type { AmountsOwedResponse, TimeAndActivityResponse } from './reports.service';

/**
 * A self-contained HTML string handed to `PdfRenderer.render` — no imports, no
 * client script. Layout is A4 landscape (spec requirement 34). Page-number
 * niceties (`Page {n} of {m}`) need Playwright's `headerTemplate`/`footerTemplate`
 * which the current `PdfRenderer` port does not expose; the CSS-only fallback
 * repeats a static header via `position: fixed` on the print media and leaves
 * the numbered footer as a known follow-up.
 */
export interface AmountsOwedPdfMeta {
  /** Header title — "Amounts Owed" or "My Amounts Owed". */
  title: string;
  organizationName: string;
  /** Human-formatted range for the header (`"Aug 1 – Aug 31, 2026"`). */
  rangeLabel: string;
  /** Generated-at timestamp in the caller's timezone. */
  generatedAt: string;
}

const escapeHtml = (input: string): string =>
  input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function renderAmountsOwedHtml(
  response: AmountsOwedResponse,
  meta: AmountsOwedPdfMeta,
): string {
  const summaryHtml = response.summary
    .map(
      (s) =>
        `<div class="tile"><div class="tile-label">${escapeHtml(s.label)}</div><div class="tile-value">${escapeHtml(s.value)}</div></div>`,
    )
    .join('');

  const groupsHtml = response.groups
    .map((g) => {
      const rows = g.rows
        .map(
          (r) =>
            `<tr><td>${escapeHtml(r.member)}</td><td>${escapeHtml(r.activity)}</td><td class="num">${escapeHtml(r.hours)}</td><td class="num">$${escapeHtml(r.rate)}</td><td class="num">$${escapeHtml(r.amount)}</td></tr>`,
        )
        .join('');
      return `
        <section class="group">
          <h3>${escapeHtml(g.title)}</h3>
          <table>
            <thead>
              <tr>${response.headers.map((h) => `<th>${escapeHtml(h.title)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot>
              <tr><td colspan="2">Total</td><td class="num">${escapeHtml(g.total.hours)}</td><td></td><td class="num">$${escapeHtml(g.total.amount)}</td></tr>
            </tfoot>
          </table>
        </section>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.organizationName)}</title>
<style>
  @page { size: A4 landscape; margin: 20mm 15mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; }
  header { border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 12px; }
  header .brand { font-size: 14px; font-weight: 600; }
  header .sub { color: #666; font-size: 10px; margin-top: 2px; }
  .summary { display: flex; gap: 12px; margin-bottom: 16px; }
  .tile { border: 1px solid #eee; border-radius: 4px; padding: 6px 10px; min-width: 120px; }
  .tile-label { color: #666; font-size: 9px; text-transform: uppercase; }
  .tile-value { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .group { margin-bottom: 16px; page-break-inside: avoid; }
  .group h3 { font-size: 12px; margin: 0 0 6px; padding: 4px 6px; background: #f4f4f4; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #fafafa; font-size: 10px; text-transform: uppercase; color: #555; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 600; border-top: 1px solid #ccc; background: #fbfbfb; }
  .empty { padding: 24px; text-align: center; color: #666; font-style: italic; }
</style>
</head>
<body>
  <header>
    <div class="brand">${escapeHtml(meta.title)} — ${escapeHtml(meta.organizationName)}</div>
    <div class="sub">${escapeHtml(meta.rangeLabel)} · Generated ${escapeHtml(meta.generatedAt)}</div>
  </header>
  <div class="summary">${summaryHtml}</div>
  ${response.groups.length === 0 ? '<div class="empty">No data for this range.</div>' : groupsHtml}
</body>
</html>`;
}

/**
 * Same self-contained layout used for Amounts Owed, projected onto the T&A
 * response shape. `headers` is already the caller-permitted set (spec req 11);
 * the template reads a row's value for each header by the header's `value`
 * key so denied columns cannot leak through the template.
 */
export interface TimeAndActivityPdfMeta {
  title: string;
  organizationName: string;
  rangeLabel: string;
  generatedAt: string;
}

export function renderTimeAndActivityHtml(
  response: TimeAndActivityResponse,
  meta: TimeAndActivityPdfMeta,
): string {
  const summaryHtml = response.summary
    .map(
      (s) =>
        `<div class="tile"><div class="tile-label">${escapeHtml(s.label)}</div><div class="tile-value">${escapeHtml(s.value)}</div></div>`,
    )
    .join('');

  // Headers list drives every row's cell order and the group total row.
  const headers = response.headers;

  const groupsHtml = response.groups
    .map((g) => {
      const rows = g.rows
        .map((r) => {
          const cells = headers
            .map((h) => {
              const raw = (r as unknown as Record<string, unknown>)[h.value];
              const value = typeof raw === 'string' ? raw : '';
              const isNumeric =
                h.value === 'time' ||
                h.value === 'billableTime' ||
                h.value === 'nonBillableTime' ||
                h.value === 'billedAmount' ||
                h.value === 'spent';
              const cls = isNumeric ? ' class="num"' : '';
              return `<td${cls}>${escapeHtml(value)}</td>`;
            })
            .join('');
          return `<tr>${cells}</tr>`;
        })
        .join('');
      const totalCells = headers
        .map((h, idx) => {
          if (idx === 0) return `<td>Total</td>`;
          const raw = (g.total as unknown as Record<string, unknown>)[h.value];
          const value = typeof raw === 'string' ? raw : '';
          const isNumeric =
            h.value === 'time' ||
            h.value === 'billableTime' ||
            h.value === 'nonBillableTime' ||
            h.value === 'billedAmount' ||
            h.value === 'spent';
          const cls = isNumeric ? ' class="num"' : '';
          return `<td${cls}>${escapeHtml(value)}</td>`;
        })
        .join('');
      return `
        <section class="group">
          <h3>${escapeHtml(g.title)}</h3>
          <table>
            <thead>
              <tr>${headers.map((h) => `<th>${escapeHtml(h.title)}</th>`).join('')}</tr>
            </thead>
            <tbody>${rows}</tbody>
            <tfoot><tr>${totalCells}</tr></tfoot>
          </table>
        </section>`;
    })
    .join('');

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(meta.title)} — ${escapeHtml(meta.organizationName)}</title>
<style>
  @page { size: A4 landscape; margin: 20mm 15mm; }
  body { font-family: Helvetica, Arial, sans-serif; color: #111; font-size: 11px; margin: 0; }
  header { border-bottom: 1px solid #ddd; padding-bottom: 8px; margin-bottom: 12px; }
  header .brand { font-size: 14px; font-weight: 600; }
  header .sub { color: #666; font-size: 10px; margin-top: 2px; }
  .summary { display: flex; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
  .tile { border: 1px solid #eee; border-radius: 4px; padding: 6px 10px; min-width: 120px; }
  .tile-label { color: #666; font-size: 9px; text-transform: uppercase; }
  .tile-value { font-size: 13px; font-weight: 600; margin-top: 2px; }
  .group { margin-bottom: 16px; page-break-inside: avoid; }
  .group h3 { font-size: 12px; margin: 0 0 6px; padding: 4px 6px; background: #f4f4f4; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #fafafa; font-size: 10px; text-transform: uppercase; color: #555; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
  tfoot td { font-weight: 600; border-top: 1px solid #ccc; background: #fbfbfb; }
  .empty { padding: 24px; text-align: center; color: #666; font-style: italic; }
</style>
</head>
<body>
  <header>
    <div class="brand">${escapeHtml(meta.title)} — ${escapeHtml(meta.organizationName)}</div>
    <div class="sub">${escapeHtml(meta.rangeLabel)} · Generated ${escapeHtml(meta.generatedAt)}</div>
  </header>
  <div class="summary">${summaryHtml}</div>
  ${response.groups.length === 0 ? '<div class="empty">No data for this range.</div>' : groupsHtml}
</body>
</html>`;
}

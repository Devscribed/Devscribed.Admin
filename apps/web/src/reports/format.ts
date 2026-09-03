/**
 * The formatters every report screen renders its cells through.
 *
 * They were declared three times — once per report — and drifted: `formatHours` and
 * `formatNumber` were the same function under two names, and only two of the three copies
 * dropped the trailing `h`. One copy, so a figure means the same thing on every screen.
 *
 * Every input is a string from the API. Amounts are `Decimal(n,2)` serialized as `"2100.00"`,
 * so nothing here parses one back into a float and re-rounds it — the thousands separator is
 * inserted into the digits the server sent.
 */

/** `Total Hours` → `total-hours`. The `{key}` half of a summary tile's or a column's test id. */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Groups the integer part in threes without touching the decimals the server sent. */
function withThousands(digits: string): string {
  const parts = digits.split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

/**
 * `"2100.00"` → `$2,100.00`. Anything but USD takes its ISO code as the prefix; v1 is
 * single-currency (spec reports/01 §Currency), so the code path in practice is the first.
 */
export function formatMoney(raw: string | number | null | undefined, currency: string): string {
  if (raw === null || raw === undefined || raw === '') return '';
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) return String(raw);
  const body = withThousands(Math.abs(num).toFixed(2));
  const sign = num < 0 ? '-' : '';
  return currency === 'USD' ? `${sign}$${body}` : `${sign}${currency} ${body}`;
}

/** `"4"` → `4.00h`. Two decimals always, so a column of them lines up on the point. */
export function formatHours(raw: string | number | null | undefined): string {
  const num = toNumber(raw);
  return num === null ? fallback(raw) : `${num.toFixed(2)}h`;
}

/** `"1.5"` → `1.50`. Days and working days: the same two decimals, without the unit. */
export function formatNumber(raw: string | number | null | undefined): string {
  const num = toNumber(raw);
  return num === null ? fallback(raw) : num.toFixed(2);
}

function toNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const num = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(num) ? num : null;
}

/** A value the server sent that is not a number is shown as it arrived, never as `NaN`. */
function fallback(raw: string | number | null | undefined): string {
  return raw === null || raw === undefined ? '' : String(raw);
}

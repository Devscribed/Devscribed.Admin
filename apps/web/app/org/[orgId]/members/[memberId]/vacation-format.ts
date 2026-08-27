/**
 * Deterministic, host-time-zone-independent formatting for vacation-request rows and the
 * reject-modal summary (spec 09). Dates arrive as 'YYYY-MM-DD' strings and are parsed as
 * UTC midnight so the rendered day never shifts by zone. Shared by `VacationPanel` and
 * `RejectRequestModal`.
 */

/** `Jul 14` — short month + numeric day, from a 'YYYY-MM-DD' string parsed as UTC. */
function monthDay(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return ymd;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** `Jul 14 – Jul 25, 2025` — en-dash range (DS voice); the year is shown once at the end.
 * Vacation requests are same-year by rule, so `startDate`'s year is authoritative. */
export function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const year = Number.isNaN(start.getTime()) ? '' : start.getUTCFullYear();
  return `${monthDay(startDate)} – ${monthDay(endDate)}, ${year}`;
}

/** `10 days` / `1 day` — singular at exactly one working day. */
export function formatWorkingDays(workingDays: number): string {
  return `${workingDays} day${workingDays === 1 ? '' : 's'}`;
}

/**
 * Money rendered as `$3,000.00 USD` — two decimals with thousands separators, the ISO
 * code always trailing. Mirrors `VacationPanel`'s own local formatter so the Requests
 * page (spec 10) formats deductions identically; `VacationPanel` keeps its private copy.
 */
export function formatCurrency(amount: number, currency: string): string {
  try {
    const formatted = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
    }).format(amount);
    return `${formatted} ${currency}`;
  } catch {
    return `${amount.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} ${currency}`;
  }
}

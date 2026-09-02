/**
 * Small date helpers for the report screens' default range and the range-picker
 * label. Every value is an ISO `YYYY-MM-DD` string in the caller's timezone —
 * the same shape the API's `startDate`/`endDate` query params accept, and the
 * same shape the validation package's `validateReportRange` reads.
 */

import { localDateInTz } from '@devscribed/validation';

/** Today's `YYYY-MM-DD` in `tz`. Falls back to UTC when `tz` is empty. */
export function todayInTz(tz: string | null): string {
  const zone = tz && tz.trim().length > 0 ? tz : 'UTC';
  return localDateInTz(new Date().toISOString(), zone);
}

/** `days` ago in `tz` as `YYYY-MM-DD` (negative moves backwards). */
export function daysAgoInTz(days: number, tz: string | null): string {
  const zone = tz && tz.trim().length > 0 ? tz : 'UTC';
  const ms = Date.now() - days * 86_400_000;
  return localDateInTz(new Date(ms).toISOString(), zone);
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * `2026-08-01` → `Aug 1`. Read as UTC so no zone shifts the day — the input
 * is already a wall-clock date in the caller's tz.
 */
function shortMonthDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return `${MONTH_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/**
 * `2026-08-01`, `2026-08-31` → `Aug 1 – Aug 31, 2026`. Ranges that span years
 * carry both years (`Dec 28, 2025 – Jan 3, 2026`); ranges in one month collapse
 * the second month (`Aug 1 – 31, 2026`).
 */
export function formatRangeLabel(startISO: string, endISO: string): string {
  const start = new Date(`${startISO}T00:00:00.000Z`);
  const end = new Date(`${endISO}T00:00:00.000Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return `${startISO} – ${endISO}`;
  }
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
  const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();
  const endYear = end.getUTCFullYear();
  if (sameMonth) {
    return `${MONTH_SHORT[start.getUTCMonth()]} ${start.getUTCDate()} – ${end.getUTCDate()}, ${endYear}`;
  }
  if (sameYear) {
    return `${shortMonthDay(startISO)} – ${shortMonthDay(endISO)}, ${endYear}`;
  }
  return `${shortMonthDay(startISO)}, ${start.getUTCFullYear()} – ${shortMonthDay(endISO)}, ${endYear}`;
}

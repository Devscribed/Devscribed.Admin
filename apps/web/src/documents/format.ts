/**
 * The mockup's "12 Aug 2026". Deliberately not relative ("Yesterday"): a relative label
 * is untestable without freezing the clock, and the column's job is to be scannable.
 */
export function formatUpdatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * The header summary, verbatim per spec: `v3 published · v4 draft`, `v1 published`, or
 * `Draft v1` before the first publish. E2E-01 and E2E-04 assert these exact strings, so
 * this is the only place that assembles them.
 */
export function versionSummary(published: number | null, draft: number | null): string {
  if (published !== null && draft !== null) return `v${published} published · v${draft} draft`;
  if (published !== null) return `v${published} published`;
  return `Draft v${draft ?? 1}`;
}

/** Status pill tone. Archived reads as retired, not as a failure, hence `neutral`. */
export function statusTone(status: string): 'active' | 'warning' | 'neutral' {
  if (status === 'published') return 'active';
  if (status === 'draft') return 'warning';
  return 'neutral';
}

export function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

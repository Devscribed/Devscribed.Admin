/**
 * Response shapes for the Reports endpoints (spec reports/01 §API Contracts).
 * These mirror what the API returns; every string field is a `Decimal(n,2)`
 * serialized as a string (`"2100.00"`) so no client-side FP arithmetic ever
 * runs against a rate or amount.
 */

export interface ReportHeader {
  /** Human-readable column title used by the on-screen table's `thead`. */
  title: string;
  /** JSON key each row uses for this column's value. */
  value: string;
}

export interface ReportRow {
  /** JSON key from the corresponding header's `value`. */
  [key: string]: string | number | null | undefined;
}

/**
 * Amounts Owed row (spec §Response shape). Fields carry `.` for two-decimal
 * decimal strings; `kind` differentiates project / holiday / vacation rows for
 * the row-tint treatment on the mockup.
 */
export interface AmountsOwedRow {
  member: string;
  activity: string;
  hours: string;
  rate: string;
  amount: string;
  membershipId?: string;
  kind?: 'project' | 'holiday' | 'vacation';
}

export interface ReportGroup<Row = ReportRow> {
  id: string;
  title: string;
  rows: Row[];
  total: Record<string, string | number | null>;
}

export interface ReportSummaryItem {
  label: string;
  /** Pre-formatted string; the client renders it verbatim. */
  value: string;
}

export interface ReportMeta {
  currencyCode: string;
  timezone: string;
  startDate: string;
  endDate: string;
}

export interface AmountsOwedResponse {
  headers: ReportHeader[];
  groups: ReportGroup<AmountsOwedRow>[];
  summary: ReportSummaryItem[];
  meta: ReportMeta;
}

/** Minimal member-picker option shape for the multi-select filter. */
export interface FilterOption {
  id: string;
  label: string;
}

/** Owner scope selector value (spec §Owner scope). */
export type OwnerScope = 'all' | 'my';

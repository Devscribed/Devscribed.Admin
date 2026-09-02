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

/**
 * Time & Activity row (spec §API Contracts — Time & Activity 200 shape). Every
 * field except `member` is optional because the server projects only the
 * columns the caller is authorised to see + explicitly picked (spec §Column
 * permission filter). Consumers must read `response.headers` to decide which
 * columns to render; they never assume a field is present.
 */
export interface TimeAndActivityRow {
  member: string;
  client?: string | null;
  time?: string;
  billableTime?: string;
  nonBillableTime?: string;
  billedAmount?: string;
  spent?: string;
  notes?: string | null;
}

export interface TimeAndActivityResponse {
  headers: ReportHeader[];
  groups: ReportGroup<TimeAndActivityRow>[];
  summary: ReportSummaryItem[];
  meta: ReportMeta;
}

/**
 * The full set of Time & Activity columns (spec §Column permission filter).
 * `Project`, `Time`, and `Member` are always-shown defaults; the rest are
 * request-selectable and gated by column-specific capabilities.
 */
export type ReportColumn =
  | 'Project'
  | 'Time'
  | 'Member'
  | 'Client'
  | 'Billable Time'
  | 'Non-Billable Time'
  | 'Billed Amount'
  | 'Spent'
  | 'Notes';

/** Row-level billable filter (spec Validation Rules 10; §Filter bar). */
export type BillableFilter = 'all' | 'billable' | 'non-billable';

/**
 * Response shapes for the Holidays endpoints (spec organization/03 §API Contracts, and
 * time off spec 02 §Routes). These mirror what the API returns; `packages/validation`
 * owns the rules and wording.
 */

/** One row of `GET /api/organizations/{orgId}/holidays`. */
export interface HolidayRow {
  id: string;
  /** Always `YYYY-MM-DD` — a calendar day, never an instant. */
  date: string;
  name: string;
  /** A JSON number; `0` and fractional half-days are both legitimate. */
  paidHours: number;
  /** `null` means the holiday applies to every country. */
  countryCode: string | null;
  /** Time off spec 02 — `manual` or `imported`, where this row came from. */
  source: string;
  createdAt: string;
  updatedAt: string;
}

/** §State Machine — `unsourced` is the absence of an import record, not a stored value. */
export type SourcingState = 'sourced' | 'empty' | 'unsourced';

export interface SourcingCountry {
  countryCode: string;
  state: SourcingState;
  holidayCount: number;
  lastImportedAt: string | null;
}

/**
 * The `sourcing` block, present only for a caller holding `view-holidays` (REQ-02-025) —
 * which is every caller that reaches this screen. A `scope=mine` read carries no such key.
 */
export interface SourcingBlock {
  year: number;
  countries: SourcingCountry[];
}

export interface HolidaysResponse {
  holidays: HolidayRow[];
  sourcing?: SourcingBlock;
}

/** One country of `POST .../holidays/sync`'s answer. Always a `200`, whatever happened. */
export interface SyncCountryResult {
  countryCode: string;
  state: SourcingState;
  written: number;
  skipped: number;
  discarded: number;
}

export interface SyncResponse {
  year: number;
  countries: SyncCountryResult[];
}

/** One amount in one currency. Absent — never zero — where money is withheld. */
export interface SummaryAmount {
  currency: string;
  amount: string;
}

export interface SummaryCountryRow {
  /** `null` is the global row: holidays that reach every active member. */
  countryCode: string | null;
  holidayCount: number;
  memberCount: number;
}

export interface SummaryMemberRow {
  membershipId: string;
  displayName: string;
  countryCode: string | null;
  holidayCount: number;
  /** A two-decimal string, the shape the reports already send. */
  paidHours: string;
  byCurrency?: SummaryAmount[];
}

export interface SummaryTotals {
  holidayCount: number;
  paidHours: string;
  byCurrency?: SummaryAmount[];
}

/** `GET /api/organizations/{orgId}/holidays/summary`. */
export interface HolidaySummaryResponse {
  year: number;
  countries: SummaryCountryRow[];
  members: SummaryMemberRow[];
  totals: SummaryTotals;
}

/** Both halves of `GET`/`PUT .../settings/holiday-sourcing`. */
export interface HolidaySourcingSettings {
  includeOrgCountry: boolean;
}

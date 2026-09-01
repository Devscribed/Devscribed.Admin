/**
 * Response shapes for the Holidays endpoints (spec organization/03 §API Contracts).
 * These mirror what the API returns; `packages/validation` owns the rules and wording.
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
  createdAt: string;
  updatedAt: string;
}

export interface HolidaysResponse {
  holidays: HolidayRow[];
}

/**
 * Availability data transfer objects — the shape returned by
 * `GET /api/availability` and consumed by the client controls. Client-safe:
 * this module must not import server-only code.
 */

export interface AvailabilitySlotDto {
  /** Absolute start instant, ISO 8601 UTC (used to book). */
  start: string;
  /** Display label, 24-hour `HH:mm` in the requested time zone. */
  label: string;
}

export interface AvailabilityDto {
  /** The resolved IANA display zone the times are expressed in. */
  timeZone: string;
  durationMinutes: number;
  /** Earliest bookable date, ISO `yyyy-MM-dd` (today, in the display zone). */
  minDate: string;
  /** Latest bookable date, ISO `yyyy-MM-dd` (one month ahead). */
  maxDate: string;
  /** Dates with at least one bookable slot, ISO `yyyy-MM-dd`, sorted. */
  availableDates: string[];
  /** Slots keyed by ISO date (display zone); each list is chronological. */
  slotsByDate: Record<string, AvailabilitySlotDto[]>;
}

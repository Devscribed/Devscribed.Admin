/**
 * Booking response DTO returned by POST /api/bookings and consumed by the
 * client. Client-safe: no server-only imports.
 */
export interface BookingResultDto {
  token: string;
  /** Absolute URL of the Manage Booking page. */
  manageUrl: string;
  /** Absolute interview start/end, ISO 8601 UTC. */
  start: string;
  end: string;
  /** IANA zone the candidate booked in. */
  timeZone: string;
  interview: { slug: string; name: string; durationMinutes: number };
  candidate: {
    firstName: string;
    lastName: string;
    email: string;
    note?: string;
  };
}

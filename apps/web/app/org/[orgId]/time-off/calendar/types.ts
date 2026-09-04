/**
 * The body of `GET /api/organizations/{orgId}/time-off/calendar`, mirrored field for
 * field from the contracts of time off spec 01. Nothing here is computed on the client:
 * `holidayIds` is the server's resolution of the country chain, `appliesToAllInView` is
 * the answer REQ-01-030 and REQ-01-031 branch on, and the band's dates are the request's
 * true ones with a flag on each edge that falls outside the window.
 */

export interface CalendarDay {
  date: string;
  isWeekend: boolean;
  isoWeek: number;
}

export interface CalendarHoliday {
  id: string;
  date: string;
  name: string;
  countryCode: string | null;
  appliesToAllInView: boolean;
}

export interface CalendarAbsence {
  id: string;
  kind: string;
  status: string;
  startDate: string;
  endDate: string;
  workingDays: number;
  startsBeforeWindow: boolean;
  endsAfterWindow: boolean;
}

export interface CalendarMember {
  membershipId: string;
  displayName: string;
  jobTitle: string | null;
  /** The RESOLVED holiday country, emitted so the row can explain its own markers. */
  countryCode: string | null;
  holidayIds: string[];
  absences: CalendarAbsence[];
}

export interface TimeOffCalendarResponse {
  range: { startDate: string; endDate: string; today: string; timezone: string };
  days: CalendarDay[];
  holidays: CalendarHoliday[];
  members: CalendarMember[];
  meta: { scope: string; memberCount: number };
}

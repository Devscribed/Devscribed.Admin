/**
 * The shapes the hiring API answers with. They mirror the contracts in
 * `specs/hiring/01-vacancies.md` and `02-booking-page.md` exactly, so a change to one
 * is a compile error here rather than a blank cell on a screen.
 */

export interface Vacancy {
  id: string;
  title: string;
  description: string | null;
  status: 'open' | 'closed';
  durationMinutes: number;
  publicSlug: string;
  interviewer: { accountId: string; fullName: string };
  categories: Array<{ id: string; name: string }>;
  applicationCount: number;
  scheduledCount: number;
  createdAt: string;
}

export interface InterviewerOption {
  accountId: string;
  fullName: string;
  email: string;
  eligible: boolean;
  reason: 'no_mailbox' | null;
}

export interface PublicVacancy {
  organizationName: string;
  vacancy: {
    title: string;
    description: string | null;
    durationMinutes: number;
    status: 'open' | 'closed';
  };
}

export interface Availability {
  /** The zone the dates were bucketed in — echoed back, never guessed at. */
  timeZone: string;
  /** Today through one calendar month ahead, in `timeZone`. */
  window: { from: string; to: string };
  /**
   * One entry per date in the requested month, holding absolute UTC instants. An empty
   * array is a date with nothing free; a date that is absent is outside the window.
   * The page renders these; it never invents one.
   */
  dates: Record<string, string[]>;
}

export interface BookingConfirmation {
  vacancyTitle: string;
  durationMinutes: number;
  startUtc: string;
  timeZone: string;
  firstName: string;
  lastName: string;
  email: string;
  cvFileName: string;
}

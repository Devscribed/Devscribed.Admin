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
  durationMinutes: number;
  timeZone: string;
  /** Absolute UTC instants. The page renders them; it never invents one. */
  slots: string[];
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

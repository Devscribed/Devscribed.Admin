/**
 * The three public interview booking links. Each opens the same booking page;
 * they differ only by duration, which sets the interview name, drives slot
 * generation, and is written into the invite and candidate record.
 *
 * See specs/hiring-process/02-booking-page/booking-page.md §02.
 */
export type InterviewDuration = 15 | 30 | 60;

export interface InterviewType {
  /** URL slug for the public booking link, e.g. "15-min". */
  slug: string;
  /** Display name shown on the page, e.g. "15-minutes interview". */
  name: string;
  durationMinutes: InterviewDuration;
}

export const INTERVIEW_TYPES: readonly InterviewType[] = [
  { slug: "15-min", name: "15-minutes interview", durationMinutes: 15 },
  { slug: "30-min", name: "30-minutes interview", durationMinutes: 30 },
  { slug: "1-hour", name: "1 hour interview", durationMinutes: 60 },
] as const;

export function getInterviewTypeBySlug(
  slug: string,
): InterviewType | undefined {
  return INTERVIEW_TYPES.find((t) => t.slug === slug);
}

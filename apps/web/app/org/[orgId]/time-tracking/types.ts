/** The three views of the Time Tracking page. Monthly is the default on first visit. */
export type TimeView = 'daily' | 'weekly' | 'monthly';

/**
 * One entry of `GET /api/organizations/{orgId}/time-entries` (spec 12 API contract), also
 * the shape returned by `POST/PUT .../time-entries` and (as `timeEntry`) by `POST
 * .../timer/stop`. `startTime`/`endTime` are ISO-8601 UTC instants the API composed as
 * `{date}T{HH:MM}:00Z`; the daily list renders their HH:MM from the UTC components
 * directly (no per-member-timezone conversion in v1). `date` is a `YYYY-MM-DD` string.
 */
export interface TimeEntry {
  id: string;
  membershipId: string;
  /** Present only when the caller has `manage-all-time-entries` (admin/manager). */
  memberName?: string | null;
  projectId: string | null;
  projectName: string | null;
  task: string | null;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  createdAt: string;
}

export interface TimeEntriesResponse {
  entries: TimeEntry[];
  /** Sum across the response — the views recompute their own cell/period totals client-side. */
  totalMinutes: number;
}

/** A project the caller may log time against — the timer + entry-modal `Select` source. */
export interface AssignableProject {
  id: string;
  name: string;
}

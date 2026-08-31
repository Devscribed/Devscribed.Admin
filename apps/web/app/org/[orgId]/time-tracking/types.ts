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
  /** Spec 15 — id of the linked task when the entry was created/edited with a
   * task selection. Null when free-text or the task was later deleted (FR-8). */
  taskId?: string | null;
  /** Spec 15 — the `{PROJECT_KEY}-{taskNumber}` shorthand carried on responses so
   * the client can render the chip without a second lookup. Snapshot at write time. */
  taskKey?: string | null;
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
  /** Spec 15 — the project's board key (e.g. "MOB"). Null for projects that never
   * had a key set, in which case the task selector never renders (spec 15 FR-15). */
  key: string | null;
}

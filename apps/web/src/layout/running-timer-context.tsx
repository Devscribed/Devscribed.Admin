'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { can, type Role } from '@devscribed/validation';
import { useSession } from './session-context';

/** The running-timer record as returned by `GET/POST/PUT .../timer` (spec 12 API,
 * extended by spec 15 with `taskId` + `taskKey`). */
export interface RunningTimer {
  id: string;
  projectId: string | null;
  projectName: string | null;
  task: string | null;
  description: string | null;
  /** ISO-8601 UTC instant the server stamped at start; the client derives elapsed from it. */
  startedAt: string;
  /** Spec 15 — linked task id, or null when unlinked. */
  taskId?: string | null;
  /** Spec 15 — `{PROJECT_KEY}-{taskNumber}` shorthand for chip rendering. */
  taskKey?: string | null;
  /** Spec 16 — copied onto the resulting entry when the timer is stopped; toggleable
   * mid-run. Missing (from a legacy server) is treated as billable in every UI branch. */
  billable?: boolean;
}

/** The time entry the server creates when a timer is stopped (spec 12 POST /timer/stop). */
export interface StoppedTimeEntry {
  id: string;
  membershipId: string;
  projectId: string | null;
  projectName: string | null;
  task: string | null;
  description: string | null;
  date: string;
  startTime: string | null;
  endTime: string | null;
  durationMinutes: number;
  createdAt: string;
  /** Spec 15 — carried through from the running timer at stop time (FR-9). */
  taskId?: string | null;
  taskKey?: string | null;
}

interface StartResult {
  ok: boolean;
  /** 409 — a timer was already running; the caller shows the conflict toast. */
  conflict?: boolean;
  message?: string;
  /** Spec 15 — server error code (`task_requires_project`, `task_wrong_project`,
   * `task_not_found`, `task_project_not_assigned`) so the caller can translate. */
  errorCode?: string | null;
  /** Spec 15 — field-level validation errors keyed by field name (e.g. `taskId`). */
  errors?: Record<string, string> | null;
}

interface RunningTimerValue {
  /** The caller's running timer, or null when idle. The single source of truth shared by
   * the TT-page timer bar and the topbar indicator. */
  timer: RunningTimer | null;
  /** Whole seconds since `startedAt`, ticking once per second while a timer runs. */
  elapsedSeconds: number;
  /** Re-read the timer from the server (`GET .../timer`). */
  refresh: () => Promise<void>;
  /** Start a timer (`POST .../timer/start`). Seeds state on success. */
  start: (body: {
    projectId: string | null;
    task: string | null;
    description: string | null;
    /** Spec 15 — link to a task in the project. `null` starts unlinked. */
    taskId?: string | null;
    /** Spec 16 — optional; server defaults to `true` when absent. */
    billable?: boolean;
  }) => Promise<StartResult>;
  /** Update the running timer's metadata (`PUT .../timer`) without restarting. */
  update: (body: {
    projectId: string | null;
    task: string | null;
    description: string | null;
    /** Spec 15 — explicit `null` clears an existing task link (FR-6). */
    taskId?: string | null;
    /** Spec 16 — toggle the flag mid-run without restarting the timer. */
    billable?: boolean;
  }) => Promise<void>;
  /** Stop & save (`POST .../timer/stop`). Clears state; returns the created entry. */
  stop: () => Promise<{ ok: boolean; timeEntry?: StoppedTimeEntry }>;
  /** Discard (`DELETE .../timer`) — no entry created. Clears state. */
  discard: () => Promise<{ ok: boolean }>;
}

const RunningTimerContext = createContext<RunningTimerValue | null>(null);

function elapsedFrom(startedAt: string): number {
  const started = new Date(startedAt).getTime();
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, Math.floor((Date.now() - started) / 1000));
}

/**
 * Shell-level source of truth for the caller's running timer (spec 12), mirroring spec
 * 10's `RequestsBadgeProvider`. Mounted in `AppShell` inside the session provider.
 *
 * On mount — after the session has resolved — it fires `GET .../timer` once (no polling)
 * for any caller who can use the timer (admin/manager/user; never viewer). While a timer
 * runs it owns a single `setInterval` ticking once per second, deriving `elapsedSeconds`
 * from `startedAt`. Both the topbar indicator and the TT-page timer bar subscribe here, so
 * the two clocks never drift and starting/stopping in one place updates the other with no
 * refetch. The client clock is decorative — the server owns the stored duration.
 */
export function RunningTimerProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const orgId = session.organization.id;
  const canUse = can(session.role as Role, 'use-timer');

  const [timer, setTimer] = useState<RunningTimer | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // A single interval ticks the clock whenever a timer is present. Recreated only when the
  // running timer's identity/start changes; cleared on unmount and when idle.
  const startedAt = timer?.startedAt ?? null;
  useEffect(() => {
    if (!startedAt) {
      setElapsedSeconds(0);
      return;
    }
    setElapsedSeconds(elapsedFrom(startedAt));
    const id = setInterval(() => setElapsedSeconds(elapsedFrom(startedAt)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const refresh = useCallback(async (): Promise<void> => {
    if (!canUse) return;
    try {
      const response = await fetch(`/api/organizations/${orgId}/timer`, {
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      setTimer((data && data.timer) ?? null);
    } catch {
      // A failed read leaves the last known state; not user-facing.
    }
  }, [orgId, canUse]);

  // Seed once after the session resolves. The gate matches the sidebar row's visibility,
  // so viewer never fires the request.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    void refresh();
  }, [refresh]);

  const start = useCallback<RunningTimerValue['start']>(
    async (body) => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/timer/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        if (response.ok) {
          const data = (await response.json().catch(() => null)) as RunningTimer | null;
          if (data) setTimer(data);
          return { ok: true };
        }
        const err = await response.json().catch(() => null);
        return {
          ok: false,
          conflict: response.status === 409,
          message: err?.message,
          errorCode: err?.error ?? null,
          errors: (err?.errors ?? null) as Record<string, string> | null,
        };
      } catch {
        return { ok: false };
      }
    },
    [orgId],
  );

  const update = useCallback<RunningTimerValue['update']>(
    async (body) => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/timer`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify(body),
        });
        if (!response.ok) return;
        const data = (await response.json().catch(() => null)) as RunningTimer | null;
        // The PUT response carries the server-resolved projectName; adopt it so the topbar
        // indicator's project label updates with `startedAt` untouched.
        if (data) setTimer(data);
      } catch {
        // Metadata edits are best-effort; a failed PUT leaves the last known metadata.
      }
    },
    [orgId],
  );

  const stop = useCallback<RunningTimerValue['stop']>(async () => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/timer/stop`, {
        method: 'POST',
        credentials: 'same-origin',
      });
      if (response.ok) {
        const data = await response.json().catch(() => null);
        setTimer(null);
        return { ok: true, timeEntry: data?.timeEntry as StoppedTimeEntry | undefined };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, [orgId]);

  const discard = useCallback<RunningTimerValue['discard']>(async () => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/timer`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });
      if (response.ok) {
        setTimer(null);
        return { ok: true };
      }
      return { ok: false };
    } catch {
      return { ok: false };
    }
  }, [orgId]);

  return (
    <RunningTimerContext.Provider
      value={{ timer, elapsedSeconds, refresh, start, update, stop, discard }}
    >
      {children}
    </RunningTimerContext.Provider>
  );
}

/** Read the shared running-timer state and its actions. Only valid inside the shell. */
export function useRunningTimer(): RunningTimerValue {
  const value = useContext(RunningTimerContext);
  if (!value) throw new Error('useRunningTimer must be used inside the app shell');
  return value;
}

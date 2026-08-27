'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { can, type Role } from '@devscribed/validation';
import { useSession } from './session-context';

interface RequestsBadgeValue {
  /** Count of pending requests across the org, driving the sidebar badge. 0 hides it. */
  pendingCount: number;
  /** Refetch the pending count from the server; called by the Requests page after any
   * successful action so the badge updates in place. No-op for user/viewer. */
  refresh: () => Promise<void>;
}

const RequestsBadgeContext = createContext<RequestsBadgeValue | null>(null);

/**
 * Shell-level source of the sidebar's pending-requests badge count (spec 10). Mounted in
 * `AppShell` inside the session provider so it can read the caller's role.
 *
 * For `admin`/`manager` only (same gate as the sidebar row's visibility, so `user`/`viewer`
 * never fire the request) it fetches `GET .../requests?status=pending` once on mount and
 * seeds `pendingCount` from the response's authoritative `pendingCount`. The Requests page
 * calls `refresh()` after each approve/reject/cancel so the badge stays in sync without any
 * optimistic patching — the server's count is always the source of truth.
 */
export function RequestsBadgeProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const orgId = session.organization.id;
  const canView = can(session.role as Role, 'view-requests');
  const [pendingCount, setPendingCount] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (!canView) return;
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/requests?status=pending`,
        { credentials: 'same-origin' },
      );
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (data && typeof data.pendingCount === 'number') {
        setPendingCount(data.pendingCount);
      }
    } catch {
      // A failed count fetch leaves the badge at its last value; not user-facing.
    }
  }, [orgId, canView]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <RequestsBadgeContext.Provider value={{ pendingCount, refresh }}>
      {children}
    </RequestsBadgeContext.Provider>
  );
}

/** Read the shared pending-requests count and its refresher. Only valid inside the shell. */
export function usePendingRequests(): RequestsBadgeValue {
  const value = useContext(RequestsBadgeContext);
  if (!value) throw new Error('usePendingRequests must be used inside the app shell');
  return value;
}

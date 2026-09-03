'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { can, normalizeRole } from '@devscribed/validation';
import { useSession } from './session-context';

interface RequestsBadgeValue {
  /**
   * What the sidebar badge shows: the work waiting on the caller. 0 hides it.
   * Requests spec 01 requirement 44 — non-terminal requests addressed to the caller,
   * plus, for a holder of `view-requests`, the pending vacation count the badge shows
   * today.
   */
  badgeCount: number;
  /** Refetch the count from the server; called after any successful action so the badge
   * updates in place. Fired for every role — everyone now has an inbox. */
  refresh: () => Promise<void>;
}

const RequestsBadgeContext = createContext<RequestsBadgeValue | null>(null);

/**
 * Shell-level source of the sidebar's Requests badge. Mounted in `AppShell` inside the
 * session provider so it can read the caller's role.
 *
 * It counts the **work**, not the view: the call sends no `scope`, `type` or `status`,
 * and reads the two counters the server computes before any filter is applied. A badge
 * that moved when someone narrowed a filter would be reporting what is on screen rather
 * than what is waiting.
 *
 * Every role fetches it, because every role now has requests of their own. The
 * `view-requests` capability decides only which counters are in the response: a `user`
 * gets `counts.waitingOnMe` and no `vacation` block at all.
 */
export function RequestsBadgeProvider({ children }: { children: ReactNode }) {
  const session = useSession();
  const orgId = session.organization.id;
  // The session carries `Membership.role` verbatim, and the database still holds the
  // legacy `member`, which `can()` does not know. Normalizing first keeps this read
  // answering the same question the server does about the same account.
  // The kind is asked first (REQ-03-017): a client contact holds no role, and the
  // response they receive carries no vacation half at all — so there is nothing to ask a
  // role-keyed helper about, and asking would answer them from the viewer set.
  const canSeeVacation =
    session.principal === 'member' && can(normalizeRole(session.role), 'view-requests');
  const [badgeCount, setBadgeCount] = useState(0);

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`/api/organizations/${orgId}/requests`, {
        credentials: 'same-origin',
      });
      if (!response.ok) return;
      const data = await response.json().catch(() => null);
      if (!data) return;
      const waitingOnMe = typeof data.counts?.waitingOnMe === 'number' ? data.counts.waitingOnMe : 0;
      // The vacation half is only in the response for a `view-requests` holder; for
      // anyone else there is nothing to add, which is the same thing as adding zero.
      const pending =
        canSeeVacation && typeof data.vacation?.pendingCount === 'number'
          ? data.vacation.pendingCount
          : 0;
      setBadgeCount(waitingOnMe + pending);
    } catch {
      // A failed count fetch leaves the badge at its last value; not user-facing.
    }
  }, [orgId, canSeeVacation]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <RequestsBadgeContext.Provider value={{ badgeCount, refresh }}>
      {children}
    </RequestsBadgeContext.Provider>
  );
}

/** Read the shared Requests badge count and its refresher. Only valid inside the shell. */
export function usePendingRequests(): RequestsBadgeValue {
  const value = useContext(RequestsBadgeContext);
  if (!value) throw new Error('usePendingRequests must be used inside the app shell');
  return value;
}

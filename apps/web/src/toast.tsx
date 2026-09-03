'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ToastHost, type ToastEntry } from '@devscribed/ds';

interface ToastContextValue {
  /**
   * Shows a toast carrying `testId` for a few seconds. `tone` defaults to `'success'`.
   */
  showToast: (testId: string, message: string, tone?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * The application's toast queue, drawn by the design system's `ToastHost` (§54).
 *
 * **The queue is the caller's** — that is the system's own division, and it is the one this
 * provider was already making: it holds the list, the host draws and times it. What moved
 * across is everything below that line. The plate was an `InfoBanner` in a hand-placed
 * bottom-right column; it is now §54's plate in the system's top-right column, which is
 * where a confirmation belongs — beside the header the action was taken from rather than in
 * the far corner from it. The timer moved too: 3400ms, chosen as a reading speed, rather
 * than the 4000 this file picked.
 *
 * `showToast` is unchanged, so no call site moves. What is *not* settled here is which tone
 * each message deserves. §54 argues that most confirmations are untyped — a green plate for
 * every saved field is noise — and this provider still defaults to `success` because forty
 * call sites chose that default and re-deciding them one by one belongs to the screen each
 * one is on.
 *
 * Mounted once in the root layout so every route — signed-in or not — can call `useToast()`.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback(
    (testId: string, message: string, tone: 'success' | 'error' = 'success') => {
      const id = nextId.current++;
      /**
       * **One plate per test id.** The same confirmation raised twice — two saves, two
       * failed sends — replaces its predecessor rather than stacking under it, and the
       * replacement restarts the timer, which is what somebody who just acted again wants.
       * A column reading `Saved` over `Saved` says nothing the first one did not.
       *
       * It also keeps the id a *handle*: two live nodes carrying one `data-testid` is an
       * ambiguous locator, and E2E is right to refuse it.
       */
      setToasts((prev) => [...prev.filter((toast) => toast.testId !== testId), { id, testId, message, tone }]);
    },
    [],
  );

  const dismiss = useCallback((id: string | number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastHost toasts={toasts} onDismiss={dismiss} label="Notifications" />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}

'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * The queue behind `ToastHost` (decisions §54).
 *
 * The design system draws a toast and times it; **which** messages exist is application
 * state, exactly as `AppShell` takes `menuOpen` rather than owning its drawer. This is
 * that state, in one place, because Phases 7 and 9 add more toasts to more screens and a
 * second copy is how two of them would come to disagree about stacking.
 *
 * Two rules, and both are the reason a queue exists rather than a single slot:
 *
 * - **A new message adds a line.** It never replaces the last one. Cancelling one
 *   interview and then opening another's calendar is two things that happened, and the
 *   first is not made untrue by the second.
 * - **Ids are minted here, never derived from the message.** Two identical messages are
 *   two events — "Interview cancelled" twice means two interviews — and keying by text
 *   would silently collapse them into one.
 *
 * Nothing here times anything: `ToastHost` owns the clock (`autoClose`, paused while a
 * pointer is over the column) and calls `dismiss` with the id of whatever it dropped.
 */

/**
 * The design system's own set, which is `react-toastify`'s (decisions §54). Most of what this
 * app confirms is **untyped** — `default`, the white message with no mark — because that is
 * what most confirmations are, and because a status hue on "Vacancy updated" claims a significance the
 * event does not have. The coloured types are kept for the case that earns one: a request
 * that failed.
 */
export type ToastTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export interface QueuedToast {
  id: number;
  message: string;
  /** Omitted is `default`, which is what a confirmation is. */
  tone?: ToastTone;
  /** Names the announcement, not the component — the same rule the card's banners follow. */
  testId?: string;
}

export interface Toasts {
  toasts: QueuedToast[];
  push: (toast: Omit<QueuedToast, 'id'>) => void;
  /** Widened to the host's own id type, which allows a string. Ours are always numbers. */
  dismiss: (id: string | number) => void;
}

export function useToasts(): Toasts {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((toast: Omit<QueuedToast, 'id'>) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: string | number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

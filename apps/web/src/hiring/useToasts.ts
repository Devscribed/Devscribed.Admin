'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * The queue behind `ToastHost` (ledger §54).
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
 * Nothing here times anything: each `Toast` withdraws itself and calls `dismiss` when its
 * exit has finished, which is what keeps the row in the document while it slides out.
 */

export type ToastTone = 'info' | 'success' | 'error';

export interface QueuedToast {
  id: number;
  message: string;
  tone: ToastTone;
  /** Names the announcement, not the component — the same rule the card's banners follow. */
  testId?: string;
}

export interface Toasts {
  toasts: QueuedToast[];
  push: (toast: Omit<QueuedToast, 'id'>) => void;
  dismiss: (id: number) => void;
}

export function useToasts(): Toasts {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((toast: Omit<QueuedToast, 'id'>) => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { ...toast, id }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, push, dismiss };
}

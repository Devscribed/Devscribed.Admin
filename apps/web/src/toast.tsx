'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { ToastHost, type ToastEntry } from '@devscribed/ds';

/**
 * The design system's own set, which is `react-toastify`'s (decisions §54). Most of what this
 * app confirms is **untyped** — `default`, the white message with no mark — because that is
 * what most confirmations are, and because a status hue on "Vacancy updated" claims a
 * significance the event does not have. The coloured types are kept for the case that earns
 * one: a request that failed.
 */
export type ToastTone = 'default' | 'info' | 'success' | 'warning' | 'error';

export interface QueuedToast {
  id: number;
  /**
   * A sentence, or a sentence with a control in it. A failure that can be retried carries its
   * retry *in* the message, so the way back is on the plate that reports the need for it.
   */
  message: ReactNode;
  /** Omitted is `default`, which is what a confirmation is. */
  tone?: ToastTone;
  /** Names the announcement, not the component that draws it. */
  testId?: string;
  /**
   * Overrides the host's clock for this one message. `0` leaves it standing: a failure whose
   * plate holds the retry cannot be allowed to take the retry with it.
   */
  autoClose?: number;
}

interface ToastContextValue {
  /** Adds a line. Returns the id, so a caller that raised a standing message can take it down. */
  push: (toast: Omit<QueuedToast, 'id'>) => number;
  /** Widened to the host's own id type, which allows a string. Ours are always numbers. */
  dismiss: (id: string | number) => void;
  /**
   * The older shape, kept so no call site has to move: a test id, a sentence, and a tone that
   * defaults to `success` because the screens that use it chose that default, and re-deciding
   * them one by one belongs to each screen. New code calls `push`.
   */
  showToast: (testId: string, message: string, tone?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * The application's one toast queue, drawn by the design system's `ToastHost` (§54).
 *
 * **The queue is the caller's** — that is the system's own division, and this is the caller:
 * one provider in the root layout, one host in the top-right corner, and every screen pushing
 * into the same list. There used to be two — this one, and a per-screen copy under hiring
 * that mounted its own host — which meant two columns drawn in the same corner the day a
 * screen called both (ADR 0011).
 *
 * Two rules, and both are the reason a queue exists rather than a single slot:
 *
 * - **A new message adds a line.** It never replaces the last one, not even one carrying the
 *   same test id. Cancelling one interview and then another is two things that happened, and
 *   the first is not made untrue by the second. The cost lands on the tests: two plates
 *   raised within one clock share a test id, so a case that repeats an action inside 3.4
 *   seconds locates the plate it means rather than the id alone.
 * - **Ids are minted here, never derived from the message.** Two identical messages are two
 *   events, and keying by text would silently collapse them into one.
 *
 * Nothing here times anything: `ToastHost` owns the clock (`autoClose`, paused while a
 * pointer is over the column) and calls `dismiss` with the id of whatever it dropped. The one
 * thing a caller may say about the clock is `autoClose: 0`, which is how a failure that
 * carries its own retry stays standing until that retry — or the × — is pressed.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<QueuedToast[]>([]);
  const nextId = useRef(0);

  const push = useCallback((toast: Omit<QueuedToast, 'id'>): number => {
    nextId.current += 1;
    const id = nextId.current;
    setToasts((current) => [...current, { ...toast, id }]);
    return id;
  }, []);

  const dismiss = useCallback((id: string | number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (testId: string, message: string, tone: 'success' | 'error' = 'success') => {
      push({ testId, message, tone });
    },
    [push],
  );

  return (
    <ToastContext.Provider value={{ push, dismiss, showToast }}>
      {children}
      <ToastHost toasts={toasts as ToastEntry[]} onDismiss={dismiss} label="Notifications" />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}

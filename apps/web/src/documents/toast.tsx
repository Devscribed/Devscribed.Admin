'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * The application has no toast surface yet, and spec 01 names five of them by test id.
 * This is deliberately the smallest thing that satisfies the spec: a context, a stack in
 * the corner, and no queueing or animation policy. When a second area needs toasts it
 * should move to `src/layout/` — it lives under `documents/` until then so this spec does
 * not quietly become the owner of a shell-wide concern.
 */

export interface Toast {
  /** Doubles as the React key and as the `data-testid` the spec asserts on. */
  testId: string;
  message: string;
  tone: 'success' | 'error';
}

interface ToastApi {
  show: (toast: Toast) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Five seconds rather than the usual two: a Playwright assertion has to arrive after a
 * navigation and a re-render, and a toast that has already gone is an untestable toast.
 */
const VISIBLE_MS = 5000;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const show = useCallback((toast: Toast) => {
    // Same test id twice in a row would give Playwright two matching nodes, so the
    // previous instance of a toast is replaced rather than stacked.
    setToasts((current) => [...current.filter((t) => t.testId !== toast.testId), toast]);
    timers.current.push(
      setTimeout(() => {
        setToasts((current) => current.filter((t) => t !== toast));
      }, VISIBLE_MS),
    );
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed',
          right: 'var(--sp-10)',
          bottom: 'var(--sp-10)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-4)',
          zIndex: 200,
        }}
      >
        {toasts.map((toast) => (
          <div
            key={toast.testId}
            role="status"
            data-testid={toast.testId}
            style={{
              minWidth: 240,
              maxWidth: 380,
              padding: '12px 16px',
              borderRadius: 'var(--radius-xl)',
              border: `1px solid ${
                toast.tone === 'error' ? 'var(--status-inactive-ink)' : 'var(--border)'
              }`,
              background: toast.tone === 'error' ? 'var(--status-inactive-bg)' : 'var(--bg-panel)',
              color: toast.tone === 'error' ? 'var(--status-inactive-ink)' : 'var(--text)',
              boxShadow: 'var(--shadow-pop)',
              fontFamily: 'var(--font-text)',
              fontSize: 'var(--fs-14)',
            }}
          >
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** Only callable under `ToastProvider`; each documents page mounts its own. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside a ToastProvider');
  return api;
}

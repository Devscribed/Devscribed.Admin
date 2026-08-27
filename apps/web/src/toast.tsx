'use client';

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { InfoBanner } from '@/ds';

interface ToastItem {
  id: number;
  testId: string;
  message: string;
  tone: 'success' | 'error';
}

interface ToastContextValue {
  /**
   * Shows a toast carrying `testId` for at most a few seconds. `tone` defaults to
   * `'success'` (the only tone that existed before spec 05); spec 05 needs an error
   * toast for save failures (business spec's Interactions section — "shows error
   * toast with the API error message").
   */
  showToast: (testId: string, message: string, tone?: 'success' | 'error') => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4000;

/**
 * A minimal, reusable toast layer. Spec 03 needs `toast-invite-sent`; spec 04 will add
 * `toast-member-removed` / `toast-member-restored` on top of the same mechanism, so this
 * lives outside any one screen rather than being invented per-modal.
 *
 * Mounted once in the root layout so every route — signed-in or not — can call
 * `useToast()`. State is local (no persistence, no queueing beyond a simple stack);
 * anything fancier is out of scope until a second consumer needs it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((testId: string, message: string, tone: 'success' | 'error' = 'success') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, testId, message, tone }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        style={{
          position: 'fixed',
          bottom: 'var(--sp-8)',
          right: 'var(--sp-8)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-4)',
          zIndex: 200,
        }}
      >
        {toasts.map((toast) => (
          <div key={toast.id} data-testid={toast.testId} style={{ minWidth: 280, maxWidth: 360 }}>
            <InfoBanner
              tone={toast.tone}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              aria-live="polite"
            >
              {toast.message}
            </InfoBanner>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside a ToastProvider');
  return ctx;
}

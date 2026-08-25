import React, { useEffect } from 'react';

const TONES = {
  success: { bg: 'var(--status-active-bg)', border: 'var(--success-500)', ink: 'var(--success-700)' },
  error: { bg: 'var(--error-100)', border: 'var(--error-500)', ink: 'var(--error-700)' },
  info: { bg: 'var(--accent-soft)', border: 'var(--accent-border)', ink: 'var(--accent)' },
};

export function Toast({ tone = 'success', duration = 4000, onDismiss, style, children, ...rest }) {
  useEffect(() => {
    if (!duration || !onDismiss) return undefined;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [duration, onDismiss]);

  const palette = TONES[tone] || TONES.success;

  return (
    <div
      {...rest}
      // Polite, and never focused: a toast reports what already happened.
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', left: '50%', bottom: 'var(--sp-10)', transform: 'translateX(-50%)',
        zIndex: 60, maxWidth: 'min(90vw, 420px)',
        display: 'flex', alignItems: 'center', gap: 'var(--sp-4)',
        padding: '12px 18px',
        background: palette.bg,
        border: `1px solid ${palette.border}`,
        borderRadius: 'var(--radius-xl)',
        boxShadow: 'var(--shadow-pop)',
        fontFamily: 'var(--font-text)', fontSize: 'var(--fs-14)',
        color: palette.ink,
        ...style,
      }}
    >{children}</div>
  );
}

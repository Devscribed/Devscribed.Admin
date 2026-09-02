import React from 'react';
import { IconButton } from '../core/IconButton';
import { CloseIcon } from '../icons/Icon';

export interface InfoBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * `info` and `warning`; `error` (§7) is `warning`'s treatment under the name that says what
   * it means, and `success` (§7) is the green counterpart.
   */
  variant?: 'info' | 'warning' | 'error' | 'success';
  /**
   * §24 — draws a trailing close button. A banner reporting a *state* goes away when the state
   * does and needs none; one reporting an event that already happened has no other way out.
   */
  onDismiss?: () => void;
  /** Accessible name for that button. Defaults to `Dismiss`. */
  dismissLabel?: string;
  children: React.ReactNode;
}

/* Four tones, three treatments. `warning` and `error` are the same paint under two names —
   a warning *is* the error palette here, and `error` is the name that says so.

   Every tint is its status colour at 10%: `--color-info-tint` is the info cyan at 10% and
   `--color-error-tint` the error red at 10%, so `success`'s green follows the same rule rather
   than being picked by eye. That 10%-of-status rule is what any tone added later must follow. */
const variants: Record<string, { line: string; fill: string }> = {
  info: { line: 'var(--status-info)', fill: 'var(--color-info-tint)' },
  warning: { line: 'var(--status-error)', fill: 'var(--color-error-tint)' },
  error: { line: 'var(--status-error)', fill: 'var(--color-error-tint)' },
  success: { line: 'var(--status-success)', fill: 'rgba(39, 199, 154, 0.1)' },
};

/**
 * InfoBanner — an inline callout. `info` takes the info-blue tint; `warning` and `error` share
 * the error-red one; `success` the green.
 */
export function InfoBanner({
  variant = 'info',
  children,
  /* §6 — everything reaches the banner, `role="alert"` and `aria-live` included. A banner is
     an announcement, and an announcement nothing can announce is decoration. */
  style,
  /* §24 — a banner reporting a *state* is drawn while the thing is true and removed when it
     stops being, and needs no control. One reporting an *event* — which nothing later makes
     untrue — has no way to leave, so it takes a dismiss. The control is `IconButton` (§10) at
     the banner's trailing edge. */
  onDismiss,
  dismissLabel = 'Dismiss',
  ...rest
}: InfoBannerProps) {
  const paint = variants[variant] || variants.info;
  return (
    <div
      {...rest}
      style={{
        padding: 6,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-l)',
        border: `1px solid ${paint.line}`,
        backgroundColor: paint.fill,
        gap: 6,
        flexWrap: 'nowrap',
        overflow: 'hidden',
        ...style,
      }}
    >
      <span style={{ display: 'flex', width: 16, height: 16, color: paint.line }}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="8" r="8" opacity="0.15" /><rect x="7.1" y="6.5" width="1.8" height="6" rx="0.9" /><rect x="7.1" y="3.5" width="1.8" height="1.8" rx="0.9" /></svg>
      </span>
      <span style={{ flex: 1, minWidth: 0, fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{children}</span>
      {onDismiss && (
        <IconButton label={dismissLabel} size={20} onClick={onDismiss} style={{ flexShrink: 0, color: paint.line }}>
          <CloseIcon width="10" height="10" />
        </IconButton>
      )}
    </div>
  );
}

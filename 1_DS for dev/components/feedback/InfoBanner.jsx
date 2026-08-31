import React from 'react';

/* Blue measured two banners, because prod has two. `info` and `warning` are those, unchanged —
   note that prod's `warning` paints with the *error* palette, which is why `error` below is the
   same treatment under the name that says what it is. `success` (§7) has no production
   precedent: its tint follows the 10%-of-status rule the other two tints already use
   (--color-info-tint is the info blue at 10%, --color-error-tint the error red at 10%), so the
   value is derived from blue's own palette rather than picked. */
const variants = {
  info: { line: 'var(--status-info)', fill: 'var(--color-info-tint)' },
  warning: { line: 'var(--status-error)', fill: 'var(--color-error-tint)' },
  error: { line: 'var(--status-error)', fill: 'var(--color-error-tint)' },
  success: { line: 'var(--status-success)', fill: 'rgba(39, 199, 154, 0.1)' },
};

/**
 * InfoBanner — inline callout recreated from components/shared/InfoBanner.
 * `info` uses the info-blue tint; `warning` reuses the error-red tint (as in source).
 */
export function InfoBanner({
  variant = 'info',
  children,
  /* §6 — blue forwards neither `style` nor rest props, so `role="alert"`, `aria-live` and
     `data-testid` never reached the DOM. Every banner in this app is an announcement. */
  style,
  ...rest
}) {
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
      <span style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{children}</span>
    </div>
  );
}

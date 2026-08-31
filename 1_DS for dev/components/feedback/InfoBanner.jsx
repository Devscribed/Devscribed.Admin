import React from 'react';

/**
 * InfoBanner — inline callout recreated from components/shared/InfoBanner.
 * `info` uses the info-blue tint; `warning` reuses the error-red tint (as in source).
 */
export function InfoBanner({ variant = 'info', children }) {
  const isInfo = variant === 'info';
  return (
    <div
      style={{
        padding: 6,
        display: 'flex',
        alignItems: 'center',
        borderRadius: 'var(--radius-l)',
        border: `1px solid ${isInfo ? 'var(--status-info)' : 'var(--status-error)'}`,
        backgroundColor: isInfo ? 'var(--color-info-tint)' : 'var(--color-error-tint)',
        gap: 6,
        flexWrap: 'nowrap',
        overflow: 'hidden',
      }}
    >
      <span style={{ display: 'flex', width: 16, height: 16, color: isInfo ? 'var(--status-info)' : 'var(--status-error)' }}>
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><circle cx="8" cy="8" r="8" opacity="0.15" /><rect x="7.1" y="6.5" width="1.8" height="6" rx="0.9" /><rect x="7.1" y="3.5" width="1.8" height="1.8" rx="0.9" /></svg>
      </span>
      <span style={{ fontFamily: 'var(--font-family-base)', fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>{children}</span>
    </div>
  );
}

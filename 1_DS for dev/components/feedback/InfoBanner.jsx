import React from 'react';

const tones = {
  info:    { border: 'var(--banner-info-border)',    bg: 'var(--banner-info-bg)',    ink: 'var(--banner-info-ink)' },
  warning: { border: 'var(--banner-warning-border)', bg: 'var(--banner-warning-bg)', ink: 'var(--banner-warning-ink)' },
  error:   { border: 'var(--banner-error-border)',   bg: 'var(--banner-error-bg)',   ink: 'var(--banner-error-ink)' },
  success: { border: 'var(--banner-success-border)', bg: 'var(--banner-success-bg)', ink: 'var(--banner-success-ink)' },
};

const InfoGlyph = ({ color }) => (
  <svg viewBox="0 0 16 16" width={18} height={18} fill={color} aria-hidden>
    <circle cx="8" cy="8" r="8" opacity="0.15" />
    <rect x="7.1" y="6.5" width="1.8" height="6" rx="0.9" />
    <rect x="7.1" y="3.5" width="1.8" height="1.8" rx="0.9" />
  </svg>
);

export function InfoBanner({ tone = 'info', icon, children, style, ...rest }) {
  const c = tones[tone] || tones.info;
  return (
    <div {...rest} style={{
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '12px 14px', borderRadius: 'var(--radius-lg)',
      border: `1px solid ${c.border}`, background: c.bg,
      fontFamily: 'var(--font-text)', fontSize: 'var(--fs-13)', color: 'var(--text-sub)',
      ...style,
    }}>
      <span style={{ display: 'flex', flexShrink: 0, color: c.ink }}>{icon || <InfoGlyph color={c.ink} />}</span>
      <span>{children}</span>
    </div>
  );
}

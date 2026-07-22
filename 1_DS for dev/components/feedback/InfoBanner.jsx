import React from 'react';

const tones = {
  info:    { border: 'oklch(0.85 0.06 292)', bg: 'oklch(0.97 0.02 292)', ink: 'var(--accent)' },
  warning: { border: 'oklch(0.82 0.09 74)',  bg: 'oklch(0.96 0.04 74)',  ink: 'var(--amber-800)' },
  error:   { border: 'oklch(0.8 0.1 25)',    bg: 'oklch(0.96 0.03 25)',  ink: 'var(--error-500)' },
  success: { border: 'oklch(0.8 0.08 160)',  bg: 'oklch(0.96 0.03 160)', ink: 'var(--success-700)' },
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

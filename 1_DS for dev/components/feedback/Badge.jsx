import React from 'react';

const tones = {
  active:   { bg: 'var(--status-active-bg)',   ink: 'var(--status-active-ink)',   dot: 'var(--status-active-dot)' },
  inactive: { bg: 'var(--status-inactive-bg)', ink: 'var(--status-inactive-ink)', dot: 'var(--status-inactive-dot)' },
  warning:  { bg: 'var(--amber-100)',           ink: 'var(--amber-800)',           dot: 'var(--amber-500)' },
  info:     { bg: 'var(--violet-200)',          ink: 'var(--accent)',              dot: 'var(--accent)' },
  neutral:  { bg: 'var(--paper-200)',           ink: 'var(--ink-500)',             dot: 'var(--ink-500)' },
};

export function Badge({ tone = 'neutral', dot = true, outline, children, style, ...rest }) {
  const c = tones[tone] || tones.neutral;
  const s = outline
    ? { border: `1.5px solid ${c.dot}`, color: c.ink, background: 'transparent' }
    : { background: c.bg, color: c.ink };
  return (
    <span {...rest} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      borderRadius: 'var(--radius-pill)', padding: '4px 12px',
      fontFamily: 'var(--font-text)', fontWeight: 600, fontSize: 'var(--fs-12)',
      ...s, ...style,
    }}>
      {dot && !outline && <span style={{ width: 6, height: 6, borderRadius: '50%', background: c.dot }} />}
      {children}
    </span>
  );
}

import React from 'react';

const base = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontFamily: 'var(--font-display)', fontWeight: 600,
  border: '1.5px solid transparent', cursor: 'pointer',
  transition: 'filter var(--duration-slow) var(--easing-standard),transform var(--duration-fast) var(--easing-standard)',
  whiteSpace: 'nowrap',
};

const sizes = {
  sm: { height: 'var(--field-h-sm)', padding: '0 15px', fontSize: 'var(--fs-13)', borderRadius: 'var(--radius-lg)' },
  md: { height: 'var(--field-h)', padding: '0 20px', fontSize: 'var(--fs-15)', borderRadius: 'var(--radius-lg)' },
  lg: { height: 'var(--field-h-lg)', padding: '0 22px', fontSize: 'var(--fs-15)', borderRadius: 'var(--radius-lg)' },
};

const variants = {
  primary: {
    background: 'var(--accent)', color: 'var(--on-accent)',
    borderColor: 'var(--accent)', boxShadow: 'var(--lip-accent)',
  },
  secondary: {
    background: 'var(--bg-panel)', color: 'var(--text-sub)',
    borderColor: 'var(--border-strong)', fontWeight: 500,
  },
  ghost: {
    background: 'transparent', color: 'var(--text-sub)',
    borderColor: 'transparent', fontWeight: 500,
  },
  danger: {
    background: 'var(--error-500)', color: '#fff',
    borderColor: 'var(--error-500)', boxShadow: 'var(--lip-error)',
  },
};

const Spinner = () => (
  <svg viewBox="0 0 16 16" width={15} height={15} fill="none" aria-hidden>
    <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="2" opacity="0.3" />
    <path d="M8 1.75A6.25 6.25 0 0 1 14.25 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.7s" repeatCount="indefinite" />
    </path>
  </svg>
);

export function Button({ variant = 'primary', size = 'md', disabled, loading, glow, style, children, ...rest }) {
  const s = { ...base, ...sizes[size], ...variants[variant] };
  if (glow && variant === 'primary') s.boxShadow = 'var(--lip-accent),var(--glow-accent-dark)';
  if (loading) { s.boxShadow = 'none'; s.cursor = 'progress'; }
  if (disabled) { s.opacity = 0.55; s.cursor = 'not-allowed'; }
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} style={{ ...s, ...style }}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

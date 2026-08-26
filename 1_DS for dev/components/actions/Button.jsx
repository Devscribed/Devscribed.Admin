import React from 'react';
import { Spinner } from '../feedback/Spinner.jsx';

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

export function Button({ as: Tag = 'button', variant = 'primary', size = 'md', disabled, loading, glow, style, children, ...rest }) {
  const s = { ...base, ...sizes[size], ...variants[variant] };
  if (glow && variant === 'primary') s.boxShadow = 'var(--lip-accent),var(--glow-accent-dark)';
  if (loading) { s.boxShadow = 'none'; s.cursor = 'progress'; }
  if (disabled) {
    s.cursor = 'not-allowed';
    // A filled button loses its fill and its lip rather than fading: a 55%-opacity
    // violet still reads as the primary action, which is the one thing a disabled
    // CTA must not do.
    if (variant === 'primary' || variant === 'danger') {
      s.background = 'var(--bg-sunken)';
      s.color = 'var(--text-faint)';
      s.borderColor = 'var(--border)';
      s.boxShadow = 'none';
    } else {
      s.opacity = 0.55;
    }
  }
  // Rendered as an anchor when the action is a navigation — a CV download, an export.
  // `disabled` has no meaning on an <a>, so it becomes `aria-disabled` plus removal
  // from the tab order rather than an attribute a browser would silently ignore.
  const link = Tag !== 'button';
  const stateProps = link
    ? {
        'aria-disabled': disabled || loading || undefined,
        ...(disabled || loading ? { tabIndex: -1 } : {}),
      }
    : { disabled: disabled || loading };

  return (
    <Tag
      {...rest}
      {...stateProps}
      aria-busy={loading || undefined}
      style={{ ...s, ...(link ? { textDecoration: 'none' } : null), ...style }}
    >
      {loading && <Spinner />}
      {children}
    </Tag>
  );
}

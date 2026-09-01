import React, { useEffect } from 'react';
import { Spinner } from '../feedback/Spinner.jsx';

const base = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  fontFamily: 'var(--font-display)', fontWeight: 600,
  border: '1.5px solid transparent', cursor: 'pointer',
  transition: 'background-color var(--duration-fast) var(--easing-standard),border-color var(--duration-fast) var(--easing-standard),color var(--duration-fast) var(--easing-standard),box-shadow var(--duration-fast) var(--easing-standard),filter var(--duration-slow) var(--easing-standard)',
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

// Hover / active / focus-visible states live in a native <style> tag on the
// same page rather than in `useState + onMouseEnter/Leave`, because the JS
// approach leaves a button stuck in its hover look whenever pointer-leave is
// swallowed by an overlay opening on click — the modal covers the button,
// mouseleave never fires, and the caller sees "the colour never came back."
// Native `:hover` is driven by the browser and always resolves cleanly.
//
// Palette choice: `secondary` / `ghost` gain a soft accent tint that reads as
// "this button lit up" without leaving the Meridian violet ramp; `primary`
// steps down its lightness ramp to `--accent-hover` and picks up a light
// accent-tinted drop shadow; `danger` mirrors that with the red ramp.
const HOVER_STYLE_ID = 'ds-button-hover-styles';
const HOVER_CSS = `
  button[data-ds-btn][data-ds-btn-variant="secondary"]:not(:disabled):hover,
  button[data-ds-btn][data-ds-btn-variant="ghost"]:not(:disabled):hover {
    background: var(--accent-soft) !important;
    color: var(--accent) !important;
    border-color: var(--accent-border) !important;
  }
  button[data-ds-btn][data-ds-btn-variant="primary"]:not(:disabled):hover {
    background: var(--accent-hover, var(--accent)) !important;
    border-color: var(--accent-hover, var(--accent)) !important;
    box-shadow: var(--lip-accent), 0 4px 12px oklch(from var(--accent) l c h / 0.25) !important;
  }
  button[data-ds-btn][data-ds-btn-variant="danger"]:not(:disabled):hover {
    filter: brightness(0.94);
    box-shadow: var(--lip-error), 0 4px 12px oklch(from var(--error-500) l c h / 0.28) !important;
  }
  button[data-ds-btn]:not(:disabled):active {
    filter: brightness(0.92);
  }
  button[data-ds-btn]:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
`;

function ensureHoverStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(HOVER_STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = HOVER_STYLE_ID;
  el.textContent = HOVER_CSS;
  document.head.appendChild(el);
}

export function Button({ variant = 'primary', size = 'md', disabled, loading, glow, style, children, ...rest }) {
  useEffect(ensureHoverStyles, []);
  const s = { ...base, ...sizes[size], ...variants[variant] };
  if (glow && variant === 'primary') s.boxShadow = 'var(--lip-accent),var(--glow-accent-dark)';
  if (loading) { s.boxShadow = 'none'; s.cursor = 'progress'; }
  if (disabled) { s.opacity = 0.55; s.cursor = 'not-allowed'; }
  return (
    <button
      {...rest}
      data-ds-btn=""
      data-ds-btn-variant={variant}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      style={{ ...s, ...style }}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

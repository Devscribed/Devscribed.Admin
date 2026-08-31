import React from 'react';
import { ArrowIcon } from '../icons/Icon.jsx';

/**
 * BackTo — recreated from components/shared/BackTo (back-link above detail pages):
 * 16px medium black label, blue on hover, 20px bottom spacing.
 */
export function BackTo({ label = 'Back', onClick }) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      href="#"
      onClick={(e) => { e.preventDefault(); onClick && onClick(); }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '6px 12px 6px 0', marginBottom: 20, fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-medium)', fontSize: 16, color: hover ? 'var(--color-blue)' : 'var(--text-primary)', cursor: 'pointer' }}
    >
      <span style={{ display: 'flex', transform: 'rotate(-90deg)', width: 10 }}><ArrowIcon /></span>
      {label}
    </a>
  );
}

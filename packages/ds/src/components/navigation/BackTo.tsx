import React from 'react';
import { ArrowIcon } from '../icons/Icon';

export interface BackToProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  label?: string;
  /** §56 — a real destination. Given one, the anchor behaves like an anchor. */
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * BackTo — the back-link above a detail page: a 16px medium label turning blue on hover, with
 * 20px of clearance under it.
 *
 * §56 — **give it an `href`.** This really is a link: it has exactly one destination, and it is
 * the page the reader came from. With one, the anchor is left alone, so middle-click, "copy
 * link address" and open-in-new-tab all work, and the caller's `onClick` still receives the
 * event — an unmodified click can be handed to a client router, which is the `rowHref` /
 * `onRowClick` pair `Table` already uses (§18). Without one it falls back to `href="#"` with
 * the default prevented, which is a button wearing a link's clothes.
 */
export function BackTo({ label = 'Back', href, onClick, style, ...rest }: BackToProps) {
  const [hover, setHover] = React.useState(false);
  return (
    <a
      {...rest}
      href={href || '#'}
      onClick={(e) => {
        // A real destination stays the browser's to resolve unless the caller takes it.
        if (!href) e.preventDefault();
        if (onClick) onClick(e);
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ /* @literal 3px, below the scale: a chevron sits closer to its word than two words do */ display: 'inline-flex', alignItems: 'center', gap: 3, padding: 'var(--space-2) var(--space-5) var(--space-2) 0', marginBottom: 'var(--space-7)', fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-base)', color: hover ? 'var(--color-blue)' : 'var(--text-primary)', cursor: 'pointer', ...style }}
    >
      <span style={{ display: 'flex', transform: 'rotate(-90deg)', width: 10 }}><ArrowIcon /></span>
      {label}
    </a>
  );
}

import React from 'react';
import { ArrowIcon } from '../icons/Icon';

export interface BackToProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  label?: string;
  /** §56 — a real destination. Given one, the anchor behaves like an anchor. */
  href?: string;
  onClick?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * BackTo — recreated from components/shared/BackTo (back-link above detail pages):
 * 16px medium black label, blue on hover, 20px bottom spacing.
 *
 * §56 — `href` and `...rest`. Prod's version is an `<a href="#">` with an `onClick`, which
 * is the same defect §45 found in `PageTabs`' tabs, except that this one really is a link:
 * it has exactly one destination and it is the page the reader came from. Given an `href`
 * the anchor is left alone — middle-click, "copy link address" and open-in-new-tab all
 * work — and the caller's `onClick` receives the event, so an unmodified click can be
 * handed to a client router the way `Table`'s `rowHref`/`onRowClick` pair already is
 * (§18). Without one, blue's own behaviour is unchanged.
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
      style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '6px 12px 6px 0', marginBottom: 20, fontFamily: 'var(--font-family-base)', fontWeight: 'var(--font-weight-medium)', fontSize: 16, color: hover ? 'var(--color-blue)' : 'var(--text-primary)', cursor: 'pointer', ...style }}
    >
      <span style={{ display: 'flex', transform: 'rotate(-90deg)', width: 10 }}><ArrowIcon /></span>
      {label}
    </a>
  );
}

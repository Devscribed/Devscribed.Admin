import * as React from 'react';

export interface NavItemProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  icon?: React.ReactNode;
  label: React.ReactNode;
  active?: boolean;
  /** Trailing pill badge (e.g. pending count). */
  badge?: string | number;
  /** `'open'` or `'closed'` if this is a collapsible section header. */
  arrow?: 'open' | 'closed';
}

/** Sidebar nav row — icon + label + optional badge or disclosure arrow. */
export declare function NavItem(props: NavItemProps): JSX.Element;

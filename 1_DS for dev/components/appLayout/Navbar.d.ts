import * as React from 'react';

export interface NavbarProps extends React.HTMLAttributes<HTMLElement> {
  trackerCounter?: string;
  onOpenTracker?: () => void;
  /** Draws the mini tracker. False in a product with no timesheets. Default true. */
  tracker?: boolean;
  /** Opens the navigation drawer below the breakpoint; draws the hamburger when given. */
  onMenuClick?: () => void;
  /** Replaces the default `AccountMenu`. */
  account?: React.ReactNode;
  userName?: string;
  onAccountNavigate?: (item: string) => void;
  /** Optional content between the tracker and the account menu. */
  children?: React.ReactNode;
}

export function Navbar(props: NavbarProps): JSX.Element;

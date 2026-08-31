import * as React from 'react';

export interface NavbarProps {
  trackerCounter?: string;
  onOpenTracker?: () => void;
  userName?: string;
  onAccountNavigate?: (item: string) => void;
  /** Optional content between the tracker and the account menu. */
  children?: React.ReactNode;
}

export function Navbar(props: NavbarProps): JSX.Element;

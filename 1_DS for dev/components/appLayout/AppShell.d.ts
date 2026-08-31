import * as React from 'react';

export interface AppShellProps {
  /** Active sidebar section title. */
  section?: string;
  /** Active sidebar sub-item title. */
  sub?: string | null;
  onSelect?: (section: string, sub?: string) => void;
  onLogoClick?: () => void;
  trackerCounter?: string;
  onOpenTracker?: () => void;
  userName?: string;
  onAccountNavigate?: (item: string) => void;
  /** Replaces the default Navbar; pass null for no top bar. */
  navbar?: React.ReactNode;
  children?: React.ReactNode;
}

export function AppShell(props: AppShellProps): JSX.Element;

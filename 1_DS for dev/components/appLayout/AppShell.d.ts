import * as React from 'react';

export interface AppShellProps extends React.HTMLAttributes<HTMLDivElement> {
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
  /** Replaces the default `Sidebar` — pass one carrying this product's own `items`. */
  sidebar?: React.ReactNode;
  /** Replaces the default Navbar; pass null for no top bar. */
  navbar?: React.ReactNode;
  /**
   * Below `--layout-breakpoint-desktop` the rail is a drawer; this opens it. It has no effect
   * above the breakpoint, where the rail is always in view.
   */
  menuOpen?: boolean;
  /** Scrim click and the sidebar's own close button. */
  onMenuClose?: () => void;
  children?: React.ReactNode;
}

export function AppShell(props: AppShellProps): JSX.Element;

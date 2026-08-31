import { HTMLAttributes, ReactNode } from 'react';

export interface InfoBannerProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `info` and `warning` are blue's own two, unchanged — prod's `warning` paints red, with the
   * error palette. `error` (§7) is that same treatment under the name that says so, and
   * `success` (§7) is green, which prod has no banner for.
   */
  variant?: 'info' | 'warning' | 'error' | 'success';
  /**
   * §24 — draws a trailing close button. Prod has none: its banners report a state and go away
   * when the state does. One reporting an event that already happened cannot.
   */
  onDismiss?: () => void;
  /** Accessible name for that button. Defaults to `Dismiss`. */
  dismissLabel?: string;
  children: ReactNode;
}

export function InfoBanner(props: InfoBannerProps): JSX.Element;

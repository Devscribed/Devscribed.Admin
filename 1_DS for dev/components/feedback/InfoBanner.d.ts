import { HTMLAttributes, ReactNode } from 'react';

export interface InfoBannerProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * `info` and `warning` are blue's own two, unchanged — prod's `warning` paints red, with the
   * error palette. `error` (§7) is that same treatment under the name that says so, and
   * `success` (§7) is green, which prod has no banner for.
   */
  variant?: 'info' | 'warning' | 'error' | 'success';
  children: ReactNode;
}

export function InfoBanner(props: InfoBannerProps): JSX.Element;

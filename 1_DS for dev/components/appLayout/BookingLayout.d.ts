import { HTMLAttributes, ReactNode } from 'react';

export interface BookingLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * The organization's name, drawn above the column at the headline-4 step. A node when a
   * caller needs one — unlike `AuthLayout`, this shell does not own the mark it draws.
   */
  wordmark?: ReactNode;
  /** §46 — test id for that node. The shell draws it, so only the shell can tag it. */
  wordmarkTestId?: string;
  children?: ReactNode;
}

export function BookingLayout(props: BookingLayoutProps): JSX.Element;

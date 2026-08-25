import * as React from 'react';

export interface BookingLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Overrides the default type wordmark — an organization's name, not a logo file. */
  wordmark?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * The public shell: warm paper field, a wordmark, and one centred 880px column with no
 * card of its own. `AuthLayout`'s single 480px card is too narrow for a calendar beside
 * a slot list, and the app shell's sidebar has no meaning to a visitor with no session.
 */
export declare function BookingLayout(props: BookingLayoutProps): JSX.Element;

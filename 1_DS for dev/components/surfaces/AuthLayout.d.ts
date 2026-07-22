import * as React from 'react';

export interface AuthLayoutProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Grotesk 22px heading inside the card. */
  title?: React.ReactNode;
  /** One quiet line under the title. */
  subtitle?: React.ReactNode;
  /** Sits below the card, outside it — the "Already have an account?" line. */
  footer?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * The unauthenticated shell: warm paper field, wordmark, one centred 480px card.
 * No sidebar, no top bar — signup, login, forgot- and reset-password all sit in it.
 * @startingPoint section="Surfaces" subtitle="Signed-out shell" viewport="700x560"
 */
export declare function AuthLayout(props: AuthLayoutProps): JSX.Element;

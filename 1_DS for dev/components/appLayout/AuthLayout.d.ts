import { HTMLAttributes, ReactNode } from 'react';

export interface AuthLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Card heading, rendered as the page's `<h1>` at the headline-5 step. */
  title?: string;
  /** One line under the title. */
  subtitle?: string;
  /** Cross-account link, drawn under the card rather than inside it. */
  footer?: ReactNode;
  children?: ReactNode;
}

export function AuthLayout(props: AuthLayoutProps): JSX.Element;

import { HTMLAttributes, ReactNode } from 'react';

export interface PageTitleProps extends HTMLAttributes<HTMLHeadingElement> {
  title?: string;
  /** Wins over `title` when both are given — for a heading with tagged content inside it. */
  children?: ReactNode;
}

export function PageTitle(props: PageTitleProps): JSX.Element;

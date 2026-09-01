import type { AnchorHTMLAttributes, MouseEvent } from 'react';

export interface BackToProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'onClick'> {
  label?: string;
  /** §56 — a real destination. Given one, the anchor behaves like an anchor. */
  href?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}

export function BackTo(props: BackToProps): JSX.Element;

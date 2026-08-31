import { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  status?: 'active' | 'inactive';
  /** Border-only treatment instead of the solid fill. */
  outlined?: boolean;
  /** §19 — every other attribute reaches the `<span>`; `style` merges over the painted one. */
  children?: ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;

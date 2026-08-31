import { ReactNode } from 'react';
export interface BadgeProps {
  status?: 'active' | 'inactive';
  /** Border-only treatment instead of the solid fill. */
  outlined?: boolean;
  children?: ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;

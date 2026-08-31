import { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * `active` / `inactive` are prod's own two, measured from `ActivityBadge`. §32 adds `info`
   * (cyan) and `warning` (yellow) from blue's status palette, for state a two-valued flag cannot
   * express — see `03-candidate-database.design.md` for the mapping that needed them.
   */
  status?: 'active' | 'inactive' | 'info' | 'warning';
  /** Border-only treatment instead of the solid fill. */
  outlined?: boolean;
  /** §19 — every other attribute reaches the `<span>`; `style` merges over the painted one. */
  children?: ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;

import { HTMLAttributes, ReactNode } from 'react';

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /**
   * `active` / `inactive` are prod's own two, measured from `ActivityBadge`. §32 adds `info`
   * (cyan) and `warning` (yellow) from blue's status palette, for state a two-valued flag cannot
   * express — see `03-candidate-database.design.md` for the mapping that needed them.
   *
   * §59 adds `neutral`, which is the one tone that is *not* a status: a label on an object —
   * a category, an assessed criterion, an interview length — drawn on the recessed ground blue
   * puts behind a table header, with no status hue claiming anything about it.
   */
  status?: 'active' | 'inactive' | 'info' | 'warning' | 'neutral';
  /** Border-only treatment instead of the solid fill. */
  outlined?: boolean;
  /**
   * §59 — `m` is blue's measured box (14px, `4px 8px`); `s` steps one down the type scale for a
   * label sitting inside a table row (12px, `2px 8px`).
   */
  size?: 's' | 'm';
  /** §19 — every other attribute reaches the `<span>`; `style` merges over the painted one. */
  children?: ReactNode;
}

export function Badge(props: BadgeProps): JSX.Element;

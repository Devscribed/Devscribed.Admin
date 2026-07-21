import * as React from 'react';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Semantic tone. Use `active`/`inactive` for member/project status. */
  tone?: 'active' | 'inactive' | 'warning' | 'info' | 'neutral';
  /** Show the 6px status dot. Defaults to true. Ignored when `outline`. */
  dot?: boolean;
  /** Outlined variant — transparent background, colored border + text. */
  outline?: boolean;
  children?: React.ReactNode;
}

/**
 * Status pill — rounded 20px, dot marker on the left. Meridian never uses solid
 * fill status chips; always the soft tint + dot pattern.
 */
export declare function Badge(props: BadgeProps): JSX.Element;

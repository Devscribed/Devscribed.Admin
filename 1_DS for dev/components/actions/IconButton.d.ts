import * as React from 'react';

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'size'> {
  /** Accessible name — required, since the button carries only a glyph. */
  label: string;
  /** Square edge in px. 34 fits inside a 46px field; 38 stands alone in a toolbar. */
  size?: number;
  /** Tints the glyph violet — for toggles that are currently "on". */
  active?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * Borderless square button for a single glyph. Uses the universal Meridian
 * hover tint; sits inside `Input trailing` for password toggles and clear buttons.
 * @startingPoint section="Actions" subtitle="Glyph-only button" viewport="700x140"
 */
export declare function IconButton(props: IconButtonProps): JSX.Element;

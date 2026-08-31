import { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Accessible name — the button draws only a glyph, so this is the only name it has. */
  label: string;
  /** Hit area in px. The glyph inside keeps its own size. Default 34. */
  size?: number;
  /** Paints the glyph with the primary blue, as blue does for any control reading as current. */
  active?: boolean;
  disabled?: boolean;
  children?: ReactNode;
  type?: 'button' | 'submit';
  ref?: Ref<HTMLButtonElement>;
}

export function IconButton(props: IconButtonProps): JSX.Element;

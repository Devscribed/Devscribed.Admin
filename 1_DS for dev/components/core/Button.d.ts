import { ReactNode } from 'react';
/**
 * @startingPoint section="Core" subtitle="Primary, neutral and delete buttons" viewport="700x200"
 */
export interface ButtonProps {
  /** Visual style. Omit for the default outlined neutral button. */
  variant?: 'primary' | 'delete';
  /** Optional leading icon element. */
  icon?: ReactNode;
  /** Shows a spinning loader in place of the icon slot. */
  preloader?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
}

export function Button(props: ButtonProps): JSX.Element;

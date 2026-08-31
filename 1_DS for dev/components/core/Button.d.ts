import { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
/**
 * @startingPoint section="Core" subtitle="Primary, neutral and delete buttons" viewport="700x200"
 */
export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  /** Visual style. Omit for the default outlined neutral button. */
  variant?: 'primary' | 'delete';
  /** Optional leading icon element. */
  icon?: ReactNode;
  /** Shows a spinning loader in place of the icon slot. Does not disable the button. */
  preloader?: boolean;
  disabled?: boolean;
  children: ReactNode;
  type?: 'button' | 'submit';
  /** §2 — every other attribute reaches the `<button>`; `style` merges over the painted one. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button(props: ButtonProps): JSX.Element;

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
  /** §38 — the element to render. `a` keeps the paint and gives up `type` and `disabled`, which
   *  an anchor does not have; a `disabled` anchor still paints disabled and gets `aria-disabled`.
   *  Use it for a control that navigates or downloads, so the browser's own handling survives. */
  as?: 'button' | 'a';
  /** §38 — anchor attributes, meaningful only with `as="a"`. */
  href?: string;
  download?: string | boolean;
  target?: string;
  rel?: string;
  /** §2 — every other attribute reaches the element; `style` merges over the painted one. */
  ref?: Ref<HTMLButtonElement | HTMLAnchorElement>;
}

export function Button(props: ButtonProps): JSX.Element;

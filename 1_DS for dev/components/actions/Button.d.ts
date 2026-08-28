import * as React from 'react';

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'href'> {
  /**
   * Element to render. `'a'` makes the button a real link — for an action that is a
   * navigation, such as a file download, where a `<button>` with an onClick would lose
   * middle-click, copy-address and the browser's own download handling. `disabled`
   * becomes `aria-disabled` and drops the tab stop, since an `<a>` has no disabled state.
   */
  as?: 'button' | 'a';
  /** Only with `as="a"`. */
  href?: string;
  /** Only with `as="a"`. */
  download?: boolean | string;
  /** Only with `as="a"`. */
  target?: string;
  /** Only with `as="a"`. */
  rel?: string;
  /** Visual role. `primary` is the violet action; `danger` is red-lipped destructive. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `md` (44px) is the default across the app. */
  size?: 'sm' | 'md' | 'lg';
  /** Adds an outer glow — reserved for the primary CTA on dark surfaces. */
  glow?: boolean;
  /** Shows a leading spinner, drops the lip, and blocks the click. Use for in-flight submits. */
  loading?: boolean;
  /** Filled variants drop to a sunken field with faint ink; outlined ones dim. */
  disabled?: boolean;
  /**
   * Declared because React 19 passes `ref` through as an ordinary prop, and this
   * component spreads its rest onto the element it renders. Callers that need the node
   * — a dialog naming its initial focus, for one — get it without a `forwardRef` wrapper.
   */
  ref?: React.Ref<HTMLButtonElement> | React.Ref<HTMLAnchorElement>;
  children?: React.ReactNode;
}

/**
 * The Meridian button. Primary carries a 2px violet lip that shrinks to 1px on
 * :active for a tactile press; secondary is a paper-neutral field. Danger uses
 * the same lip pattern in error red.
 * @startingPoint section="Actions" subtitle="Primary CTA, secondary, danger" viewport="700x220"
 */
export declare function Button(props: ButtonProps): JSX.Element;

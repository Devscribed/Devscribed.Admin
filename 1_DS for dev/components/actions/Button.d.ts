import * as React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual role. `primary` is the violet action; `danger` is red-lipped destructive. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  /** `md` (44px) is the default across the app. */
  size?: 'sm' | 'md' | 'lg';
  /** Adds an outer glow — reserved for the primary CTA on dark surfaces. */
  glow?: boolean;
  /** Shows a leading spinner, drops the lip, and blocks the click. Use for in-flight submits. */
  loading?: boolean;
  disabled?: boolean;
  children?: React.ReactNode;
}

/**
 * The Meridian button. Primary carries a 2px violet lip that shrinks to 1px on
 * :active for a tactile press; secondary is a paper-neutral field. Danger uses
 * the same lip pattern in error red.
 * @startingPoint section="Actions" subtitle="Primary CTA, secondary, danger" viewport="700x220"
 */
export declare function Button(props: ButtonProps): JSX.Element;

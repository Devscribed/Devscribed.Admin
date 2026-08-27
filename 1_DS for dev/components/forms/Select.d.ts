import * as React from 'react';

export type SelectOption = string | { value: string; label: React.ReactNode };

export interface SelectProps {
  label?: React.ReactNode;
  value?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  /** Native tooltip on the trigger button — `Select.jsx` already forwards unknown
   * props (including this) onto the button via `...rest`; this type only catches up
   * to that. Used by spec 05's role picker for the zero-admin-guard explanation. */
  title?: string;
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}

/** Custom select — matches Input geometry, opens a popover styled like a menu. */
export declare function Select(props: SelectProps): JSX.Element;

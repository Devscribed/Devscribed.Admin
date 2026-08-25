import * as React from 'react';

export type SelectOption =
  | string
  | {
      value: string;
      label: React.ReactNode;
      /** Shown but not selectable — a missing entry reads as a bug, a disabled one explains itself. */
      disabled?: boolean;
      /** Trailing note, typically the reason the option is disabled. Part of its accessible name. */
      hint?: React.ReactNode;
      /** `data-testid` on the option row — options are otherwise addressable only by text. */
      testId?: string;
    };

export interface SelectProps {
  label?: React.ReactNode;
  value?: string;
  options: SelectOption[];
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}

/** Custom select — matches Input geometry, opens a popover styled like a menu. */
export declare function Select(props: SelectProps): JSX.Element;

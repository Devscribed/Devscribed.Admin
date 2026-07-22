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
  style?: React.CSSProperties;
  wrapperStyle?: React.CSSProperties;
}

/** Custom select — matches Input geometry, opens a popover styled like a menu. */
export declare function Select(props: SelectProps): JSX.Element;

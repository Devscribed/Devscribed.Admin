import * as React from 'react';

export interface RadioProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  name?: string;
  value?: string;
  style?: React.CSSProperties;
}

export type RadioOption = string | { value: string; label?: React.ReactNode; disabled?: boolean };

export interface RadioGroupProps {
  value?: string;
  onChange?: (value: string) => void;
  options?: RadioOption[];
  name?: string;
  /** 'column' (default) stacks vertically; 'row' lays out inline. */
  direction?: 'column' | 'row';
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Meridian radio — 20px circle that fills with a thick violet ring when selected. */
export declare function Radio(props: RadioProps): JSX.Element;

/** Group of Meridian radios bound to one value. */
export declare function RadioGroup(props: RadioGroupProps): JSX.Element;

import * as React from 'react';

export interface CheckboxProps {
  checked?: boolean;
  onChange?: (checked: boolean) => void;
  label?: React.ReactNode;
  disabled?: boolean;
  style?: React.CSSProperties;
}

/** Meridian checkbox — 20px violet-filled square with a white stroke check. */
export declare function Checkbox(props: CheckboxProps): JSX.Element;

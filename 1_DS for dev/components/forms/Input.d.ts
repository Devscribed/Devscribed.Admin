import * as React from 'react';

export interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Micro-label above the field. Grotesk 11px uppercase, wider tracking. */
  label?: React.ReactNode;
  /** Renders red border + 3px error ring + message underneath. */
  error?: string;
  /** Helper text — muted, replaced by `error` when set. */
  hint?: string;
  wrapperStyle?: React.CSSProperties;
}

/** Text input with the Meridian's 46px height, 10px radius, 3px focus ring. */
export declare function Input(props: InputProps): JSX.Element;

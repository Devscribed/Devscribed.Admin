import * as React from 'react';

export interface TextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'rows'> {
  /** Micro-label above the field. Grotesk 11px uppercase, wider tracking. */
  label?: React.ReactNode;
  /** Renders red border + 3px error ring + message underneath. */
  error?: string;
  /** Helper text — muted, replaced by `error` when set. */
  hint?: string;
  /** Visible lines. Defaults to 4; the field is still user-resizable vertically. */
  rows?: number;
  wrapperStyle?: React.CSSProperties;
}

/**
 * Multi-line counterpart to `Input`, with the same label / hint / error contract.
 * `Input` extends `InputHTMLAttributes<HTMLInputElement>` and is single-line by
 * construction, which is why this is a separate component rather than a prop.
 */
export declare function Textarea(props: TextareaProps): JSX.Element;

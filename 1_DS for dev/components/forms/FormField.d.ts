import * as React from 'react';

export const fieldLabelStyle: React.CSSProperties;

export interface FieldLabelProps {
  htmlFor?: string;
  /** §64 — appends the `aria-hidden` asterisk. The requirement itself is the control's. */
  required?: boolean;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function FieldLabel(props: FieldLabelProps): JSX.Element | null;

/** §64 — the asterisk on its own, for a label a screen draws itself. Always `aria-hidden`. */
export function RequiredMark(): JSX.Element;

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  required?: boolean;
  width?: number | string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function FormField(props: FormFieldProps): JSX.Element;

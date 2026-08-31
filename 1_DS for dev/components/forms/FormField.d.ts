import * as React from 'react';

export const fieldLabelStyle: React.CSSProperties;

export interface FieldLabelProps {
  htmlFor?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function FieldLabel(props: FieldLabelProps): JSX.Element | null;

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  width?: number | string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export function FormField(props: FormFieldProps): JSX.Element;

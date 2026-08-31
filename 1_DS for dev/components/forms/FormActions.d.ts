import * as React from 'react';

export interface FormActionsProps {
  children?: React.ReactNode;
  /** Destructive action pinned to the left (switches the row to full width). */
  leading?: React.ReactNode;
  /** Cap for the right-aligned row. Default 240. */
  maxWidth?: number;
  align?: 'right' | 'left' | 'full';
  gap?: number;
}

export function FormActions(props: FormActionsProps): JSX.Element;

import * as React from 'react';

export interface ToastProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: 'success' | 'error' | 'info';
  /** Milliseconds before `onDismiss` fires. Pass 0 to keep it until dismissed. */
  duration?: number;
  onDismiss?: () => void;
  children?: React.ReactNode;
}

/**
 * Transient confirmation, pinned to the bottom of the viewport. `role="status"` and
 * polite: it never steals focus, because it always reports something the visitor has
 * already done.
 */
export declare function Toast(props: ToastProps): JSX.Element;

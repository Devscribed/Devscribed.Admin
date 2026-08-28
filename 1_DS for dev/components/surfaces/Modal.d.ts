import * as React from 'react';

export interface ModalProps extends React.HTMLAttributes<HTMLDivElement> {
  open?: boolean;
  title: React.ReactNode;
  onClose?: () => void;
  /** Action buttons rendered as a footer row. */
  actions?: React.ReactNode;
  /** Body max-width in px. Defaults to 420. */
  width?: number;
  /**
   * Focused when the dialog opens. Defaults to the first focusable element in the
   * panel. Point it at the dismissive control on a destructive dialog — the action
   * that cannot be undone is never the one `Enter` reaches on arrival.
   */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * Dialog shell — 14px radius, heavier brown-cast shadow, ink-tinted scrim. Anything
 * beyond the named props is spread onto the dialog panel, matching `Card` and
 * `AuthLayout`.
 *
 * A real dialog: `role="dialog"`, `aria-modal`, `Escape` closes it, focus is trapped
 * while it is open and returned to the invoking control on close. That behaviour lives
 * here so two dialogs in one product cannot diverge.
 */
export declare function Modal(props: ModalProps): JSX.Element;

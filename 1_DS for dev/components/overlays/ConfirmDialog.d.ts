import { HTMLAttributes, ReactNode, RefObject } from 'react';

export interface ConfirmDialogProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  title: string;
  description?: ReactNode;
  acceptBtnText: string;
  declineBtnText: string;
  onClose: () => void;
  onAccept: () => void;
  transparentOverlay?: boolean;
  /** §40 — `data-testid` for the two buttons, which the component draws itself. */
  acceptTestId?: string;
  declineTestId?: string;
  /**
   * §40 — what to focus when the dialog opens. Defaults to the first focusable element in the
   * panel. Focus is trapped while open and returned to the opener on close, and `Escape` closes.
   * The same treatment §8 gave `Modal`, from the same implementation.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /** §41 — a request is in flight: the accept button spins, and nothing here can be pressed. */
  busy?: boolean;
  /**
   * §41 — whether pressing accept also closes. Blue always does, because prod's confirmations
   * start work nobody waits on. Pass `false` when the caller closes it on the result instead.
   */
  closeOnAccept?: boolean;
  /** §40 — every other attribute reaches the panel; `style` merges over the painted one. */
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null;

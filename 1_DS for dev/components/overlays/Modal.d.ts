import { HTMLAttributes, ReactNode, RefObject } from 'react';

export interface ModalProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * §8 — what to focus when the dialog opens. Defaults to the first focusable element in the
   * panel. Focus is trapped while open and returned to the opener on close, and `Escape` closes.
   */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

export function Modal(props: ModalProps): JSX.Element | null;

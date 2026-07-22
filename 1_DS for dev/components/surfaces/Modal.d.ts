import * as React from 'react';

export interface ModalProps {
  open?: boolean;
  title: React.ReactNode;
  onClose?: () => void;
  /** Action buttons rendered as a footer row. */
  actions?: React.ReactNode;
  /** Body max-width in px. Defaults to 420. */
  width?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}

/** Dialog shell — 14px radius, heavier brown-cast shadow, ink-tinted scrim. */
export declare function Modal(props: ModalProps): JSX.Element;

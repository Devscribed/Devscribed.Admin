import { ReactNode } from 'react';
export interface ModalProps {
  title: string;
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function Modal(props: ModalProps): JSX.Element | null;

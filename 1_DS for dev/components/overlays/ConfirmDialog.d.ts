import { ReactNode } from 'react';
export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  acceptBtnText: string;
  declineBtnText: string;
  onClose: () => void;
  onAccept: () => void;
  transparentOverlay?: boolean;
}

export function ConfirmDialog(props: ConfirmDialogProps): JSX.Element | null;

import { ReactNode } from 'react';
export interface MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}

export function MenuDrawer(props: MenuDrawerProps): JSX.Element;

import { HTMLAttributes, ReactNode } from 'react';

export interface MenuDrawerProps extends HTMLAttributes<HTMLDivElement> {
  open: boolean;
  onClose: () => void;
  /**
   * §51 — where the panel and its scrim start. Defaults to the shell's navbar height,
   * which switches with the shell's own breakpoint; pass a value only for a host whose
   * header is not that navbar.
   */
  top?: number | string;
  /** §51 — accessible name for the close button, which the component draws itself. */
  closeLabel?: string;
  /** §51 — `data-testid` for that button, for the same reason. */
  closeTestId?: string;
  children: ReactNode;
  /** §51 — every other attribute reaches the panel; `style` merges over the painted one. */
}

export function MenuDrawer(props: MenuDrawerProps): JSX.Element;

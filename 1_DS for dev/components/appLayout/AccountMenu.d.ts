import { ButtonHTMLAttributes } from 'react';

export interface AccountMenuItem {
  label: string;
  testId?: string;
  /** Runs instead of `onNavigate` for this entry. */
  onSelect?: () => void;
}

/** Rest props land on the trigger button — it is the control, and what a test reaches for. */
export interface AccountMenuProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  name?: string;
  /** Menu entries; defaults to My account / My organization / Log out. */
  items?: (string | AccountMenuItem)[];
  onNavigate?: (item: string) => void;
  /** `data-testid` for the name, which is drawn inside the trigger. */
  nameTestId?: string;
  /** `data-testid` for the open menu. */
  menuTestId?: string;
}

export function AccountMenu(props: AccountMenuProps): JSX.Element;

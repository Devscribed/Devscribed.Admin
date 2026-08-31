export interface AccountMenuProps {
  name?: string;
  /** Menu entries; defaults to My account / My organization / Log out. */
  items?: string[];
  onNavigate?: (item: string) => void;
}

export function AccountMenu(props: AccountMenuProps): JSX.Element;

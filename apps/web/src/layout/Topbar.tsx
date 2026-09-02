'use client';

import { useRouter } from 'next/navigation';
import { AccountMenu, Navbar } from '@devscribed/ds';
import { useSession } from './session-context';

/**
 * Blue's `Navbar` without its mini tracker: timesheets belong to a product surface no spec
 * covers. What is left is the account menu and, below the breakpoint, the drawer's hamburger.
 * The theme toggle the Meridian template carried never existed here — blue has no dark palette.
 */
export function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  const { account } = useSession();
  const router = useRouter();

  const name = `${account.firstName} ${account.lastName}`;

  async function logout(): Promise<void> {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    // replace, not push: the signed-in URL must not sit in history behind the login screen.
    router.replace('/login');
  }

  return (
    <Navbar
      tracker={false}
      onMenuClick={onMenuClick}
      account={
        <AccountMenu
          name={name}
          data-testid="topbar-account-button"
          nameTestId="topbar-account-name"
          menuTestId="topbar-account-menu"
          items={[{ label: 'Log out', testId: 'logout-button', onSelect: logout }]}
        />
      }
    />
  );
}

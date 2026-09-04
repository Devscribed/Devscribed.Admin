'use client';

import { useRouter } from 'next/navigation';
import { formatElapsed } from '@devscribed/validation';
import { AccountMenu, Navbar } from '@devscribed/ds';
import { useSession } from './session-context';
import { useRunningTimer } from './running-timer-context';

/**
 * The system's `Navbar`: the mini tracker on the left, the account menu on the right.
 *
 * **The tracker is back on.** It was passed `false` here on the argument that timesheets
 * belong to a product surface no spec covers, and that stopped being true — spec 12 is that
 * surface, and `--color-tracker-blue` was reserved for exactly this pill. It is drawn only
 * while a timer runs, which is what spec 12 asks for: an always-present `00:00:00` is a
 * control that looks live and is not.
 *
 * `TopbarTimerIndicator` used to draw its own amber pill beside the account button. It is
 * gone rather than repainted: it and `MiniTracker` are the same element, and the system
 * owns it. The project label and the stop control it also carried have now landed too, in
 * the system's `Tracker` — the floating widget this pill discloses (`TimerWidget`). The pill
 * says *a timer is running*; the widget says what it is and stops it, which is the division
 * the system drew when it gave `MiniTracker` a chevron and reserved `--color-tracker-blue`
 * for a panel nothing yet rendered.
 *
 * The theme toggle the earlier design template carried never existed here — the system has
 * no dark palette.
 */
export function Topbar({
  onMenuClick,
  onOpenTracker,
  trackerOpen,
}: {
  onMenuClick: () => void;
  /** Discloses the floating tracker. The shell owns whether it is open. */
  onOpenTracker: () => void;
  trackerOpen: boolean;
}) {
  const { account } = useSession();
  const { timer, elapsedSeconds } = useRunningTimer();
  const router = useRouter();

  const name = `${account.firstName} ${account.lastName}`;

  async function logout(): Promise<void> {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    // replace, not push: the signed-in URL must not sit in history behind the login screen.
    router.replace('/login');
  }

  return (
    <Navbar
      tracker={timer !== null}
      trackerCounter={formatElapsed(elapsedSeconds)}
      trackerTestId="topbar-timer-indicator"
      onOpenTracker={onOpenTracker}
      trackerExpanded={trackerOpen}
      onMenuClick={onMenuClick}
      account={
        <AccountMenu
          name={name}
          data-testid="topbar-account-button"
          nameTestId="topbar-account-name"
          menuTestId="topbar-account-menu"
          items={[
            {
              label: 'Account settings',
              testId: 'account-settings-menu-link',
              onSelect: () => router.push('/account/settings'),
            },
            { label: 'Log out', testId: 'logout-button', onSelect: logout },
          ]}
        />
      }
    />
  );
}

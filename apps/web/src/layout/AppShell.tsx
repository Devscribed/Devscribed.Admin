'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AppShell as Frame } from '@devscribed/ds';
import { Sidebar } from './Sidebar';
import { TimerWidget } from './TimerWidget';
import { Topbar } from './Topbar';
import type { Session } from './session-context';
import { SessionProvider } from './session-context';
import { RequestsBadgeProvider } from './requests-badge-context';
import { RunningTimerProvider } from './running-timer-context';

/**
 * The signed-in frame, which is the system's `AppShell`: a 290px rail beside an 80px top bar, and
 * below 1200px a 60px top bar with the rail as a drawer. Only the content column scrolls.
 *
 * Everything the frame draws is the design system's. What lives here is what the design system
 * has no business knowing: the session, this product's navigation, and the two shell-level
 * facts the rail and the bar read — the pending-requests count and the running timer. Both
 * providers sit inside the session provider because both gate on the caller's role.
 */
export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // The floating tracker (spec 12). It is opened from the bar's pill and lives at shell level
  // rather than on the Time Tracking page, because the timer it reports on runs everywhere —
  // its whole job is being reachable from the screen the caller happens to be on.
  const [trackerOpen, setTrackerOpen] = useState(false);

  // Below the breakpoint the drawer covers the screen it navigated to, so arriving closes it.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <SessionProvider session={session}>
      <RequestsBadgeProvider>
        <RunningTimerProvider>
          <Frame
            sidebar={
              <Sidebar
                orgId={session.organization.id}
                onClose={() => setMenuOpen(false)}
              />
            }
            navbar={
              <Topbar
                onMenuClick={() => setMenuOpen(true)}
                onOpenTracker={() => setTrackerOpen((open) => !open)}
                trackerOpen={trackerOpen}
              />
            }
            menuOpen={menuOpen}
            onMenuClose={() => setMenuOpen(false)}
          >
            {children}
          </Frame>
          {/* Outside the frame, because it is `position: fixed` and belongs to the viewport
              rather than to the content column that scrolls under it. */}
          <TimerWidget open={trackerOpen} onClose={() => setTrackerOpen(false)} />
        </RunningTimerProvider>
      </RequestsBadgeProvider>
    </SessionProvider>
  );
}

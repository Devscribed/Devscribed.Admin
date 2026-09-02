'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { AppShell as Frame } from '@devscribed/ds';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import type { Session } from './session-context';
import { SessionProvider } from './session-context';

/**
 * The signed-in frame, which is blue's `AppShell`: a 290px rail beside an 80px top bar, and
 * below 1200px a 60px top bar with the rail as a drawer. Only the content column scrolls.
 *
 * Everything the frame draws is the design system's. What lives here is what the design system
 * has no business knowing: the session, and hiring's own navigation.
 */
export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Below the breakpoint the drawer covers the screen it navigated to, so arriving closes it.
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <SessionProvider session={session}>
      <Frame
        sidebar={
          <Sidebar
            orgId={session.organization.id}
            role={session.role}
            isInterviewer={session.isInterviewer}
            onClose={() => setMenuOpen(false)}
          />
        }
        navbar={<Topbar onMenuClick={() => setMenuOpen(true)} />}
        menuOpen={menuOpen}
        onMenuClose={() => setMenuOpen(false)}
      >
        {children}
      </Frame>
    </SessionProvider>
  );
}

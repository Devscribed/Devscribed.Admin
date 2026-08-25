'use client';

import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import type { Session } from './session-context';
import { SessionProvider } from './session-context';
import './app-shell.css';

/** Sidebar and top bar are fixed; only the content column scrolls. */
export function AppShell({ session, children }: { session: Session; children: ReactNode }) {
  return (
    <SessionProvider session={session}>
      <div className="shell">
        <Sidebar orgId={session.organization.id} role={session.role} />
        <div className="shell-main">
          <Topbar />
          <main className="shell-content">{children}</main>
        </div>
      </div>
    </SessionProvider>
  );
}

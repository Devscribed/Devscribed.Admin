'use client';

import type { ReactNode } from 'react';

/**
 * The shell for the only route in this application that has no session.
 *
 * `AppShell` is deliberately not reused: it mounts the sidebar, the top bar, and the
 * `SessionProvider`, all of which exist to serve a signed-in member of an organization.
 * A counterparty opening a magic link is none of those things — they must not be shown
 * navigation they cannot use, and this page must not fetch `/api/me`, because a signer
 * who happens to also be a member gets no rights from their session (spec 02, "Roles &
 * Permission Matrix"). Nothing here reads a cookie and nothing here sets one.
 *
 * Single column, capped at 720px, with the sender's organization name as the only
 * branding — the document, not the product, is what the reader came for.
 */
export function SigningLayout({
  organizationName,
  children,
}: {
  /** Absent on the terminal panels: an unknown token must not name an organization. */
  organizationName?: string | null;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        padding: 'var(--sp-12) var(--sp-8) var(--sp-20)',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <header style={{ marginBottom: 'var(--sp-12)' }}>
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-21)',
              letterSpacing: '-.5px',
              color: 'var(--text)',
            }}
          >
            {organizationName ?? 'Devscribed'}
          </span>
        </header>
        {children}
      </div>
    </div>
  );
}

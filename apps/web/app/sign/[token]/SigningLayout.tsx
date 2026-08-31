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
 * Single column with the sender's organization name as the only branding — the document,
 * not the product, is what the reader came for.
 *
 * The column has two widths. 720px is a reading measure, right for our own surface: prose,
 * a consent line and a signature canvas, all of which get worse as they get wider. A
 * provider's widget is not prose — it renders a whole page of a contract inside itself, and
 * at 720px on a large display that page is a stamp in the middle of an empty screen. So
 * `wide` raises the cap for the embedded surface only, and `clamp` carries it between the
 * two rather than a breakpoint: there is no width at which the document should suddenly
 * jump.
 */
export function SigningLayout({
  organizationName,
  wide = false,
  children,
}: {
  /** Absent on the terminal panels: an unknown token must not name an organization. */
  organizationName?: string | null;
  /** The embedded surface hosts a full page of a document and needs the room. */
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        /* Tighter above the embedded surface. Our own surface earns the air: it is a page
           to read. The widget is not — it brings its own header, its own toolbar and its
           own name for the document, so every band we add above it pushes the thing the
           signer came for further down a screen it already fills. */
        padding: wide
          ? 'var(--sp-8) var(--sp-8) var(--sp-10)'
          : 'var(--sp-12) var(--sp-8) var(--sp-20)',
      }}
    >
      <div
        style={{
          /* Never wider than the viewport allows, never wider than a page needs. */
          maxWidth: wide ? 'clamp(720px, 100%, 1180px)' : 720,
          margin: '0 auto',
        }}
      >
        <header style={{ marginBottom: wide ? 'var(--sp-6)' : 'var(--sp-12)' }}>
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

'use client';

import { notFound, usePathname, useRouter } from 'next/navigation';
import { use, useEffect, useState, type ReactNode } from 'react';
import { Preloader } from '@devscribed/ds';
import { AppShell } from '@/layout/AppShell';
import type { Session } from '@/layout/session-context';

type Resolution = { state: 'loading' } | { state: 'ready'; session: Session } | { state: 'gone' };

const signInHref = (): string =>
  `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;

/**
 * The gate for every signed-in screen. Nothing renders until `/api/me` has answered:
 * a visitor without a session must never glimpse the application frame, and the
 * role-gated navigation must never flash entries the caller is not entitled to.
 *
 * The organization id in the URL is only checked here for the sake of the address bar.
 * The real boundary is `OrgScopeGuard` in the API, which refuses any request whose
 * `:orgId` disagrees with the session cookie.
 *
 * Requests spec 03 REQ-03-019 has a choke point on each side, and this is the web's. A
 * client contact reaches the requests area and nothing else: a destination they cannot
 * use is neither drawn nor reachable by typing, and a screen whose own read answers 404
 * must not render its chrome around an answer that never comes. Gating here rather than
 * screen by screen is what makes a screen added later refused by default, exactly as the
 * server's guard refuses a route added later.
 */
export default function OrgLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const router = useRouter();
  const pathname = usePathname();
  const [resolution, setResolution] = useState<Resolution>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const response = await fetch('/api/me', { credentials: 'same-origin' });

      // The address stays in the query so sign-in can return the visitor to it — the
      // calendar invite's deep link to a candidate card arrives here signed out
      // (hiring 04 §01.5).
      if (response.status === 401) {
        router.replace(signInHref());
        return;
      }
      if (cancelled) return;

      const session: Session | null = await response.json();
      if (!session) {
        router.replace(signInHref());
        return;
      }
      // `features` is newer than this shell. An API that has not grown it — or that sends
      // something unexpected in its place — must leave the screens behind it undrawn
      // rather than throw on the first read of a field that is not there.
      const features = {
        mailOutbox: session.features?.mailOutbox === true,
      };
      // Requests spec 03 — the principal kind, read from the one endpoint that answers
      // it. Nothing renders until it has, so no member-only navigation is ever painted
      // and then removed.
      const principal = session.principal === 'client' ? 'client' : 'member';
      const client = principal === 'client' ? (session.client ?? null) : null;
      setResolution(
        session.organization.id === orgId
          ? { state: 'ready', session: { ...session, features, principal, client } }
          : { state: 'gone' },
      );
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [orgId, router]);

  if (resolution.state === 'gone') notFound();

  // The requests area is the whole of a client contact's product (REQ-03-018). Anything
  // else under this organization is the same 404 the API answers them, rather than a
  // screen drawn around a read that was refused.
  if (resolution.state === 'ready' && resolution.session.principal === 'client') {
    const requests = `/org/${orgId}/requests`;
    if (pathname !== requests && !pathname.startsWith(`${requests}/`)) notFound();
  }

  if (resolution.state === 'loading') {
    return (
      <div
        data-testid="app-loading"
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* The system's loader paints its own colour; the well it sits on is the one AppShell paints. */}
        <Preloader />
      </div>
    );
  }

  return <AppShell session={resolution.session}>{children}</AppShell>;
}

'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useEffect, useState, type ReactNode } from 'react';
import { Spinner } from '@/ds';
import { AppShell } from '@/layout/AppShell';
import type { Session } from '@/layout/session-context';

type Resolution = { state: 'loading' } | { state: 'ready'; session: Session } | { state: 'gone' };

/**
 * The gate for every signed-in screen. Nothing renders until `/api/me` has answered:
 * a visitor without a session must never glimpse the application frame, and the
 * role-gated navigation must never flash entries the caller is not entitled to.
 *
 * The organization id in the URL is only checked here for the sake of the address bar.
 * The real boundary is `OrgScopeGuard` in the API, which refuses any request whose
 * `:orgId` disagrees with the session cookie.
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
  const [resolution, setResolution] = useState<Resolution>({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      const response = await fetch('/api/me', { credentials: 'same-origin' });

      if (response.status === 401) {
        router.replace('/login');
        return;
      }
      if (cancelled) return;

      const session: Session | null = await response.json();
      if (!session) {
        router.replace('/login');
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

  if (resolution.state === 'loading') {
    return (
      <div
        data-testid="app-loading"
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--accent)',
        }}
      >
        <Spinner size={28} />
      </div>
    );
  }

  return <AppShell session={resolution.session}>{children}</AppShell>;
}

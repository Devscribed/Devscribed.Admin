'use client';

import { notFound, useRouter } from 'next/navigation';
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
      setResolution(
        session.organization.id === orgId ? { state: 'ready', session } : { state: 'gone' },
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
        }}
      >
        {/* Blue's loader paints its own colour; the well it sits on is the one AppShell paints. */}
        <Preloader />
      </div>
    );
  }

  return <AppShell session={resolution.session}>{children}</AppShell>;
}

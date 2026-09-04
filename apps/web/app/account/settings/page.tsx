'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Preloader } from '@devscribed/ds';
import { AppShell } from '@/layout/AppShell';
import { PageHeader } from '@/layout/PageHeader';
import type { Session } from '@/layout/session-context';
import { AccountSettingsScreen } from './AccountSettingsScreen';

type Resolution = { state: 'loading' } | { state: 'ready'; session: Session };

/**
 * `/account/settings` is a signed-in screen but lives outside the `/org/{orgId}/` segment,
 * so it cannot inherit that layout's session gate. It replicates the gate here (design doc
 * — DS gaps): fetch `GET /api/me`, show the shared `app-loading` Spinner while it is in
 * flight, `router.replace('/login')` on 401 or a null body, then render the settings
 * content inside `AppShell` built from the resolved session (single-org-per-user, so the
 * sidebar's org id comes off `session.organization.id`, never a URL parameter).
 */
export default function AccountSettingsPage() {
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
      setResolution({ state: 'ready', session });
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [router]);

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
        <Preloader />
      </div>
    );
  }

  return (
    <AppShell session={resolution.session}>
      <PageHeader title="Account settings" />
      <AccountSettingsScreen />
    </AppShell>
  );
}

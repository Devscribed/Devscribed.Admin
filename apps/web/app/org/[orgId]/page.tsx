'use client';

import type { CSSProperties } from 'react';
import { use, useEffect, useState } from 'react';
import { Card, InfoBanner, PageTitle, Preloader, useBreakpoint } from '@devscribed/ds';
import { hasCapability, PORTAL_MESSAGES } from '@devscribed/validation';
import { useSession } from '@/layout/session-context';
import { PortalFeed } from './PortalFeed';
import { PortalMonthPanel } from './PortalMonthPanel';
import { PortalRequestsPanel } from './PortalRequestsPanel';
import { PortalTimeOffPanel } from './PortalTimeOffPanel';
import { formatGreetingDate, type PortalHomeResponse } from './portal-types';

type HomeState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; data: PortalHomeResponse };

const gridWideStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 400px',
  gap: 'var(--space-8)',
  alignItems: 'start',
};

const gridNarrowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr)',
  gap: 'var(--space-8)',
};

const colLStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-8)',
  minWidth: 0,
};

const panelHeadingStyle: CSSProperties = {
  fontSize: 'var(--headline-6-size)',
  lineHeight: 'var(--headline-6-line)',
  letterSpacing: 'var(--headline-6-tracking)',
  fontWeight: 'var(--headline-6-weight)',
  margin: '0 0 var(--space-6)',
  color: 'var(--text-primary)',
};

/**
 * Q1's own wait — REQ-01-010 – REQ-01-021, Screens "Q1 loading". The three panel headings and
 * the column frame are already known and are painted immediately; only the figures and rows
 * wait, because Q1's only input is the caller and it does not change without a navigation.
 */
function PersonalHalfLoading() {
  return (
    <>
      <Card variant="panel">
        <h2 style={panelHeadingStyle}>This month</h2>
        <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-3) 0' }}>
          <Preloader role="status" aria-label="Loading this month" />
        </div>
      </Card>
      <Card variant="panel">
        <h2 style={panelHeadingStyle}>Time off</h2>
        <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-3) 0' }}>
          <Preloader role="status" aria-label="Loading time off" />
        </div>
      </Card>
      <Card variant="panel">
        <h2 style={panelHeadingStyle}>My requests</h2>
        <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-3) 0' }}>
          <Preloader role="status" aria-label="Loading my requests" />
        </div>
      </Card>
    </>
  );
}

/**
 * Home (portal spec 01) — `/org/{orgId}`. Two independent questions (§Screens "The questions
 * this screen asks"): Q1 is the caller's own month, reserve, holidays and requests, one fetch
 * to `GET .../portal/home`; Q2 is the organization's feed, owned entirely by `PortalFeed`. A
 * Q1 failure replaces the three left-hand panels with one `InfoBanner` and leaves the feed
 * column untouched, and the reverse holds for a Q2 failure — neither wait holds the other.
 *
 * `canManageSettings` is derived from the session's own role (REQ-01-052,
 * `hasCapability(role, 'ManagePortalSettings')`, exactly as `Sidebar.tsx` gates every row)
 * rather than from Q1's body, so a Q1 failure — or Q1 still loading — never takes
 * `portal-feed-settings-link` away from an admin whose feed answered fine.
 */
export default function PortalHomePage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const session = useSession();
  const rung = useBreakpoint();
  const wide = rung === 'lg' || rung === 'xl' || rung === 'xxl';

  const [homeState, setHomeState] = useState<HomeState>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setHomeState({ status: 'loading' });

    fetch(`/api/organizations/${orgId}/portal/home`, { credentials: 'same-origin' })
      .then(async (response) => {
        if (cancelled) return;
        if (!response.ok) {
          setHomeState({ status: 'error' });
          return;
        }
        const data = (await response.json()) as PortalHomeResponse;
        setHomeState({ status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setHomeState({ status: 'error' });
      });

    return () => {
      cancelled = true;
    };
  }, [orgId]);

  /* One value, one source: the date beside the greeting is the `today` the body answers,
     resolved in the caller's own timezone. Until Q1 answers there is no date to draw — a
     browser clock here would be a second source for it, and the two disagree for exactly
     the caller whose timezone is not the browser's. */
  const dateLabel =
    homeState.status === 'ready' ? formatGreetingDate(homeState.data.month.today) : null;

  return (
    <div>
      <div style={{ marginBottom: 'var(--space-7)' }}>
        <PageTitle data-testid="portal-greeting">{`Hello, ${session.account.firstName}`}</PageTitle>
        {/* The line holds its height whether or not the date is in it, so the grid below
            does not drop by one line when Q1 answers. */}
        <div
          style={{
            marginTop: 'var(--space-1)',
            fontSize: 'var(--font-size-s)',
            lineHeight: 'var(--line-height-label)',
            height: 'var(--line-height-label)',
            color: 'var(--text-tertiary)',
          }}
        >
          {dateLabel}
        </div>
      </div>

      <div style={wide ? gridWideStyle : gridNarrowStyle}>
        <div style={colLStyle}>
          {homeState.status === 'loading' && <PersonalHalfLoading />}

          {homeState.status === 'error' && (
            <InfoBanner variant="error">{PORTAL_MESSAGES.monthLoadFailed}</InfoBanner>
          )}

          {homeState.status === 'ready' && (
            <>
              <PortalMonthPanel orgId={orgId} month={homeState.data.month} />
              <PortalTimeOffPanel
                orgId={orgId}
                timeOff={homeState.data.timeOff}
                holidays={homeState.data.holidays}
                today={homeState.data.month.today}
              />
              <PortalRequestsPanel orgId={orgId} requests={homeState.data.requests} today={homeState.data.month.today} />
            </>
          )}
        </div>

        <PortalFeed
          orgId={orgId}
          canManageSettings={hasCapability(session.role, 'ManagePortalSettings')}
        />
      </div>
    </div>
  );
}

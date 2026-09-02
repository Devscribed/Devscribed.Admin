'use client';

import Link from 'next/link';
import { use } from 'react';
import { useSession } from '@/layout/session-context';
import { ChartIcon, CalendarIcon, MoneyIcon } from '@/layout/icons';
import { hasCapability, REPORTS_MESSAGES } from '@devscribed/validation';

/**
 * Reports landing (spec reports/01 §Screens · Reports landing). A card grid
 * of the reports the caller can see. Static UI keyed only on session role;
 * unauthorized visitors see nothing (the sidebar hides the parent row too, so
 * the URL is only reachable by direct-typing — in which case the empty grid
 * is a benign result rather than a 404, matching how organization/03's empty
 * calendar renders on a fresh org).
 */
export default function ReportsLandingPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const { orgId } = use(params);
  const session = useSession();
  const role = session.role;

  const cards: {
    testId: string;
    href: string;
    title: string;
    description: string;
    caption: string;
    icon: React.ReactNode;
    visible: boolean;
  }[] = [
    {
      testId: 'reports-card-amounts-owed',
      href: `/org/${orgId}/reports/amounts-owed`,
      title: 'Amounts Owed',
      description: REPORTS_MESSAGES.cardDescriptionAmountsOwed,
      caption: 'Admin / Manager · My variant for User',
      icon: <MoneyIcon size={22} />,
      visible:
        hasCapability(role, 'ViewAmountsOwed') || hasCapability(role, 'ViewMyAmountsOwed'),
    },
    {
      testId: 'reports-card-time-and-activity',
      href: `/org/${orgId}/reports/time-and-activity`,
      title: 'Time & Activity',
      description: REPORTS_MESSAGES.cardDescriptionTimeAndActivity,
      caption: 'Admin / Manager · My variant for User',
      icon: <ChartIcon size={22} />,
      visible:
        hasCapability(role, 'ViewTimeAndActivity') ||
        hasCapability(role, 'ViewMyTimeAndActivity'),
    },
    {
      testId: 'reports-card-time-off',
      href: `/org/${orgId}/reports/time-off`,
      title: 'Time Off',
      description: REPORTS_MESSAGES.cardDescriptionTimeOff,
      caption: 'Everyone (own record for User / Viewer)',
      icon: <CalendarIcon size={22} />,
      visible: hasCapability(role, 'ViewTimeOff') || hasCapability(role, 'ViewMyTimeOff'),
    },
  ];

  const visibleCards = cards.filter((c) => c.visible);

  return (
    <div data-testid="reports-landing">
      <div style={{ marginBottom: 22 }}>
        <h1
          data-testid="reports-landing-title"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-27)',
            letterSpacing: '-.6px',
            margin: '0 0 5px',
            color: 'var(--text)',
          }}
        >
          Reports
        </h1>
        <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
          Pick a report to inspect hours, amounts owed, or time-off across the organization.
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: 16,
        }}
      >
        {visibleCards.map((card) => (
          <Link
            key={card.testId}
            href={card.href}
            data-testid={card.testId}
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              padding: 22,
              background: 'var(--bg-panel)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-2xl)',
              boxShadow: 'var(--shadow-card)',
              textDecoration: 'none',
              color: 'var(--text)',
              cursor: 'pointer',
              minHeight: 180,
            }}
          >
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-lg)',
                background: 'var(--accent-soft)',
                color: 'var(--accent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-hidden
            >
              {card.icon}
            </div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-18)',
                color: 'var(--text)',
              }}
            >
              {card.title}
            </div>
            <div
              style={{
                fontSize: 'var(--fs-13)',
                color: 'var(--text-sub)',
                lineHeight: 'var(--lh-loose)',
              }}
            >
              {card.description}
            </div>
            <div
              style={{
                fontSize: 'var(--fs-11)',
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                letterSpacing: '.6px',
                marginTop: 'auto',
              }}
            >
              {card.caption}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

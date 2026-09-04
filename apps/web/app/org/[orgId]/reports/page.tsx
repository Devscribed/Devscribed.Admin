'use client';

import { use } from 'react';
import { NavigationCard, PageTitle } from '@devscribed/ds';
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
 *
 * Each card is a `NavigationCard` (§84) and therefore a real `<a>`: these are the three links
 * out of this page, and the hand-built version was a `<div>` wrapped in a `Link` that no
 * keyboard could reach in its own right.
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

  const visibleCards = cards.filter((card) => card.visible);

  return (
    <div data-testid="reports-landing">
      <div style={{ marginBottom: 'var(--space-8)' }}>
        <PageTitle data-testid="reports-landing-title" title="Reports" />
        <div
          style={{
            fontFamily: 'var(--font-family-base)',
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-secondary)',
          }}
        >
          Pick a report to inspect hours, amounts owed, or time-off across the organization.
        </div>
      </div>

      {/* A wrapping row rather than an auto-fit grid: `NavigationCard` decides how wide a card
          is (§84), and a grid cell that stretches it would draw one-line cards on a wide
          screen. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
        {visibleCards.map((card) => (
          <NavigationCard
            key={card.testId}
            data-testid={card.testId}
            href={card.href}
            leading={card.icon}
            title={card.title}
            description={card.description}
            caption={card.caption}
          />
        ))}
      </div>
    </div>
  );
}

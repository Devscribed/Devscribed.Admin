'use client';

import { notFound } from 'next/navigation';
import { use } from 'react';
import { can, normalizeRole } from '@devscribed/validation';
import { useSession } from '@/layout/session-context';
import { CalendarScreen } from './CalendarScreen';

/**
 * Time off spec 01 — the Vacation Calendar. A thin route wrapper, the shape the member
 * detail route uses, plus this screen's own gate.
 *
 * `notFound()` rather than a redirect: REQ-01-002 asks for the app's not-found handling,
 * and unknown and unauthorized are the same answer here as everywhere else. The role is
 * NORMALIZED before the question, so a membership still storing the legacy `member` is
 * read as `user` and reaches the page whose sidebar row it is drawn.
 */
export default function TimeOffCalendarPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const session = useSession();

  if (!can(normalizeRole(session.role), 'view-time-off-calendar')) notFound();

  return <CalendarScreen orgId={orgId} />;
}

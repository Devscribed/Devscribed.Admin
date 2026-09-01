'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { canManageHiring } from '@devscribed/validation';
import { Sidebar as Rail } from '@/ds';
import type { SidebarItem } from '@ds/components/navigation/Sidebar';
import { CandidatesIcon, PeopleIcon, SettingsIcon, VacanciesIcon } from './icons';

/** Only what the navigation asks of the session: a role, and one assignment fact. */
interface NavSession {
  role: string;
  isInterviewer: boolean;
}

/**
 * Only destinations that exist today. Blue's `Sidebar` carries seven groups from the wider
 * Teamplay product (Timesheets, Reports, Time off…); those are prod **content**, not design
 * language (§D6), and shipping them as dead links would promise screens no spec has yet
 * defined. Entries arrive as their specs land.
 *
 * Every row is one of blue's top-level links rather than a sub-item under a collapsible
 * title, because every hiring destination is one level deep and a link is the form that keeps
 * its own glyph — blue's submenu draws an icon on the parent only. A section deep enough to
 * need one is what the `submenu` form is there for.
 *
 * The rows do not share one predicate. Vacancies and Settings are `admin`/`manager`. **Candidates
 * is gated on role *or* assignment** (hiring 03 §06.31, §07.33) — which is what lets an engineer
 * interview without becoming an org admin, and is the only non-uniform permission in the product.
 *
 * There is no `My interviews` row. That screen is the candidate list's `Assigned to me` scope
 * now, so an interviewer's one hiring destination is the same destination a manager has, opened
 * on a different tab. Two rows pointing at one list would have been the navigation claiming a
 * difference the screen does not have.
 *
 * The shell resolves the session before it renders anything, which is what stops a gated row
 * flashing into view and back out — including this one, whose predicate rides on `/api/me` for
 * that reason.
 */
function navigation(orgId: string, session: NavSession): SidebarItem[] {
  const items: SidebarItem[] = [
    {
      type: 'link',
      title: 'Members',
      Icon: PeopleIcon,
      href: `/org/${orgId}/members`,
      testId: 'nav-members',
    },
  ];

  if (canManageHiring(session.role)) {
    items.push({
      type: 'link',
      title: 'Vacancies',
      Icon: VacanciesIcon,
      href: `/org/${orgId}/hiring/vacancies`,
      testId: 'nav-vacancies',
    });
  }

  // The one row an interviewer has, and the same one a manager has. What differs is what the
  // API will answer them with, which is not the rail's business to pre-empt.
  if (canManageHiring(session.role) || session.isInterviewer) {
    items.push({
      type: 'link',
      title: 'Candidates',
      Icon: CandidatesIcon,
      href: `/org/${orgId}/hiring/candidates`,
      testId: 'nav-candidates',
    });
  }

  if (canManageHiring(session.role)) {
    items.push({
      type: 'link',
      title: 'Settings',
      Icon: SettingsIcon,
      href: `/org/${orgId}/hiring/settings`,
      testId: 'nav-hiring-settings',
    });
  }

  return items;
}

export function Sidebar({
  orgId,
  onClose,
  ...session
}: { orgId: string; onClose: () => void } & NavSession) {
  const pathname = usePathname();
  const router = useRouter();

  // A row is active when the path equals its href or is nested beneath it, so a candidate
  // card keeps Candidates lit.
  const isActive = (href: string): boolean =>
    pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Rail
      data-testid="app-sidebar"
      logoHref={`/org/${orgId}/members`}
      onClose={onClose}
      items={navigation(orgId, session).map((item) => ({
        ...item,
        active: isActive(item.href as string),
      }))}
      // Every row stays a real link — middle-click, copy address and open-in-new-tab all work —
      // while an unmodified click is handed to the client router.
      onNavigate={(event: MouseEvent, href?: string) => {
        if (!href || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.push(href);
      }}
    />
  );
}

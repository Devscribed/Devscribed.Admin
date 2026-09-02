'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { canManageHiring } from '@devscribed/validation';
import { Sidebar as Rail } from '@devscribed/ds';
import type { SidebarItem, SidebarSubItem } from '@devscribed/ds';
import { PeopleIcon } from './icons';

/** Only what the navigation asks of the session: a role, and one assignment fact. */
interface NavSession {
  role: string;
  isInterviewer: boolean;
}

/**
 * Only destinations that exist today. Blue's `Sidebar` carries seven groups from the wider
 * Teamplay product (Timesheets, Reports, Time off…); those are prod **content**, not design
 * language (§D6), and shipping them as dead links would promise screens no spec has yet
 * defined. Entries arrive as their specs land, so two of blue's seven are drawn: `People`
 * and `Hiring`.
 *
 * Both are submenus, which is the reversal this rail makes. Every destination used to be a
 * top-level link, on the argument that one level deep needs no second one — and that held
 * while hiring was three rows out of four. It is not what blue does with the same content:
 * `People → Members` is a submenu in prod's own nav, and hiring is a section of the same
 * size beside it. Four unparented rows read as four unrelated screens; two titled groups say
 * which of them belong together, which is the fact a reader needs before they need a route.
 *
 * A submenu draws its glyph on the parent only, so the sub-items carry no icon of their own —
 * `VacanciesIcon`, `CandidatesIcon` and `SettingsIcon` went with the rows that held them.
 * `Hiring` reuses `PeopleIcon`, the same mark `People` draws: the design asks for a dedicated
 * section glyph and the icon set does not have one (`ds-additions.md #10`). Reusing it leaves
 * the gap visible; inventing a mark here would hide it in the one place nobody would look.
 *
 * The rows do not share one predicate. Vacancies and Libraries are `admin`/`manager`.
 * **Candidates is gated on role *or* assignment** (hiring 03 §06.31, §07.33) — which is what
 * lets an engineer interview without becoming an org admin, and is the only non-uniform
 * permission in the product. A member with no hiring row at all gets no `Hiring` group: an
 * empty titled group is a section that says it has contents and then does not.
 *
 * There is no `My interviews` row. That screen is the candidate list's `Assigned to me` scope
 * now, so an interviewer's one hiring destination is the same destination a manager has, opened
 * on a different tab. Two rows pointing at one list would have been the navigation claiming a
 * difference the screen does not have.
 *
 * `Settings` is `Libraries`. The route does not move — nothing on that screen is a setting, and
 * renaming the row is cheaper and truer than moving the path readers have already bookmarked.
 *
 * The shell resolves the session before it renders anything, which is what stops a gated row
 * flashing into view and back out — including this one, whose predicate rides on `/api/me` for
 * that reason.
 */
function navigation(orgId: string, session: NavSession): SidebarItem[] {
  const items: SidebarItem[] = [
    {
      type: 'submenu',
      title: 'People',
      Icon: PeopleIcon,
      subs: [{ label: 'Members', href: `/org/${orgId}/members`, testId: 'nav-members' }],
    },
  ];

  const hiring: SidebarSubItem[] = [];

  if (canManageHiring(session.role)) {
    hiring.push({
      label: 'Vacancies',
      href: `/org/${orgId}/hiring/vacancies`,
      testId: 'nav-vacancies',
    });
  }

  // The one row an interviewer has, and the same one a manager has. What differs is what the
  // API will answer them with, which is not the rail's business to pre-empt.
  if (canManageHiring(session.role) || session.isInterviewer) {
    hiring.push({
      label: 'Candidates',
      href: `/org/${orgId}/hiring/candidates`,
      testId: 'nav-candidates',
    });
  }

  if (canManageHiring(session.role)) {
    hiring.push({
      label: 'Libraries',
      href: `/org/${orgId}/hiring/settings`,
      testId: 'nav-hiring-settings',
    });
  }

  if (hiring.length > 0) {
    items.push({ type: 'submenu', title: 'Hiring', Icon: PeopleIcon, subs: hiring });
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

  // Both the current row and the open group are answered from the route rather than from a
  // click, which is what `active` on a sub-item and on its title are for (§13). A group is
  // current when one of its rows is, and blue opens a group that has just become current —
  // otherwise arriving at a candidate card by deep link would leave its own section shut.
  const items = navigation(orgId, session).map((group) => {
    const subs = (group.subs as SidebarSubItem[]).map((sub) => ({
      ...sub,
      active: isActive(sub.href as string),
    }));
    return { ...group, subs, active: subs.some((sub) => sub.active) };
  });

  return (
    <Rail
      data-testid="app-sidebar"
      logoHref={`/org/${orgId}/members`}
      onClose={onClose}
      items={items}
      // Every row stays a real link — middle-click, copy address and open-in-new-tab all work —
      // while an unmodified click is handed to the client router. The group titles are not
      // rows: blue draws them as `<button aria-expanded>`, so `Hiring` toggles and goes nowhere.
      onNavigate={(event: MouseEvent, href?: string) => {
        if (!href || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.push(href);
      }}
    />
  );
}

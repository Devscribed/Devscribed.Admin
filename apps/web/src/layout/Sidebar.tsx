'use client';

import { usePathname, useRouter } from 'next/navigation';
import type { MouseEvent } from 'react';
import { can, canManageHiring, hasCapability, type Role } from '@devscribed/validation';
import {
  OrgIcon,
  PeopleIcon,
  ProjectManagementIcon,
  ReportsIcon,
  Sidebar as Rail,
  TimeOffIcon,
  TimesheetsIcon,
} from '@devscribed/ds';
import type { SidebarItem, SidebarSubItem } from '@devscribed/ds';
import { DocumentsIcon } from './icons';
import { useSession, type SessionFeatures } from './session-context';
import { usePendingRequests } from './requests-badge-context';

/** Only what the navigation asks of the session. */
interface NavSession {
  role: string;
  isInterviewer: boolean;
  features: SessionFeatures;
}

/**
 * Only destinations that exist today, arranged the way the design system arranges them.
 *
 * **Where the system named the group, the system's grouping wins.** `Sidebar` ships a
 * default set of sections, and it is a default rather than a fixture (§13) — but it is not
 * an arbitrary one: it was measured from this product, section for section. `Timesheets`,
 * `Project management → Clients`, `People → Members`, `Reports → Time & activity / Amounts
 * owed / Time offs / All reports`, `Time off → Holidays / Requests` are all its own labels
 * and its own nesting, so that is where those rows go. Two consequences worth naming:
 * `Requests` leaves People, and `Holidays` leaves Settings — the system files both under
 * the thing they are about rather than under who administers them.
 *
 * **Where the system is silent, the grouping is ours.** It has never seen documents or
 * hiring, so `Documents` and `Hiring` are shaped here, in its idiom: a titled group whose
 * rows are destinations. `Documents` follows the system's own `All reports` construction —
 * the landing row is named for the whole rather than repeating the group's title.
 *
 * **A row the system named that no route serves is not shipped.** `Policies`, `Team
 * overview`, `ToDo / Teams`, `My organization` and `Subscription` are all in the default
 * set and none has a screen, so none is drawn: a dead link promises a page no spec defines.
 * The same rule empties a whole group — a section with no visible rows is dropped title and
 * all, so `viewer` never meets a `Documents` heading that opens onto nothing.
 *
 * Every row is gated on what the caller may actually do, and each is **omitted** rather than
 * drawn-and-disabled. Two gates are not roles:
 *
 *  - **Candidates** is role *or* assignment (hiring 03 §06.31), which is what lets an
 *    engineer interview without becoming an org admin.
 *  - **Outbox** needs an environment that simulates mail as well as a role allowed to see
 *    signing links.
 */
function navigation(orgId: string, session: NavSession, pendingCount: number): SidebarItem[] {
  const { role, features } = session;
  const items: SidebarItem[] = [];
  const at = (path: string): string => `/org/${orgId}${path}`;

  // The system draws Timesheets as a top-level link, and it is right to: the daily-driver
  // surface is one destination, and a group of one is a click in front of a page.
  if (can(role as Role, 'view-time-tracking')) {
    items.push({
      type: 'link',
      title: 'Timesheets',
      Icon: TimesheetsIcon,
      href: at('/time-tracking'),
      testId: 'nav-time-tracking',
    });
  }

  const projects: SidebarSubItem[] = [];
  if (can(role as Role, 'manage-projects')) {
    projects.push({ label: 'Projects', href: at('/projects'), testId: 'nav-projects' });
  }
  if (can(role as Role, 'manage-clients')) {
    projects.push({ label: 'Clients', href: at('/clients'), testId: 'nav-clients' });
  }
  if (projects.length > 0) {
    items.push({
      type: 'submenu',
      title: 'Project management',
      Icon: ProjectManagementIcon,
      subs: projects,
    });
  }

  items.push({
    type: 'submenu',
    title: 'People',
    Icon: PeopleIcon,
    subs: [{ label: 'Members', href: at('/members'), testId: 'nav-members' }],
  });

  // The three reports and their landing page, under the system's own four labels. Each row
  // carries its own capability rather than inheriting the group's: a member who may read
  // their own time off and nothing else gets that one row, not four.
  const reports: SidebarSubItem[] = [];
  if (hasCapability(role, 'ViewTimeAndActivity') || hasCapability(role, 'ViewMyTimeAndActivity')) {
    reports.push({
      label: 'Time & activity',
      href: at('/reports/time-and-activity'),
      testId: 'nav-reports-time-and-activity',
    });
  }
  if (hasCapability(role, 'ViewAmountsOwed') || hasCapability(role, 'ViewMyAmountsOwed')) {
    reports.push({
      label: 'Amounts owed',
      href: at('/reports/amounts-owed'),
      testId: 'nav-reports-amounts-owed',
    });
  }
  if (hasCapability(role, 'ViewTimeOff') || hasCapability(role, 'ViewMyTimeOff')) {
    reports.push({
      label: 'Time offs',
      href: at('/reports/time-off'),
      testId: 'nav-reports-time-off',
    });
  }
  if (reports.length > 0) {
    // The landing page keeps `nav-reports`: it is the same destination that row always
    // addressed, and the cards on it carry more context than any nav row could.
    reports.push({ label: 'All reports', href: at('/reports'), testId: 'nav-reports' });
    items.push({ type: 'submenu', title: 'Reports', Icon: ReportsIcon, subs: reports });
  }

  const timeOff: SidebarSubItem[] = [];
  if (hasCapability(role, 'ViewHolidays')) {
    timeOff.push({
      label: 'Holidays',
      href: at('/settings/holidays'),
      testId: 'settings-tab-holidays',
    });
  }
  if (can(role as Role, 'view-requests')) {
    timeOff.push({
      label: 'Requests',
      href: at('/requests'),
      testId: 'sidebar-requests-link',
      // §76 — the shared pending count, and it disappears at zero rather than reading `0`.
      badge: pendingCount || undefined,
      badgeTestId: 'sidebar-requests-badge',
    });
  }
  if (timeOff.length > 0) {
    items.push({ type: 'submenu', title: 'Time off', Icon: TimeOffIcon, subs: timeOff });
  }

  // Ours to shape: the system has never seen a document. Templates and envelopes are
  // separately gated because the two capabilities are separately granted — documents 02
  // gives a manager the full envelope set while 01 leaves them read-only on templates.
  const documents: SidebarSubItem[] = [];
  if (hasCapability(role, 'ViewEnvelopes')) {
    documents.push({ label: 'All documents', href: at('/documents'), testId: 'nav-envelopes' });
  }
  if (hasCapability(role, 'ViewDocumentTemplates')) {
    documents.push({
      label: 'Templates',
      href: at('/documents/templates'),
      testId: 'nav-documents',
    });
  }
  if (features.mailOutbox && hasCapability(role, 'ManageEnvelopes')) {
    documents.push({ label: 'Outbox', href: at('/outbox'), testId: 'nav-outbox' });
  }
  if (documents.length > 0) {
    items.push({ type: 'submenu', title: 'Documents', Icon: DocumentsIcon, subs: documents });
  }

  // Also ours. `Hiring` reuses `PeopleIcon`, the same mark `People` draws: the design asks
  // for a dedicated section glyph and the icon set does not have one (`ds-additions.md #10`).
  // Reusing it leaves the gap visible; inventing a mark here would hide it in the one place
  // nobody would look.
  const hiring: SidebarSubItem[] = [];
  if (canManageHiring(role)) {
    hiring.push({ label: 'Vacancies', href: at('/hiring/vacancies'), testId: 'nav-vacancies' });
  }
  // The one row an interviewer has, and the same one a manager has. What differs is what the
  // API will answer them with, which is not the rail's business to pre-empt. There is no
  // `My interviews` row: that screen is the candidate list's `Assigned to me` scope now.
  if (canManageHiring(role) || session.isInterviewer) {
    hiring.push({ label: 'Candidates', href: at('/hiring/candidates'), testId: 'nav-candidates' });
  }
  // `Settings` is `Libraries`. The route does not move — nothing on that screen is a
  // setting, and renaming the row is cheaper and truer than moving a bookmarked path.
  if (canManageHiring(role)) {
    hiring.push({ label: 'Libraries', href: at('/hiring/settings'), testId: 'nav-hiring-settings' });
  }
  if (hiring.length > 0) {
    items.push({ type: 'submenu', title: 'Hiring', Icon: PeopleIcon, subs: hiring });
  }

  // The system's own `Organization` group, holding the one organization-level setting that
  // has a screen. Choosing the provider decides where every future contract of the
  // organization is executed and who holds the evidence, which is an organization fact
  // rather than a documents one — which is also why it is admin-gated more tightly than
  // sending a document is.
  const organization: SidebarSubItem[] = [];
  if (hasCapability(role, 'ViewSigningSettings')) {
    organization.push({ label: 'Signing', href: at('/settings/signing'), testId: 'nav-settings' });
  }
  if (organization.length > 0) {
    items.push({ type: 'submenu', title: 'Organization', Icon: OrgIcon, subs: organization });
  }

  return items;
}

export function Sidebar({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, isInterviewer, features } = useSession();
  const { pendingCount } = usePendingRequests();

  const items = navigation(orgId, { role, isInterviewer, features }, pendingCount);

  /**
   * `/documents` is a prefix of `/documents/templates` and `/reports` of every report, so a
   * plain `startsWith` lights two rows at once. Only the **longest** matching destination is
   * the one the caller is actually on — which is why `All reports` and `Time offs` can sit
   * in one group without fighting, and why a candidate card keeps `Candidates` lit.
   */
  const destinations = items.flatMap((item) =>
    item.type === 'link' ? [item.href as string] : (item.subs as SidebarSubItem[]).map((s) => s.href as string),
  );
  const current = destinations
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];

  // Both the current row and the open group are answered from the route rather than from a
  // click, which is what `active` on a sub-item and on its title are for (§13). A group is
  // current when one of its rows is, and blue opens a group that has just become current —
  // otherwise arriving at a sub-page by deep link would leave its own section shut.
  const decorated = items.map((item) => {
    if (item.type === 'link') return { ...item, active: item.href === current };
    const subs = (item.subs as SidebarSubItem[]).map((sub) => ({ ...sub, active: sub.href === current }));
    return { ...item, subs, active: subs.some((sub) => sub.active) };
  });

  return (
    <Rail
      data-testid="app-sidebar"
      logoHref={`/org/${orgId}/members`}
      onClose={onClose}
      items={decorated}
      // Every row stays a real link — middle-click, copy address and open-in-new-tab all work —
      // while an unmodified click is handed to the client router. The group titles are not
      // rows: the system draws them as `<button aria-expanded>`, so `Hiring` toggles and goes nowhere.
      onNavigate={(event: MouseEvent, href?: string) => {
        if (!href || event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        router.push(href);
      }}
    />
  );
}

'use client';

import { usePathname, useRouter } from 'next/navigation';
import { can, hasCapability, type Role } from '@devscribed/validation';
import { NavItem, SectionLabel } from '@/ds';
import { DocumentsIcon } from '@/documents/icons';
import { BriefcaseIcon, ClockIcon, FolderIcon, InboxIcon, PeopleIcon } from './icons';
import { useSession, type SessionFeatures } from './session-context';
import { usePendingRequests } from './requests-badge-context';

interface NavEntry {
  testId: string;
  label: string;
  href: string;
  icon: React.ReactNode;
  /** Optional count pill (spec 10 Requests row). Hidden when `undefined`/0. */
  badge?: number;
  badgeTestId?: string;
}

interface NavGroup {
  label: string;
  entries: NavEntry[];
}

/**
 * Only destinations that exist today. The Meridian template carries seven groups from
 * the wider product (Timesheets, Reports, Time off…); shipping them as dead links
 * would promise screens no spec has yet defined. Groups arrive as their specs land — a
 * group with no visible rows is dropped entirely (both its label and its rows), so
 * `user`/`viewer` never see an empty PROJECTS or DOCUMENTS heading.
 *
 * Every row here is gated by what the caller may actually do, and each one is *omitted*
 * rather than rendered-then-hidden — a control the caller cannot use is never drawn:
 *
 *  - **Time Tracking** (spec 12) needs `view-time-tracking` and leads the menu — it is the
 *    daily-driver surface, so it sits above PEOPLE. Omitted for `viewer`, who therefore
 *    sees PEOPLE first.
 *  - **Requests** (spec 10) needs `view-requests`, so `user` and `viewer` never see it.
 *    Its badge carries the shared pending count and disappears at 0.
 *  - **Projects** (spec 11) needs `manage-projects` (admin/manager).
 *  - **Documents** and **Templates** are separately gated because the two capabilities
 *    are separately granted: spec 02 gives a `manager` the full envelope set while spec
 *    01 leaves them read-only on templates. The group is assembled from whichever rows
 *    survive, and disappears entirely when none do.
 *  - **Outbox** needs two things at once — an environment that simulates mail, and a role
 *    allowed to see signing links, which is the same set that decides who signs.
 */
function navigation(
  orgId: string,
  role: string,
  pendingCount: number,
  features: SessionFeatures,
): NavGroup[] {
  const groups: NavGroup[] = [];

  if (can(role as Role, 'view-time-tracking')) {
    groups.push({
      label: 'Time',
      entries: [
        {
          testId: 'nav-time-tracking',
          label: 'Time Tracking',
          href: `/org/${orgId}/time-tracking`,
          icon: <ClockIcon />,
        },
      ],
    });
  }

  const people: NavEntry[] = [
    {
      testId: 'nav-members',
      label: 'Members',
      href: `/org/${orgId}/members`,
      icon: <PeopleIcon />,
    },
  ];

  if (can(role as Role, 'view-requests')) {
    people.push({
      testId: 'sidebar-requests-link',
      label: 'Requests',
      href: `/org/${orgId}/requests`,
      icon: <InboxIcon />,
      badge: pendingCount || undefined,
      badgeTestId: 'sidebar-requests-badge',
    });
  }

  groups.push({ label: 'People', entries: people });

  const projects: NavEntry[] = [];
  if (can(role as Role, 'manage-projects')) {
    projects.push({
      testId: 'nav-projects',
      label: 'Projects',
      href: `/org/${orgId}/projects`,
      icon: <FolderIcon />,
    });
  }
  if (can(role as Role, 'manage-clients')) {
    // Sits below the Projects row (spec organization/01 §Sidebar integration).
    // Omitted — not disabled — for a role without `manage-clients`; the group as a
    // whole is dropped by the trailing filter below when both entries are gone.
    projects.push({
      testId: 'nav-clients',
      label: 'Clients',
      href: `/org/${orgId}/clients`,
      icon: <BriefcaseIcon />,
    });
  }
  if (projects.length > 0) {
    groups.push({ label: 'Projects', entries: projects });
  }

  const documents: NavEntry[] = [];

  if (hasCapability(role, 'ViewEnvelopes')) {
    documents.push({
      testId: 'nav-envelopes',
      label: 'Documents',
      href: `/org/${orgId}/documents`,
      icon: <DocumentsIcon />,
    });
  }

  if (hasCapability(role, 'ViewDocumentTemplates')) {
    documents.push({
      testId: 'nav-documents',
      label: 'Templates',
      href: `/org/${orgId}/documents/templates`,
      icon: <DocumentsIcon />,
    });
  }

  if (features.mailOutbox && hasCapability(role, 'ManageEnvelopes')) {
    documents.push({
      testId: 'nav-outbox',
      label: 'Outbox',
      href: `/org/${orgId}/outbox`,
      icon: <DocumentsIcon />,
    });
  }

  if (documents.length > 0) {
    groups.push({ label: 'Documents', entries: documents });
  }

  // Spec 04 — the product's first settings destination. Gated on `ViewSigningSettings`,
  // so `user` and `viewer` see no Settings group at all: the row is omitted rather than
  // drawn-and-disabled, and the group with no rows is dropped label and all by the filter
  // below. No dead links.
  if (hasCapability(role, 'ViewSigningSettings')) {
    groups.push({
      label: 'Settings',
      entries: [
        {
          testId: 'nav-settings',
          label: 'Signing',
          href: `/org/${orgId}/settings/signing`,
          icon: <DocumentsIcon />,
        },
      ],
    });
  }

  return groups.filter((group) => group.entries.length > 0);
}

export function Sidebar({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, features } = useSession();
  const { pendingCount } = usePendingRequests();
  const groups = navigation(orgId, role, pendingCount, features);

  /**
   * `/documents` is a prefix of `/documents/templates`, so a plain `startsWith` would
   * light up two rows at once. Only the *longest* matching destination is the one the
   * caller is actually on.
   */
  const matched = groups
    .flatMap((group) => group.entries)
    .filter((entry) => pathname === entry.href || pathname.startsWith(`${entry.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav className="shell-sidebar" data-testid="app-sidebar" aria-label="Main">
      <div className="shell-sidebar-head">
        <Wordmark />
      </div>

      <div className="shell-nav">
        {groups.map((group, index) => (
          <div key={group.label} style={{ marginTop: index === 0 ? 0 : 'var(--sp-8)' }}>
            <SectionLabel className="shell-nav-section" style={{ margin: '0 12px 10px' }}>
              {group.label}
            </SectionLabel>

            {group.entries.map((entry) => {
              const active = matched === entry.href;
              return (
                // `NavItem` renders its own <a> and takes no `as`/component prop, so it
                // cannot host a next/link. Passing `href` keeps the row a real link
                // (middle-click, copy address) while onClick keeps navigation client-side.
                <NavItem
                  key={entry.href}
                  href={entry.href}
                  onClick={(event: React.MouseEvent) => {
                    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
                    event.preventDefault();
                    router.push(entry.href);
                  }}
                  icon={entry.icon}
                  active={active}
                  badge={entry.badge}
                  badgeTestId={entry.badgeTestId}
                  title={entry.label}
                  data-testid={entry.testId}
                  aria-current={active ? 'page' : undefined}
                  label={<span className="shell-nav-label">{entry.label}</span>}
                />
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

/**
 * No logo file exists — the Meridian wordmark is plain type plus an amber pin. Collapsed,
 * only the pin survives.
 */
function Wordmark() {
  return (
    <span
      style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--fs-21)',
        letterSpacing: '-.5px',
      }}
    >
      <span className="shell-wordmark-full">
        Team<span style={{ color: 'var(--accent)' }}>merly</span>
      </span>
      <span
        className="shell-wordmark-mark"
        style={{ fontFamily: 'var(--font-display)', color: 'var(--accent)' }}
      >
        T
      </span>
      <span
        style={{
          display: 'inline-block',
          width: 6,
          height: 6,
          borderRadius: 2,
          background: 'var(--tracker)',
          marginLeft: 3,
          verticalAlign: 'middle',
        }}
      />
    </span>
  );
}

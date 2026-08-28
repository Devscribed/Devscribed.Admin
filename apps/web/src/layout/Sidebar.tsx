'use client';

import { usePathname, useRouter } from 'next/navigation';
import { NavItem, SectionLabel } from '@/ds';
import { can, type Role } from '@devscribed/validation';
import { ClockIcon, FolderIcon, InboxIcon, PeopleIcon } from './icons';
import { useSession } from './session-context';
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

/** One labelled group of nav rows (e.g. PEOPLE → Members/Requests, PROJECTS → Projects). */
interface NavGroup {
  section: string;
  entries: NavEntry[];
}

/**
 * Only destinations that exist today. The Meridian template carries seven groups from
 * the wider product (Timesheets, Reports, Time off…); shipping them as dead links
 * would promise screens no spec has yet defined. Groups arrive as their specs land — a
 * group with no visible rows is dropped entirely (both its label and its rows), so
 * `user`/`viewer` never see an empty PROJECTS heading.
 *
 * The Requests row (spec 10) and the whole PROJECTS group (spec 11) are role-gated:
 * appended only for callers with `view-requests` / `manage-projects` (admin/manager),
 * never rendered-then-hidden.
 *
 * TIME → Time Tracking (spec 12) leads the menu — it is the daily-driver surface — so it
 * sits above PEOPLE and PROJECTS. It is visible to admin/manager/user and omitted for
 * viewer, so the group (and its label) never renders for a caller lacking
 * `view-time-tracking`; a viewer therefore sees PEOPLE first.
 */
function navigation(orgId: string, role: Role, pendingCount: number): NavGroup[] {
  const groups: NavGroup[] = [];

  if (can(role, 'view-time-tracking')) {
    groups.push({
      section: 'Time',
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

  if (can(role, 'view-requests')) {
    people.push({
      testId: 'sidebar-requests-link',
      label: 'Requests',
      href: `/org/${orgId}/requests`,
      icon: <InboxIcon />,
      badge: pendingCount || undefined,
      badgeTestId: 'sidebar-requests-badge',
    });
  }

  groups.push({ section: 'People', entries: people });

  if (can(role, 'manage-projects')) {
    groups.push({
      section: 'Projects',
      entries: [
        {
          testId: 'nav-projects',
          label: 'Projects',
          href: `/org/${orgId}/projects`,
          icon: <FolderIcon />,
        },
      ],
    });
  }

  return groups.filter((group) => group.entries.length > 0);
}

export function Sidebar({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { pendingCount } = usePendingRequests();
  const groups = navigation(orgId, session.role as Role, pendingCount);

  return (
    <nav className="shell-sidebar" data-testid="app-sidebar" aria-label="Main">
      <div className="shell-sidebar-head">
        <Wordmark />
      </div>

      <div className="shell-nav">
        {groups.map((group, groupIndex) => (
          <div key={group.section} style={groupIndex > 0 ? { marginTop: 18 } : undefined}>
            <SectionLabel className="shell-nav-section" style={{ margin: '0 12px 10px' }}>
              {group.section}
            </SectionLabel>

            {group.entries.map((entry) => {
              const active = pathname === entry.href || pathname.startsWith(`${entry.href}/`);
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

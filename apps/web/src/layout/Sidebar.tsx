'use client';

import { usePathname, useRouter } from 'next/navigation';
import { NavItem, SectionLabel } from '@/ds';
import { can, type Role } from '@devscribed/validation';
import { InboxIcon, PeopleIcon } from './icons';
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

/**
 * Only destinations that exist today. The Meridian template carries seven groups from
 * the wider product (Timesheets, Reports, Time off…); shipping them as dead links
 * would promise screens no spec has yet defined. Entries arrive as their specs land.
 *
 * The Requests row (spec 10) is role-gated — appended only for callers with the
 * `view-requests` capability (admin/manager), so `user`/`viewer` never see it (it is
 * omitted from the array, never rendered-then-hidden). Its badge carries the shared
 * pending count and disappears at 0.
 */
function navigation(orgId: string, role: Role, pendingCount: number): NavEntry[] {
  const entries: NavEntry[] = [
    {
      testId: 'nav-members',
      label: 'Members',
      href: `/org/${orgId}/members`,
      icon: <PeopleIcon />,
    },
  ];

  if (can(role, 'view-requests')) {
    entries.push({
      testId: 'sidebar-requests-link',
      label: 'Requests',
      href: `/org/${orgId}/requests`,
      icon: <InboxIcon />,
      badge: pendingCount || undefined,
      badgeTestId: 'sidebar-requests-badge',
    });
  }

  return entries;
}

export function Sidebar({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const session = useSession();
  const { pendingCount } = usePendingRequests();
  const entries = navigation(orgId, session.role as Role, pendingCount);

  return (
    <nav className="shell-sidebar" data-testid="app-sidebar" aria-label="Main">
      <div className="shell-sidebar-head">
        <Wordmark />
      </div>

      <div className="shell-nav">
        <SectionLabel className="shell-nav-section" style={{ margin: '0 12px 10px' }}>
          People
        </SectionLabel>

        {entries.map((entry) => {
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

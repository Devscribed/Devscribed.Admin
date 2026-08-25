'use client';

import { usePathname, useRouter } from 'next/navigation';
import { canManageHiring } from '@devscribed/validation';
import { NavItem, SectionLabel } from '@/ds';
import { PeopleIcon, VacanciesIcon } from './icons';

interface NavEntry {
  testId: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  label: string;
  entries: NavEntry[];
}

/**
 * Only destinations that exist today. The Meridian template carries seven groups from
 * the wider product (Timesheets, Reports, Time off…); shipping them as dead links
 * would promise screens no spec has yet defined. Entries arrive as their specs land.
 *
 * Sections are role-gated whole: a member with no hiring access sees no HIRING label
 * at all, rather than an empty one. The shell resolves the session before it renders
 * anything, which is what stops a gated row flashing into view and back out.
 */
function navigation(orgId: string, role: string): NavSection[] {
  const sections: NavSection[] = [
    {
      label: 'People',
      entries: [
        {
          testId: 'nav-members',
          label: 'Members',
          href: `/org/${orgId}/members`,
          icon: <PeopleIcon />,
        },
      ],
    },
  ];

  if (canManageHiring(role)) {
    sections.push({
      label: 'Hiring',
      entries: [
        {
          testId: 'nav-vacancies',
          label: 'Vacancies',
          href: `/org/${orgId}/hiring/vacancies`,
          icon: <VacanciesIcon />,
        },
      ],
    });
  }

  return sections;
}

export function Sidebar({ orgId, role }: { orgId: string; role: string }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className="shell-sidebar" data-testid="app-sidebar" aria-label="Main">
      <div className="shell-sidebar-head">
        <Wordmark />
      </div>

      <div className="shell-nav">
        {navigation(orgId, role).map((section) => (
          <div key={section.label} style={{ marginBottom: 'var(--sp-6)' }}>
            <SectionLabel className="shell-nav-section" style={{ margin: '0 12px 10px' }}>
              {section.label}
            </SectionLabel>

            {section.entries.map((entry) => {
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

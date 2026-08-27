'use client';

import { usePathname, useRouter } from 'next/navigation';
import { hasCapability } from '@devscribed/validation';
import { NavItem, SectionLabel } from '@/ds';
import { DocumentsIcon } from '@/documents/icons';
import { PeopleIcon } from './icons';
import { useSession, type SessionFeatures } from './session-context';

interface NavEntry {
  testId: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavGroup {
  label: string;
  entries: NavEntry[];
}

/**
 * Only destinations that exist today. The Meridian template carries seven groups from
 * the wider product (Timesheets, Reports, Time off…); shipping them as dead links
 * would promise screens no spec has yet defined. Entries arrive as their specs land —
 * Requests (spec 10) is the next one, and it is role-gated.
 *
 * Documents is the first capability-gated group. A `user` or `viewer` gets a 404 from
 * the route itself, so rendering the entry for them would be a dead control pointing at
 * a wall — the repository rule is that a control the caller cannot use is never drawn.
 */
function navigation(orgId: string, role: string, features: SessionFeatures): NavGroup[] {
  const groups: NavGroup[] = [
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

  // The two entries are separately gated because the two capabilities are separately
  // granted: spec 02 gives a `manager` the full envelope set while spec 01 leaves them
  // read-only on templates, so the group is assembled from whichever rows survive.
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

  // Where mail is simulated there is somewhere to read it, and reading it is how a person
  // reaches a signing link at all. Two conditions, both needed: the environment has to
  // have an outbox, and the caller has to be one of the roles allowed to see signing
  // links — which is the same set that decides who signs in the first place.
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

  return groups;
}

export function Sidebar({ orgId }: { orgId: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { role, features } = useSession();
  const groups = navigation(orgId, role, features);

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

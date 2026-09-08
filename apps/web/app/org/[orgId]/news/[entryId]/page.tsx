'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';
import { use, useCallback, useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, InfoBanner, Preloader } from '@devscribed/ds';
import { PORTAL_MESSAGES } from '@devscribed/validation';

/**
 * `GET /api/organizations/{orgId}/portal/news/{entryId}` — the shape this page consumes
 * (`01-home.contracts.md` §Routes). Declared here rather than imported from `portal-types.ts`,
 * which belongs to the home screen's own task.
 */
type PortalEntryKind = 'member-joined' | 'member-anniversary' | 'vacancy-opened' | 'project-started';
type PortalEntryGroup = 'people' | 'hiring' | 'work';

interface PortalEntrySubject {
  kind: 'member' | 'vacancy' | 'project';
  id: string;
  name: string;
  initials: string | null;
}

interface PortalEntryFact {
  key: string;
  label: string;
  value: string;
}

interface PortalEntryProjectRef {
  id: string;
  name: string;
}

interface PortalEntryMemberRef {
  id: string;
  name: string;
  initials: string | null;
}

interface PortalEntryDetail {
  id: string;
  kind: PortalEntryKind;
  group: PortalEntryGroup;
  occurredAt: string;
  subject: PortalEntrySubject;
  facts: PortalEntryFact[];
  categories: string[] | null;
  body: string | null;
  shareUrl: string | null;
  link: string | null;
  /** `member-joined` / `member-anniversary` only (REQ-01-045). */
  projects?: PortalEntryProjectRef[];
  /** `project-started` only; `null` where REQ-01-056 withholds it. */
  members?: PortalEntryMemberRef[] | null;
}

/* Geometry & motion — the reading column is capped at 720px, and the title wraps inside it. */
const readingColumnStyle: CSSProperties = { maxWidth: 720 };

const backLinkStyle: CSSProperties = {
  display: 'inline-block',
  marginBottom: 'var(--space-6)',
  color: 'var(--text-secondary)',
  fontSize: 'var(--font-size-s)',
  textDecoration: 'none',
};

const headRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: 'var(--space-5)',
};

const titleStyle: CSSProperties = {
  fontSize: 'var(--headline-6-size)',
  lineHeight: 'var(--headline-6-line)',
  letterSpacing: 'var(--headline-6-tracking)',
  fontWeight: 'var(--headline-6-weight)',
  margin: 0,
  color: 'var(--text-primary)',
};

const stampStyle: CSSProperties = {
  marginTop: 'var(--space-2)',
  color: 'var(--text-tertiary)',
  fontSize: 'var(--font-size-xs)',
};

const factsListStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'auto 1fr',
  columnGap: 'var(--space-6)',
  rowGap: 'var(--space-4)',
  margin: 'var(--space-7) 0 0',
};

const factLabelStyle: CSSProperties = { color: 'var(--text-tertiary)', fontSize: 'var(--font-size-s)' };
const factValueStyle: CSSProperties = { color: 'var(--text-primary)', fontSize: 'var(--font-size-s)' };

const proseStyle: CSSProperties = {
  marginTop: 'var(--space-7)',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
};

/* Geometry & motion — a `flex: 1; min-width: 0` code box with ellipsis beside an `auto`
   copy button, so a long slug never pushes the button off the panel. */
const shareRowStyle: CSSProperties = {
  marginTop: 'var(--space-7)',
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
};

const shareCodeStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  fontFamily: 'var(--font-family-mono)',
  fontSize: 'var(--font-size-s)',
  color: 'var(--text-secondary)',
  backgroundColor: 'var(--surface-sunken)',
  borderRadius: 'var(--radius-m)',
  padding: 'var(--space-3) var(--space-4)',
};

const rosterSectionStyle: CSSProperties = { marginTop: 'var(--space-7)' };

const rosterHeadingStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  fontWeight: 'var(--font-weight-medium)',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  margin: '0 0 var(--space-4)',
};

const rosterRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 'var(--space-4)',
  padding: 'var(--space-3) 0',
};

function tileStyle(group: PortalEntryGroup): CSSProperties {
  const paint: CSSProperties =
    group === 'hiring'
      ? { backgroundColor: 'var(--color-blue-tint)', color: 'var(--text-link)' }
      : { backgroundColor: 'var(--color-info-tint)', color: 'var(--status-info)' };
  return {
    width: 40,
    height: 40,
    flexShrink: 0,
    borderRadius: 'var(--radius-l)',
    ...paint,
  };
}

/**
 * REQ-01-039 — the same sentence the feed drew, reconstructed from the fields this entry's
 * kind carries. Nothing here decides what to draw first; it is the exact wording `PortalFeed`
 * composes for the same kind, matched against the facts this endpoint answers instead of the
 * feed's own `detail` bag.
 */
function entrySentence(entry: PortalEntryDetail): string {
  const name = entry.subject.name;
  if (entry.kind === 'member-joined') {
    const jobTitle = entry.facts.find((fact) => fact.key === 'jobTitle')?.value ?? null;
    return `${name} joined the team${jobTitle ? ` as a ${jobTitle}` : ''}.`;
  }
  if (entry.kind === 'member-anniversary') {
    const years = entry.facts.find((fact) => fact.key === 'years')?.value ?? '0';
    const n = Number(years);
    return `${name} has been with the team for ${years} ${n === 1 ? 'year' : 'years'}.`;
  }
  if (entry.kind === 'vacancy-opened') {
    return `A vacancy is open: ${name}.`;
  }
  // project-started
  const clientName = entry.facts.find((fact) => fact.key === 'client')?.value ?? null;
  return `${name} started${clientName ? ` for ${clientName}` : ''}.`;
}

function formatTimestamp(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

type EntryState = { status: 'loading' } | { status: 'gone' } | { status: 'error' } | { status: 'ready'; entry: PortalEntryDetail };

/**
 * `/org/{orgId}/news/{entryId}` — the entry's own page (REQ-01-038 – REQ-01-047, REQ-01-052,
 * REQ-01-056). `portal-entry-back` is painted immediately, because it needs no answer; the
 * panel's frame carries `Preloader` blocks while the request is in flight. A `404` renders the
 * app's own not-found screen — there is no "this entry is not for you" state (REQ-01-040).
 */
export default function PortalEntryPage({
  params,
}: {
  params: Promise<{ orgId: string; entryId: string }>;
}) {
  const { orgId, entryId } = use(params);
  const [state, setState] = useState<EntryState>({ status: 'loading' });

  const load = useCallback(async (): Promise<void> => {
    try {
      // `entryId` arrives here still percent-encoded — unlike a page navigation's own
      // `params`, the client page's promise-based `params` object (REQ-01-038's own
      // route) is not decoded before it reaches `use()`. Re-encoding it here would
      // double-encode the `:` (`%3A` becomes `%253A`), which Express decodes only once
      // and hands `parseEntryId` a kind it does not recognise — a bare 404 answered as
      // "gone" rather than the entry actually being missing. Used as-is, it is already
      // exactly the path segment the route expects.
      const response = await fetch(
        `/api/organizations/${orgId}/portal/news/${entryId}`,
        { credentials: 'same-origin' },
      );
      if (response.status === 404) {
        setState({ status: 'gone' });
        return;
      }
      if (!response.ok) {
        setState({ status: 'error' });
        return;
      }
      const data = (await response.json()) as PortalEntryDetail;
      setState({ status: 'ready', entry: data });
    } catch {
      setState({ status: 'error' });
    }
  }, [orgId, entryId]);

  useEffect(() => {
    setState({ status: 'loading' });
    void load();
  }, [load]);

  if (state.status === 'gone') notFound();

  const entry = state.status === 'ready' ? state.entry : null;

  return (
    <div style={readingColumnStyle}>
      <Link href={`/org/${orgId}`} data-testid="portal-entry-back" style={backLinkStyle}>
        ← What&apos;s new
      </Link>

      {state.status === 'error' && <InfoBanner variant="error">{PORTAL_MESSAGES.entryLoadFailed}</InfoBanner>}

      {(state.status === 'loading' || entry) && (
        <Card variant="panel">
          {state.status === 'loading' && (
            <div style={{ display: 'flex', alignItems: 'center', padding: 'var(--space-3) 0' }}>
              <Preloader role="status" aria-label="Loading this entry" />
            </div>
          )}

          {entry && (
            <>
              <div style={headRowStyle}>
                {entry.subject.kind === 'member' ? (
                  <Avatar name={entry.subject.name} initials={entry.subject.initials ?? ''} size={40} decorative />
                ) : (
                  <span aria-hidden="true" style={tileStyle(entry.group)} />
                )}
                <div>
                  <h1 data-testid="portal-entry-title" style={titleStyle}>
                    {entrySentence(entry)}
                  </h1>
                  <p style={stampStyle}>{formatTimestamp(entry.occurredAt)}</p>
                </div>
              </div>

              {entry.facts.length > 0 && (
                <dl style={factsListStyle}>
                  {entry.facts.map((fact) => (
                    <FactRow key={fact.key} fact={fact} />
                  ))}
                </dl>
              )}

              {entry.categories && entry.categories.length > 0 && (
                <div style={{ marginTop: 'var(--space-6)', display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
                  {entry.categories.map((category) => (
                    <Badge key={category} status="neutral" size="s">
                      {category}
                    </Badge>
                  ))}
                </div>
              )}

              {entry.body !== null && (
                <div data-testid="portal-entry-body" style={proseStyle}>
                  {entry.body.split('\n').map((paragraph, index) => (
                    <p key={index} style={{ margin: index === 0 ? 0 : 'var(--space-5) 0 0' }}>
                      {paragraph}
                    </p>
                  ))}
                </div>
              )}

              {entry.shareUrl !== null && (
                <div data-testid="portal-entry-share" style={shareRowStyle}>
                  <code style={shareCodeStyle}>{entry.shareUrl}</code>
                  <Button
                    style={{ flexShrink: 0 }}
                    onClick={() => {
                      void navigator.clipboard?.writeText(entry.shareUrl ?? '');
                    }}
                  >
                    Copy link
                  </Button>
                </div>
              )}

              {entry.projects && entry.projects.length > 0 && (
                <div style={rosterSectionStyle}>
                  <p style={rosterHeadingStyle}>Teams</p>
                  {entry.projects.map((project) => (
                    <div key={project.id} style={rosterRowStyle}>
                      {project.name}
                    </div>
                  ))}
                </div>
              )}

              {entry.members && entry.members.length > 0 && (
                <div style={rosterSectionStyle}>
                  <p style={rosterHeadingStyle}>Members</p>
                  {entry.members.map((member) => (
                    <div key={member.id} style={rosterRowStyle}>
                      <Avatar name={member.name} initials={member.initials ?? ''} size={24} decorative />
                      {member.name}
                    </div>
                  ))}
                </div>
              )}

              {entry.link && (
                <div style={{ marginTop: 'var(--space-7)' }}>
                  <Link href={entry.link} style={{ color: 'var(--text-link)', fontSize: 'var(--font-size-s)' }}>
                    {entry.subject.name} →
                  </Link>
                </div>
              )}
            </>
          )}
        </Card>
      )}
    </div>
  );
}

function FactRow({ fact }: { fact: PortalEntryFact }): ReactNode {
  return (
    <div data-testid="portal-entry-fact" style={{ display: 'contents' }}>
      <dt style={factLabelStyle}>{fact.label}</dt>
      <dd style={{ ...factValueStyle, margin: 0 }}>{fact.value}</dd>
    </div>
  );
}

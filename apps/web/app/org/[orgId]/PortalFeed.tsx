'use client';

import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card, EmptyState, InfoBanner, Preloader, SettingsIcon } from '@devscribed/ds';
import { can, PORTAL_MESSAGES, type Role } from '@devscribed/validation';
import { useSession } from '@/layout/session-context';
import type { PortalFeedEntry, PortalNewsResponse } from './portal-types';

const colStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', minWidth: 0 };

/* Geometry & motion — `justify-content: space-between` with the heading first, so the
 * heading's left edge does not depend on the settings link existing. */
const feedHeadStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 'var(--space-5)',
  padding: '0 var(--space-1)',
};

const feedHeadingStyle: CSSProperties = {
  fontSize: 'var(--headline-6-size)',
  lineHeight: 'var(--headline-6-line)',
  letterSpacing: 'var(--headline-6-tracking)',
  fontWeight: 'var(--headline-6-weight)',
  margin: 0,
  color: 'var(--text-primary)',
};

const gearStyle: CSSProperties = {
  width: 32,
  height: 32,
  borderRadius: 'var(--radius-l)',
  border: '1px solid var(--border-default)',
  backgroundColor: 'var(--surface-page)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: 'var(--text-secondary)',
  flexShrink: 0,
};

/* Geometry & motion — a block in the column's flow with its own top padding; it never
 * overlays an entry. */
const daySepStyle: CSSProperties = {
  fontSize: 'var(--font-size-xs)',
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--text-tertiary)',
  fontWeight: 'var(--font-weight-medium)',
  padding: 'var(--space-4) var(--space-1) 0',
};

const entryBodyStyle: CSSProperties = { minWidth: 0 };

const entryLineStyle: CSSProperties = { lineHeight: 'var(--line-height-base)' };

const entryMetaStyle: CSSProperties = {
  marginTop: 'var(--space-2)',
  color: 'var(--text-tertiary)',
  fontSize: 'var(--font-size-xs)',
};

const entryExtraStyle: CSSProperties = {
  marginTop: 'var(--space-4)',
  display: 'flex',
  gap: 'var(--space-3)',
  flexWrap: 'wrap',
};

const loadingEntryStyle: CSSProperties = {
  backgroundColor: 'var(--surface-page)',
  borderRadius: 'var(--radius-xl)',
  boxShadow: 'var(--shadow-card-soft)',
  padding: 'var(--space-6)',
  display: 'flex',
  alignItems: 'center',
};

type NewsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; entries: PortalFeedEntry[]; nextCursor?: string; loadingMore: boolean };

/** `'2026-11-08'` in the given zone — the caller's `Account.timezone`, never the device's. */
function localYmd(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(instant);
}

/** `'2026-11-08'` → the UTC midnight it names, for pure calendar-day arithmetic. */
function ymdToUtcMillis(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

/**
 * `'in 2 hours'` in reverse — a moment already in the past. The elapsed-time steps (minutes,
 * hours) are zone-independent, but the weekday and day/month fallbacks are dates and are
 * drawn in the caller's own `Account.timezone` — one value, one source with `month.today`
 * and `dayLabel` below, never the device's zone (REQ-01-037, portal-types.ts `today`).
 */
function formatRelativeTime(iso: string, timeZone: string): string {
  const then = new Date(iso).getTime();
  const diffMs = Math.max(0, Date.now() - then);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone }).format(new Date(iso));
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone }).format(new Date(iso));
}

/**
 * `'Today'` / `'Earlier this week'` / `'Earlier'` — the day separator's own three words,
 * resolved from the calendar day each moment falls on **in the caller's own timezone**, not
 * the device's. `Account.timezone` is nullable; UTC is the fallback, exactly as the API
 * resolves `month.today`.
 */
function dayLabel(iso: string, timeZone: string): string {
  const entryYmd = localYmd(new Date(iso), timeZone);
  const todayYmd = localYmd(new Date(), timeZone);
  const diffDays = Math.round((ymdToUtcMillis(todayYmd) - ymdToUtcMillis(entryYmd)) / 86_400_000);
  if (diffDays <= 0) return 'Today';
  if (diffDays < 7) return 'Earlier this week';
  return 'Earlier';
}

function groupByDay(
  entries: PortalFeedEntry[],
  timeZone: string,
): { label: string; entries: PortalFeedEntry[] }[] {
  const groups: { label: string; entries: PortalFeedEntry[] }[] = [];
  for (const entry of entries) {
    const label = dayLabel(entry.occurredAt, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}

function tileStyle(group: PortalFeedEntry['group']): CSSProperties {
  const paint: CSSProperties =
    group === 'hiring'
      ? { backgroundColor: 'var(--color-blue-tint)', color: 'var(--text-link)' }
      : { backgroundColor: 'var(--color-info-tint)', color: 'var(--status-info)' };
  return {
    width: 36,
    height: 36,
    flexShrink: 0,
    borderRadius: 'var(--radius-l)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    ...paint,
  };
}

interface FeedSentence {
  line: ReactNode;
  meta: string;
  badges?: string[];
}

/** Every kind's own sentence, built only from fields the entry actually carries — no field
 * this spec's contract does not name (the "Aurora — Northwind Ltd" style caption, an
 * activity percentage) is invented here. */
function feedSentence(entry: PortalFeedEntry, timeZone: string): FeedSentence {
  const relative = formatRelativeTime(entry.occurredAt, timeZone);
  const name = entry.subject.name;

  if (entry.kind === 'member-joined') {
    const jobTitle = typeof entry.detail.jobTitle === 'string' ? entry.detail.jobTitle : null;
    return {
      line: (
        <>
          <b style={{ fontWeight: 'var(--font-weight-semibold)' }}>{name}</b> joined the team
          {jobTitle ? ` as a ${jobTitle}` : ''}.
        </>
      ),
      meta: relative,
    };
  }

  if (entry.kind === 'member-anniversary') {
    const years = typeof entry.detail.years === 'number' ? entry.detail.years : 0;
    return {
      line: (
        <>
          <b style={{ fontWeight: 'var(--font-weight-semibold)' }}>{name}</b> has been with the
          team for {years} {years === 1 ? 'year' : 'years'}.
        </>
      ),
      meta: relative,
    };
  }

  if (entry.kind === 'vacancy-opened') {
    const interviewerName = typeof entry.detail.interviewerName === 'string' ? entry.detail.interviewerName : null;
    const categories = Array.isArray(entry.detail.categories) ? (entry.detail.categories as string[]) : [];
    return {
      line: (
        <>
          A vacancy is open: <b style={{ fontWeight: 'var(--font-weight-semibold)' }}>{name}</b>.
        </>
      ),
      meta: interviewerName ? `${relative} · interviews with ${interviewerName}` : relative,
      badges: categories,
    };
  }

  // project-started
  const clientName = typeof entry.detail.clientName === 'string' ? entry.detail.clientName : null;
  return {
    line: (
      <>
        <b style={{ fontWeight: 'var(--font-weight-semibold)' }}>{name}</b> started
        {clientName ? ` for ${clientName}` : ''}.
      </>
    ),
    meta: relative,
  };
}

function FeedEntryCard({
  orgId,
  entry,
  timeZone,
}: {
  orgId: string;
  entry: PortalFeedEntry;
  timeZone: string;
}) {
  const [hovered, setHovered] = useState(false);
  const sentence = feedSentence(entry, timeZone);

  return (
    // DS gap — `Card` renders a `div` and takes no `as` prop, so the control this entry needs
    // to be (an `<a>` that hovers) wraps the panel from outside it rather than being built by
    // hand: the surface, its radius and its rest padding stay `Card`'s own, and only the hover
    // shadow — an existing token, no new number — is added on top.
    <a
      href={`/org/${orgId}/news/${encodeURIComponent(entry.id)}`}
      data-testid="portal-feed-entry"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}
    >
      <Card
        variant="panel"
        style={{
          boxShadow: hovered ? 'var(--shadow-card-hover)' : 'var(--shadow-card-soft)',
          transition: 'var(--transition-card-hover)',
        }}
      >
        {/* Geometry & motion — a two-column grid, `auto` for the mark and `minmax(0,1fr)` for
            the body; the body wraps and the panel grows downwards. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0,1fr)', gap: 'var(--space-5)', alignItems: 'start' }}>
          {entry.subject.kind === 'member' ? (
            <Avatar name={entry.subject.name} initials={entry.subject.initials ?? ''} size={36} decorative />
          ) : (
            <span aria-hidden="true" style={tileStyle(entry.group)} />
          )}
          <div style={entryBodyStyle}>
            <div style={entryLineStyle}>{sentence.line}</div>
            {sentence.badges && sentence.badges.length > 0 && (
              <div style={entryExtraStyle}>
                {sentence.badges.map((label) => (
                  <Badge key={label} status="neutral" size="s">
                    {label}
                  </Badge>
                ))}
              </div>
            )}
            <div style={entryMetaStyle}>{sentence.meta}</div>
          </div>
        </div>
      </Card>
    </a>
  );
}

/**
 * "What's new" — Q2 (REQ-01-022 – REQ-01-037, REQ-01-052). Its own fetch, its own loading,
 * error and empty states, entirely independent of Q1: a Q1 failure never touches this column
 * and a Q2 failure never touches the personal half.
 *
 * `canManageSettings` is derived from the session's own role (REQ-01-052), not from Q1's
 * body, so a Q1 failure or a still-loading Q1 never takes the settings link away from an
 * admin whose feed answered fine.
 */
export function PortalFeed({ orgId, canManageSettings }: { orgId: string; canManageSettings: boolean }) {
  const session = useSession();
  const timeZone = session.account.timezone ?? 'UTC';
  const canInvite = can(session.role as Role, 'invite');
  const [state, setState] = useState<NewsState>({ status: 'loading' });

  const fetchPage = useCallback(
    async (cursor?: string): Promise<PortalNewsResponse | null> => {
      // A rejection here — a dropped connection, not just a non-2xx status — must still reach
      // the error state below; an `async` effect body that does not catch its own rejection
      // leaves the feed stuck on its loading skeleton forever.
      try {
        const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
        const response = await fetch(`/api/organizations/${orgId}/portal/news${query}`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return null;
        return (await response.json()) as PortalNewsResponse;
      } catch {
        return null;
      }
    },
    [orgId],
  );

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    void fetchPage().then((data) => {
      if (cancelled) return;
      if (!data) {
        setState({ status: 'error' });
        return;
      }
      setState({ status: 'ready', entries: data.entries, nextCursor: data.nextCursor, loadingMore: false });
    });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  // The click handler only flips a flag — a `setState` updater function is invoked twice
  // in development (React looks for exactly this: an impure updater) and throws away one
  // of the results, but not before *running* it, so a fetch launched from inside the
  // updater itself was launched twice, and the second page landed on top of the first.
  // The updater below only ever computes the next boolean from the previous state, which
  // is safe to run twice; the fetch that flag guards lives in the effect below instead,
  // whose own body runs once per state transition, not once per state computation.
  const loadMore = useCallback(() => {
    setState((prev) => {
      if (prev.status !== 'ready' || !prev.nextCursor || prev.loadingMore) return prev;
      return { ...prev, loadingMore: true };
    });
  }, []);

  useEffect(() => {
    if (state.status !== 'ready' || !state.loadingMore) return;
    let cancelled = false;
    const cursor = state.nextCursor;
    void fetchPage(cursor).then((data) => {
      if (cancelled) return;
      setState((current) => {
        if (current.status !== 'ready') return current;
        if (!data) return { ...current, loadingMore: false };
        // Nothing already drawn is replaced — the new page is appended (REQ-01-025, TC-01-E2E-05).
        return {
          status: 'ready',
          entries: [...current.entries, ...data.entries],
          nextCursor: data.nextCursor,
          loadingMore: false,
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [state, fetchPage]);

  return (
    <div style={colStyle}>
      <div style={feedHeadStyle}>
        <h2 style={feedHeadingStyle}>What&apos;s new</h2>
        {canManageSettings && (
          <Link
            href={`/org/${orgId}/settings/portal`}
            data-testid="portal-feed-settings-link"
            aria-label="Feed settings"
            style={gearStyle}
          >
            <SettingsIcon width="16" height="16" />
          </Link>
        )}
      </div>

      {state.status === 'loading' &&
        [0, 1, 2].map((key) => (
          // A wait is not a link: these are `div`s, findable by `role="status"`, which
          // `Preloader` does not set on its own and must be given here.
          <div key={key} style={loadingEntryStyle}>
            <Preloader size={8} margin={5} role="status" aria-label="Loading what's new" />
          </div>
        ))}

      {state.status === 'error' && (
        <InfoBanner variant="error">{PORTAL_MESSAGES.feedLoadFailed}</InfoBanner>
      )}

      {state.status === 'ready' && state.entries.length === 0 && (
        <Card variant="panel">
          <EmptyState data-testid="portal-feed-empty">
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-5)' }}>
              <div style={{ fontSize: 'var(--font-size-xl)', fontWeight: 'var(--font-weight-medium)' }}>
                {PORTAL_MESSAGES.feedEmptyTitle}
              </div>
              <p style={{ margin: 0, color: 'var(--text-secondary)', maxWidth: '34ch', lineHeight: 1.6, textAlign: 'center' }}>
                {PORTAL_MESSAGES.feedEmptyBody}
              </p>
              {canInvite && (
                <Button as="a" href={`/org/${orgId}/members`}>
                  Invite somebody
                </Button>
              )}
            </div>
          </EmptyState>
        </Card>
      )}

      {state.status === 'ready' && state.entries.length > 0 && (
        <>
          {/* `dayLabel` only ever moves forward with time, and the source list is sorted by
              moment descending — so each label appears in one contiguous run and is a safe,
              stable key on its own. */}
          {groupByDay(state.entries, timeZone).map((group) => (
            <div key={group.label} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
              <div style={daySepStyle}>{group.label}</div>
              {group.entries.map((entry) => (
                <FeedEntryCard key={entry.id} orgId={orgId} entry={entry} timeZone={timeZone} />
              ))}
            </div>
          ))}

          {state.nextCursor && (
            <Button data-testid="portal-feed-more" onClick={loadMore} disabled={state.loadingMore} style={{ alignSelf: 'center' }}>
              Show earlier
            </Button>
          )}
        </>
      )}
    </div>
  );
}

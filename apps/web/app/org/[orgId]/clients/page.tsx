'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button, IconButton, InfoBanner, SearchField, Select, Table } from '@/ds';
import type { TableColumn } from '@ds/components/data/Table';
import { PencilIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  CLIENT_MESSAGES,
  can,
  parseClientStatusFilter,
  type ClientStatusFilter,
  type Role,
} from '@devscribed/validation';
import { ArchiveClientDialog } from './ArchiveClientDialog';
import { ClientModal } from './ClientModal';
import type { ClientListItem, ClientStatus, ClientsResponse } from './types';

const FILTER_OPTIONS: { value: ClientStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

const STATUS_META: Record<ClientStatus, { tone: 'active' | 'inactive'; label: string }> = {
  active: { tone: 'active', label: 'Active' },
  archived: { tone: 'inactive', label: 'Archived' },
};

/** Debounce interval for the search query (spec organization/01 §UI Description). */
const SEARCH_DEBOUNCE_MS = 250;

/**
 * Clients list page (spec organization/01). Role-gated on `manage-clients` —
 * `user`/`viewer` get a redirect to `/members`, matching spec Alt Flow E which
 * routes a direct-URL visit through the API's 404 to Members. We short-circuit
 * client-side to spare the request but keep the same destination so the
 * redirect target is one place. The status + q filters mirror to the URL so a
 * reload survives; the fetch is aborted on every filter change so a slow
 * previous response cannot clobber the newer one.
 */
export default function ClientsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const searchParams = useSearchParams();
  const session = useSession();
  const { showToast } = useToast();

  const authorized = can(session.role as Role, 'manage-clients');
  useEffect(() => {
    if (!authorized) router.replace(`/org/${orgId}/members`);
  }, [authorized, router, orgId]);

  const initialFilter = parseClientStatusFilter(searchParams.get('status') ?? undefined);
  const initialQ = searchParams.get('q') ?? '';

  const [filter, setFilter] = useState<ClientStatusFilter>(initialFilter);
  const [q, setQ] = useState<string>(initialQ);
  const [debouncedQ, setDebouncedQ] = useState<string>(initialQ);
  const [clients, setClients] = useState<ClientListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ClientListItem | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ClientListItem | null>(null);
  const [archiving, setArchiving] = useState(false);

  // Debounce the search input — the fetch dependency is the debounced value.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q]);

  // Keep the URL in step with the current filter+q so a reload preserves state.
  // Skipped when unauthorized so its `router.replace('?...')` cannot race with
  // the redirect effect above and hold the caller on `/clients`.
  useEffect(() => {
    if (!authorized) return;
    const next = new URLSearchParams();
    if (filter !== 'active') next.set('status', filter);
    if (debouncedQ.length > 0) next.set('q', debouncedQ);
    const qs = next.toString();
    router.replace(qs.length > 0 ? `?${qs}` : '?', { scroll: false });
    // router is stable; excluding it keeps this effect firing only on state change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorized, filter, debouncedQ]);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      setError(false);
      const params = new URLSearchParams({ status: filter });
      if (debouncedQ.trim().length > 0) params.set('q', debouncedQ.trim());
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/clients?${params.toString()}`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (response.status === 404) {
          // A caller who lost the capability mid-session hits the members page,
          // matching Alt Flow E.
          router.replace(`/org/${orgId}/members`);
          return;
        }
        if (response.ok) {
          const data = (await response.json()) as ClientsResponse;
          if (signal?.aborted) return;
          setClients(data.clients);
        } else {
          setClients([]);
          setError(true);
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setClients([]);
        setError(true);
      }
      if (signal?.aborted) return;
      setLoading(false);
    },
    [orgId, filter, debouncedQ, router],
  );

  useEffect(() => {
    // Cancel an in-flight fetch when the filter or q changes so its late reply
    // cannot clobber the current one (mirrors projects/page.tsx). Also skipped
    // while the effect above is redirecting an unauthorized caller — sparing
    // the API request the OrgScopeGuard would answer 404 to anyway.
    if (!authorized) return undefined;
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [authorized, load]);

  async function handleRestore(client: ClientListItem): Promise<void> {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${client.id}/restore`,
        { method: 'PATCH', credentials: 'same-origin' },
      );
      if (response.ok) {
        showToast('toast-client-restored', CLIENT_MESSAGES.toastRestored);
        await load();
      } else {
        showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
      }
    } catch {
      showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
    }
  }

  async function handleArchiveConfirm(): Promise<void> {
    if (!archiveTarget || archiving) return;
    setArchiving(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${archiveTarget.id}/archive`,
        { method: 'PATCH', credentials: 'same-origin' },
      );
      if (response.ok) {
        showToast('toast-client-archived', CLIENT_MESSAGES.toastArchived);
        setArchiveTarget(null);
        await load();
      } else {
        showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
      }
    } catch {
      showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
    }
    setArchiving(false);
  }

  const columns: TableColumn<ClientListItem>[] = useMemo(
    () => [
      {
        label: 'Name',
        flex: 2,
        render: (c) => (
          <Link
            href={`/org/${orgId}/clients/${c.id}`}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              fontSize: 'var(--fs-15)',
              color: 'var(--text)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textDecoration: 'none',
            }}
          >
            {c.name}
          </Link>
        ),
      },
      {
        label: 'Projects',
        flex: 0.8,
        render: (c) => (
          <span
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-14)',
              color: 'var(--text)',
            }}
          >
            {c.projectCount}
          </span>
        ),
      },
      {
        label: 'Status',
        flex: 0.9,
        render: (c) => (
          <Badge tone={STATUS_META[c.status].tone}>{STATUS_META[c.status].label}</Badge>
        ),
      },
      {
        label: 'Actions',
        flex: 0.9,
        align: 'flex-end',
        render: (c) => (
          <div style={{ display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>
            <IconButton
              label="Rename client"
              onClick={(event: React.MouseEvent) => {
                event.stopPropagation();
                setEditTarget(c);
              }}
              data-testid={`clients-row-${c.id}-rename-btn`}
            >
              <PencilIcon />
            </IconButton>
            {c.status === 'archived' ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  void handleRestore(c);
                }}
                data-testid={`clients-row-${c.id}-restore-btn`}
              >
                Restore
              </Button>
            ) : (
              // Archive fires the confirmation dialog inline — the row already
              // carries `activeProjectCount` so the message renders without an
              // extra fetch.
              <Button
                variant="secondary"
                size="sm"
                onClick={(event: React.MouseEvent) => {
                  event.stopPropagation();
                  setArchiveTarget(c);
                }}
                data-testid={`clients-row-${c.id}-archive-btn`}
              >
                Archive
              </Button>
            )}
          </div>
        ),
      },
    ],
    // handleRestore is stable enough; excluding it keeps deps focused on the router/orgId.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [orgId],
  );

  const isSearchMiss =
    !loading && !error && clients !== null && clients.length === 0 && debouncedQ.trim().length > 0;
  const isArchivedEmpty =
    !loading && !error && clients !== null && clients.length === 0 && filter === 'archived' && debouncedQ.trim().length === 0;
  const isFirstEmpty =
    !loading && !error && clients !== null && clients.length === 0 && filter === 'active' && debouncedQ.trim().length === 0;

  // Render nothing while the redirect effect above swaps the URL — sparing an
  // unauthorized caller a one-frame flash of the page shell.
  if (!authorized) return null;

  return (
    <div data-testid="clients-page">
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 20,
          flexWrap: 'wrap',
          marginBottom: 22,
        }}
      >
        <div>
          <h1
            data-testid="clients-page-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-27)',
              letterSpacing: '-.6px',
              margin: '0 0 5px',
              color: 'var(--text)',
            }}
          >
            Clients
          </h1>
          <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
            Group projects by who you&apos;re billing.
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreateOpen(true)}
          data-testid="clients-new-btn"
        >
          + New client
        </Button>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 'var(--sp-4)',
          marginBottom: 18,
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 180 }}>
          <Select
            value={filter}
            options={FILTER_OPTIONS}
            onChange={(value: string) => setFilter(parseClientStatusFilter(value))}
            data-testid="clients-status-filter"
          />
        </div>
        <div style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
          <SearchField
            type="search"
            placeholder="Search clients…"
            value={q}
            onChange={(event: { target: { value: string } }) => setQ(event.target.value)}
            data-testid="clients-search"
            aria-label="Search clients"
          />
        </div>
      </div>

      {/* Live-region announces the current result count for screen readers
          (spec organization/01 §Accessibility). Rendered even when empty; the
          text is visually hidden. */}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: 'absolute',
          width: 1,
          height: 1,
          overflow: 'hidden',
          clip: 'rect(0 0 0 0)',
        }}
      >
        {clients !== null ? `${clients.length} clients` : ''}
      </div>

      {loading || clients === null ? (
        <ClientsSkeleton />
      ) : error ? (
        <div data-testid="clients-error-banner">
          <InfoBanner tone="error" role="alert">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
              <span>{CLIENT_MESSAGES.errorLoad}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void load()}
                data-testid="clients-error-retry-btn"
              >
                Retry
              </Button>
            </div>
          </InfoBanner>
        </div>
      ) : isFirstEmpty ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : isSearchMiss ? (
        <InlineEmpty message={CLIENT_MESSAGES.emptySearch(debouncedQ.trim())} />
      ) : isArchivedEmpty ? (
        <InlineEmpty message={CLIENT_MESSAGES.emptyArchived} />
      ) : (
        <Table
          data-testid="clients-table"
          columns={columns}
          rows={clients.map((c) => ({
            ...c,
            testId: `clients-row-${c.id}`,
            dim: c.status === 'archived',
          }))}
        />
      )}

      <ClientModal
        open={createOpen}
        mode={{ kind: 'create' }}
        orgId={orgId}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => void load()}
      />

      <ClientModal
        open={editTarget !== null}
        mode={
          editTarget
            ? { kind: 'edit', clientId: editTarget.id, currentName: editTarget.name }
            : { kind: 'create' }
        }
        orgId={orgId}
        onClose={() => setEditTarget(null)}
        onSuccess={() => void load()}
      />

      <ArchiveClientDialog
        open={archiveTarget !== null}
        saving={archiving}
        name={archiveTarget?.name ?? ''}
        activeProjectCount={archiveTarget?.activeProjectCount ?? 0}
        onClose={() => {
          if (!archiving) setArchiveTarget(null);
        }}
        onConfirm={() => void handleArchiveConfirm()}
      />
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      data-testid="clients-empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--sp-6)',
        padding: 'var(--sp-12) var(--sp-8)',
        textAlign: 'center',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-18)',
          color: 'var(--text)',
        }}
      >
        No clients yet
      </div>
      <div style={{ fontSize: 'var(--fs-15)', color: 'var(--text-sub)', maxWidth: 420 }}>
        {CLIENT_MESSAGES.emptyState}
      </div>
      <Button variant="primary" onClick={onCreate} data-testid="clients-empty-primary-cta">
        + Add your first client
      </Button>
    </div>
  );
}

function InlineEmpty({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: 'var(--sp-8)',
        color: 'var(--text-muted)',
        fontSize: 'var(--fs-14)',
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        textAlign: 'center',
      }}
    >
      {message}
    </div>
  );
}

/** Token-only shimmering row skeleton (the app ships no primitive). */
function ClientsSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div
      data-testid="clients-loading-skeleton"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 52, background: 'var(--bg-header)' }} />
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--sp-6)',
            padding: '0 18px',
            minHeight: 62,
            borderTop: '1px solid var(--divider)',
          }}
        >
          <div style={{ ...block(180, 16), flex: 2 }} />
          <div style={{ ...block(30, 14), flex: 0.8 }} />
          <div style={{ ...block(70, 22, 20), flex: 0.9 }} />
          <div style={{ ...block(64, 32, 8), flex: 0.9 }} />
        </div>
      ))}
    </div>
  );
}

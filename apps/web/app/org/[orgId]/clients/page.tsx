'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Button,
  EmptyState,
  IconButton,
  InfoBanner,
  Preloader,
  SearchInput,
  Select,
  Table,
} from '@devscribed/ds';
import type { TableColumn } from '@devscribed/ds';
import { PencilIcon } from '@/layout/icons';
import { PageHeader } from '@/layout/PageHeader';
import { optionFor, valueOf } from '@/select';
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

/** §32's own pair — the component was written for exactly active/inactive. */
const STATUS_META: Record<ClientStatus, { status: 'active' | 'inactive'; label: string }> = {
  active: { status: 'active', label: 'Active' },
  archived: { status: 'inactive', label: 'Archived' },
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
              fontWeight: 'var(--font-weight-medium)',
              color: 'var(--text-primary)',
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
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text-primary)',
              fontVariantNumeric: 'tabular-nums',
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
          <Badge status={STATUS_META[c.status].status} size="s">
            {STATUS_META[c.status].label}
          </Badge>
        ),
      },
      {
        label: 'Actions',
        flex: 0.9,
        align: 'flex-end',
        render: (c) => (
          <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end' }}>
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
      <PageHeader
        title={<span data-testid="clients-page-title">Clients</span>}
        subtitle="Group projects by who you're billing."
        action={
          <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="clients-new-btn">
            + New client
          </Button>
        }
      />

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-5)',
          marginBottom: 'var(--space-7)',
          flexWrap: 'wrap',
          alignItems: 'center',
        }}
      >
        <div style={{ minWidth: 180 }}>
          {/* `value` is an option, never the value behind it — see the note on the
              projects list's own filter. */}
          <Select
            value={optionFor(FILTER_OPTIONS, filter)}
            options={FILTER_OPTIONS}
            onChange={(option) => setFilter(parseClientStatusFilter(valueOf(option)))}
            data-testid="clients-status-filter"
          />
        </div>
        <div style={{ flex: 1, minWidth: 220, maxWidth: 360 }}>
          <SearchInput
            placeholder="Search clients…"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            onClear={() => setQ('')}
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
        <Preloader data-testid="clients-loading" aria-label="Loading clients" />
      ) : error ? (
        <InfoBanner variant="error" role="alert" data-testid="clients-error-banner">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-5)',
            }}
          >
            <span>{CLIENT_MESSAGES.errorLoad}</span>
            <Button onClick={() => void load()} data-testid="clients-error-retry-btn">
              Retry
            </Button>
          </div>
        </InfoBanner>
      ) : isFirstEmpty ? (
        <EmptyState data-testid="clients-empty-state">
          {CLIENT_MESSAGES.emptyState}
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Button
              variant="primary"
              onClick={() => setCreateOpen(true)}
              data-testid="clients-empty-primary-cta"
            >
              + Add your first client
            </Button>
          </div>
        </EmptyState>
      ) : isSearchMiss ? (
        <EmptyState>{CLIENT_MESSAGES.emptySearch(debouncedQ.trim())}</EmptyState>
      ) : isArchivedEmpty ? (
        <EmptyState>{CLIENT_MESSAGES.emptyArchived}</EmptyState>
      ) : (
        <Table<ClientListItem>
          data-testid="clients-table"
          columns={columns}
          rows={clients}
          rowKey="id"
          rowTestId={(c) => `clients-row-${c.id}`}
          /* An archived client keeps its row's controls — `Restore` is one of them — so it is
             not in `disabledRowIds`, which takes `pointerEvents` off the whole row. The
             `Archived` badge is what says the state, exactly as on the projects list. */
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

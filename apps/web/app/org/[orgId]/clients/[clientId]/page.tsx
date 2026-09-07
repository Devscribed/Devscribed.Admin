'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { BackTo, Badge, Button, Card, EmptyState, IconButton, InfoBanner, Preloader } from '@devscribed/ds';
import { PencilIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { CLIENT_MESSAGES, can, type Role } from '@devscribed/validation';
import { ArchiveClientDialog } from '../ArchiveClientDialog';
import { ClientModal } from '../ClientModal';
import { ClientContactsSection } from './ClientContactsSection';
import type { ClientDetailResponse, ClientProjectRow, ClientSummary, ClientStatus } from '../types';

/** §32's own pair — the component was written for exactly active/inactive. */
const STATUS_META: Record<ClientStatus, { status: 'active' | 'inactive'; label: string }> = {
  active: { status: 'active', label: 'Active' },
  archived: { status: 'inactive', label: 'Archived' },
};

const DATE_FMT = new Intl.DateTimeFormat('en-US', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'ready'; client: ClientSummary; projects: ClientProjectRow[] };

/**
 * Client detail page (spec organization/01 §Detail + §Screens). Fetches the
 * detail endpoint; a 404 (`user` role, cross-org, or a stale id) redirects to
 * the Members page per Alt Flow E. Rename opens the shared `ClientModal`, archive
 * opens the `ArchiveClientDialog`, restore is a direct PATCH (no confirm — spec).
 */
export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ orgId: string; clientId: string }>;
}) {
  const { orgId, clientId } = use(params);
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();

  // Redirect an unauthorized caller to Members (spec Alt Flow E). Same target
  // as the fetch-404 branch below so both paths converge on one screen.
  const authorized = can(session.role as Role, 'manage-clients');
  useEffect(() => {
    if (!authorized) router.replace(`/org/${orgId}/members`);
  }, [authorized, router, orgId]);

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const load = useCallback(async (): Promise<void> => {
    setState({ kind: 'loading' });
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${clientId}`,
        { credentials: 'same-origin' },
      );
      if (response.status === 404) {
        // Alt Flow E: a caller who cannot see this client is bounced back to the
        // Members page rather than shown a hard error.
        router.replace(`/org/${orgId}/members`);
        return;
      }
      if (!response.ok) {
        setState({ kind: 'error' });
        return;
      }
      const data = (await response.json()) as ClientDetailResponse;
      setState({ kind: 'ready', client: data.client, projects: data.projects });
    } catch {
      setState({ kind: 'error' });
    }
  }, [orgId, clientId, router]);

  useEffect(() => {
    // Skip the fetch while the redirect effect above is swapping the URL for
    // an unauthorized caller.
    if (!authorized) return;
    void load();
  }, [authorized, load]);

  async function handleArchiveConfirm(): Promise<void> {
    if (archiving) return;
    if (state.kind !== 'ready') return;
    setArchiving(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${clientId}/archive`,
        { method: 'PATCH', credentials: 'same-origin' },
      );
      if (response.ok) {
        setArchiveOpen(false);
        setArchiving(false);
        showToast('toast-client-archived', CLIENT_MESSAGES.toastArchived);
        // Alt Flow C: after archive, redirect back to the list.
        router.push(`/org/${orgId}/clients`);
        return;
      }
      showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
    } catch {
      showToast('toast-server-error', CLIENT_MESSAGES.toastServerError, 'error');
    }
    setArchiving(false);
  }

  async function handleRestore(): Promise<void> {
    if (restoring) return;
    setRestoring(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/clients/${clientId}/restore`,
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
    setRestoring(false);
  }

  if (!authorized) return null;

  return (
    <div data-testid="client-detail-page" style={{ maxWidth: 720, margin: '0 auto' }}>
      {/* §56 — a real `href`, so the browser keeps middle-click and "copy link address", and
          the client router still gets the unmodified click. */}
      <BackTo
        label="Back to clients"
        href={`/org/${orgId}/clients`}
        data-testid="client-detail-back-link"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          router.push(`/org/${orgId}/clients`);
        }}
      />

      {state.kind === 'loading' && (
        <Preloader data-testid="client-detail-loading" aria-label="Loading client" />
      )}

      {state.kind === 'error' && (
        <InfoBanner variant="error" role="alert">
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-5)',
            }}
          >
            <span>{CLIENT_MESSAGES.errorLoad}</span>
            <Button onClick={() => void load()}>Retry</Button>
          </div>
        </InfoBanner>
      )}

      {state.kind === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {/* The client's own card. `title` is a node so the status and the rename control sit
              on the heading's line, which is §12's own title row rather than a header this
              screen draws inside the card. */}
          <Card
            title={
              <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-5)', flexWrap: 'wrap' }}>
                <span data-testid="client-detail-title">{state.client.name}</span>
                <Badge status={STATUS_META[state.client.status].status} size="s">
                  {STATUS_META[state.client.status].label}
                </Badge>
              </span>
            }
            action={
              <IconButton
                label="Rename client"
                onClick={() => setRenameOpen(true)}
                data-testid="client-detail-rename-btn"
              >
                <PencilIcon />
              </IconButton>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-secondary)' }}>
                Created {DATE_FMT.format(new Date(state.client.createdAt))} · Last updated{' '}
                {DATE_FMT.format(new Date(state.client.updatedAt))}
              </div>

              <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                {state.client.status === 'active' ? (
                  <Button onClick={() => setArchiveOpen(true)} data-testid="client-detail-archive-btn">
                    Archive
                  </Button>
                ) : (
                  <Button
                    preloader={restoring}
                    disabled={restoring}
                    onClick={() => void handleRestore()}
                    data-testid="client-detail-restore-btn"
                  >
                    Restore
                  </Button>
                )}
              </div>
            </div>
          </Card>

          {/* The roster is its own card rather than a bordered box inside the first one: a
              container drawn twice is what §43 refused on the board, and the count belongs in
              the card's title where §12 puts it. `clip` stays on — nothing here opens out. */}
          <Card title={`Projects (${state.projects.length})`} padded={false}>
            <div data-testid="client-detail-projects-list">
              {state.projects.length === 0 ? (
                <EmptyState style={{ padding: 'var(--space-8)' }}>
                  No projects linked to this client yet.
                </EmptyState>
              ) : (
                state.projects.map((project, i) => (
                  <Link
                    key={project.id}
                    href={`/org/${orgId}/projects/${project.id}`}
                    data-testid={`client-detail-project-${project.id}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-5)',
                      padding: 'var(--space-5) var(--space-7)',
                      borderTop:
                        i === 0 ? 'none' : 'var(--border-width-hairline) solid var(--border-subtle)',
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <span
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontWeight: 'var(--font-weight-medium)',
                        color: 'var(--text-primary)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {project.name}
                    </span>
                    <Badge status={STATUS_META[project.status].status} size="s">
                      {STATUS_META[project.status].label}
                    </Badge>
                  </Link>
                ))
              )}
            </div>
          </Card>

          {/* Requests spec 03 — the people at this client a request can be addressed
              to. Below the projects list, and its own read, so the client's details
              render while it loads. */}
          <ClientContactsSection
            orgId={orgId}
            clientId={clientId}
            clientArchived={state.client.status === 'archived'}
          />
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <ClientModal
            open={renameOpen}
            mode={{ kind: 'edit', clientId, currentName: state.client.name }}
            orgId={orgId}
            onClose={() => setRenameOpen(false)}
            onSuccess={() => void load()}
          />
          <ArchiveClientDialog
            open={archiveOpen}
            saving={archiving}
            name={state.client.name}
            activeProjectCount={state.projects.filter((p) => p.status === 'active').length}
            onClose={() => {
              if (!archiving) setArchiveOpen(false);
            }}
            onConfirm={() => void handleArchiveConfirm()}
          />
        </>
      )}
    </div>
  );
}

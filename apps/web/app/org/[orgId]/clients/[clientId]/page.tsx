'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, IconButton, InfoBanner } from '@/ds';
import { PencilIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { CLIENT_MESSAGES, can, type Role } from '@devscribed/validation';
import { ArchiveClientDialog } from '../ArchiveClientDialog';
import { ClientModal } from '../ClientModal';
import type { ClientDetailResponse, ClientProjectRow, ClientSummary, ClientStatus } from '../types';

const STATUS_META: Record<ClientStatus, { tone: 'active' | 'inactive'; label: string }> = {
  active: { tone: 'active', label: 'Active' },
  archived: { tone: 'inactive', label: 'Archived' },
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
      <Link
        href={`/org/${orgId}/clients`}
        data-testid="client-detail-back-link"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: 'var(--fs-14)',
          color: 'var(--accent)',
          textDecoration: 'none',
          marginBottom: 'var(--sp-8)',
        }}
      >
        <span aria-hidden style={{ fontSize: 18, lineHeight: 1 }}>
          &#8592;
        </span>
        Back to clients
      </Link>

      {state.kind === 'loading' && <DetailSkeleton />}

      {state.kind === 'error' && (
        <InfoBanner tone="error" role="alert">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
            <span>{CLIENT_MESSAGES.errorLoad}</span>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              Retry
            </Button>
          </div>
        </InfoBanner>
      )}

      {state.kind === 'ready' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
            {/* Header — title + status + meta line */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', flexWrap: 'wrap' }}>
                <h1
                  data-testid="client-detail-title"
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 'var(--fs-24)',
                    letterSpacing: '-.4px',
                    color: 'var(--text)',
                    margin: 0,
                  }}
                >
                  {state.client.name}
                </h1>
                <Badge tone={STATUS_META[state.client.status].tone}>
                  {STATUS_META[state.client.status].label}
                </Badge>
                <IconButton
                  label="Rename client"
                  onClick={() => setRenameOpen(true)}
                  data-testid="client-detail-rename-btn"
                >
                  <PencilIcon />
                </IconButton>
              </div>
              <div style={{ fontSize: 'var(--fs-13)', color: 'var(--text-muted)' }}>
                Created {DATE_FMT.format(new Date(state.client.createdAt))} · Last updated{' '}
                {DATE_FMT.format(new Date(state.client.updatedAt))}
              </div>
            </div>

            {/* Actions row */}
            <div style={{ display: 'flex', gap: 'var(--sp-3)' }}>
              {state.client.status === 'active' ? (
                <Button
                  variant="secondary"
                  onClick={() => setArchiveOpen(true)}
                  data-testid="client-detail-archive-btn"
                >
                  Archive
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={restoring}
                  onClick={() => void handleRestore()}
                  data-testid="client-detail-restore-btn"
                >
                  Restore
                </Button>
              )}
            </div>

            {/* Projects section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-16)',
                  color: 'var(--text)',
                  margin: 0,
                }}
              >
                Projects ({state.projects.length})
              </h2>
              <div
                data-testid="client-detail-projects-list"
                style={{
                  border: '1px solid var(--divider)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                }}
              >
                {state.projects.length === 0 ? (
                  <div style={{ padding: 'var(--sp-8)', color: 'var(--text-faint)', fontSize: 'var(--fs-14)' }}>
                    No projects linked to this client yet.
                  </div>
                ) : (
                  state.projects.map((project, i) => (
                    <Link
                      key={project.id}
                      href={`/org/${orgId}/projects/${project.id}`}
                      data-testid={`client-detail-project-${project.id}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-4)',
                        padding: '12px 14px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--divider)',
                        textDecoration: 'none',
                        color: 'inherit',
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          minWidth: 0,
                          fontFamily: 'var(--font-display)',
                          fontWeight: 500,
                          fontSize: 'var(--fs-14)',
                          color: 'var(--text)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {project.name}
                      </span>
                      <Badge tone={STATUS_META[project.status].tone}>
                        {STATUS_META[project.status].label}
                      </Badge>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </Card>
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

function DetailSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <div style={block(200, 24)} />
          <div style={block(64, 22, 20)} />
        </div>
        <div style={block(280, 14)} />
        <div style={block('100%', 46)} />
        <div style={block('100%', 46)} />
      </div>
    </Card>
  );
}

'use client';

import Link from 'next/link';
import { notFound, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, IconButton } from '@/ds';
import { PencilIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import { PROJECT_MESSAGES, can, type Role } from '@devscribed/validation';
import { AvatarInitials } from '../../members/[memberId]/AvatarInitials';
import { ProjectModal } from '../ProjectModal';
import type {
  ProjectListItem,
  ProjectMember,
  ProjectMembersResponse,
  ProjectStatus,
  ProjectsResponse,
} from '../types';
import { AddMembersModal } from './AddMembersModal';
import { ArchiveConfirmDialog } from './ArchiveConfirmDialog';

const STATUS_META: Record<ProjectStatus, { tone: 'active' | 'inactive'; label: string }> = {
  active: { tone: 'active', label: 'Active' },
  archived: { tone: 'inactive', label: 'Archived' },
};

type ScreenState =
  | { kind: 'loading' }
  | { kind: 'notfound' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; project: ProjectListItem; members: ProjectMember[] };

/** First + last initial of a roster member. */
function initialsOf(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Project detail screen (spec 11). Role-gated like the list. The project header
 * (name/status/hours/createdAt) is derived from the list endpoint (`?status=all` then
 * find by id — which 404s correctly for a cross-org id); the roster comes from
 * `GET .../projects/{id}/members`. Every mutation refetches from the server.
 */
export function ProjectDetailScreen({ orgId, projectId }: { orgId: string; projectId: string }) {
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();

  if (!can(session.role as Role, 'manage-projects')) notFound();

  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  const [editOpen, setEditOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [projectsRes, membersRes] = await Promise.all([
        fetch(`/api/organizations/${orgId}/projects?status=all`, { credentials: 'same-origin' }),
        fetch(`/api/organizations/${orgId}/projects/${projectId}/members`, {
          credentials: 'same-origin',
        }),
      ]);

      // A cross-org or missing id 404s the members endpoint; the header lookup fails to
      // find the row too — either way the project "does not exist" for this caller.
      if (membersRes.status === 404) {
        setState({ kind: 'notfound' });
        return;
      }
      if (!projectsRes.ok || !membersRes.ok) {
        setState({ kind: 'error', message: PROJECT_MESSAGES.genericError });
        return;
      }

      const projectsData = (await projectsRes.json()) as ProjectsResponse;
      const project = projectsData.projects.find((p) => p.id === projectId);
      if (!project) {
        setState({ kind: 'notfound' });
        return;
      }
      const membersData = (await membersRes.json()) as ProjectMembersResponse;
      setState({ kind: 'ready', project, members: membersData.members });
    } catch {
      setState({ kind: 'error', message: PROJECT_MESSAGES.genericError });
    }
  }, [orgId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRemove(member: ProjectMember): Promise<void> {
    if (removingId) return;
    setRemovingId(member.membershipId);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/members/${member.membershipId}`,
        { method: 'DELETE', credentials: 'same-origin' },
      );
      if (response.ok) {
        showToast('toast-member-removed', PROJECT_MESSAGES.toastMemberRemoved);
        await load();
      } else {
        const body = await response.json().catch(() => null);
        showToast('toast-member-removed', body?.message ?? PROJECT_MESSAGES.genericError, 'error');
      }
    } catch {
      showToast('toast-member-removed', PROJECT_MESSAGES.genericError, 'error');
    }
    setRemovingId(null);
  }

  async function handleArchiveConfirm(): Promise<void> {
    if (archiving) return;
    setArchiving(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/projects/${projectId}/archive`, {
        method: 'PATCH',
        credentials: 'same-origin',
      });
      if (response.ok) {
        setArchiveOpen(false);
        setArchiving(false);
        showToast('toast-project-archived', PROJECT_MESSAGES.toastArchived);
        router.push(`/org/${orgId}/projects`);
        return;
      }
      const body = await response.json().catch(() => null);
      showToast('toast-project-archived', body?.message ?? PROJECT_MESSAGES.genericError, 'error');
    } catch {
      showToast('toast-project-archived', PROJECT_MESSAGES.genericError, 'error');
    }
    setArchiving(false);
  }

  async function handleRestore(): Promise<void> {
    if (restoring) return;
    setRestoring(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/projects/${projectId}/restore`, {
        method: 'PATCH',
        credentials: 'same-origin',
      });
      if (response.ok) {
        showToast('toast-project-restored', PROJECT_MESSAGES.toastRestored);
        await load();
      } else {
        const body = await response.json().catch(() => null);
        showToast('toast-project-restored', body?.message ?? PROJECT_MESSAGES.genericError, 'error');
      }
    } catch {
      showToast('toast-project-restored', PROJECT_MESSAGES.genericError, 'error');
    }
    setRestoring(false);
  }

  if (state.kind === 'notfound') notFound();

  return (
    <div data-testid="project-detail-page" style={{ maxWidth: 640, margin: '0 auto' }}>
      <Link
        href={`/org/${orgId}/projects`}
        data-testid="project-back-link"
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
        Back to projects
      </Link>

      {state.kind === 'loading' && <DetailSkeleton />}

      {state.kind === 'error' && (
        <div
          data-testid="project-detail-error"
          style={{ padding: 'var(--sp-12) 0', color: 'var(--text-muted)', fontSize: 'var(--fs-15)' }}
        >
          {state.message}
        </div>
      )}

      {state.kind === 'ready' && (
        <Card>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-10)' }}>
            {/* Title row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)', minWidth: 0 }}>
              <h1
                data-testid="project-detail-name"
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-22)',
                  letterSpacing: '-.4px',
                  color: 'var(--text)',
                  margin: 0,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {state.project.name}
              </h1>
              <Badge
                tone={STATUS_META[state.project.status].tone}
                data-testid="project-status-badge"
              >
                {STATUS_META[state.project.status].label}
              </Badge>
              <IconButton
                label="Rename project"
                onClick={() => setEditOpen(true)}
                data-testid="project-edit-name-btn"
              >
                <PencilIcon />
              </IconButton>
            </div>

            {/* Members section */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-4)' }}>
                <h2
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontWeight: 600,
                    fontSize: 'var(--fs-16)',
                    color: 'var(--text)',
                    margin: 0,
                  }}
                >
                  Members ({state.members.length})
                </h2>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setAddOpen(true)}
                  data-testid="project-add-member-btn"
                >
                  + Add member
                </Button>
              </div>

              <div
                data-testid="project-members-list"
                style={{
                  border: '1px solid var(--divider)',
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                }}
              >
                {state.members.length === 0 ? (
                  <div style={{ padding: 'var(--sp-8)', color: 'var(--text-faint)', fontSize: 'var(--fs-14)' }}>
                    No members assigned yet
                  </div>
                ) : (
                  state.members.map((m, i) => (
                    <div
                      key={m.membershipId}
                      data-testid={`project-member-row-${m.membershipId}`}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--sp-4)',
                        padding: '12px 14px',
                        borderTop: i === 0 ? 'none' : '1px solid var(--divider)',
                      }}
                    >
                      <AvatarInitials
                        fullName={`${m.firstName} ${m.lastName}`}
                        initials={initialsOf(m.firstName, m.lastName)}
                        size={32}
                        data-testid={`project-member-avatar-${m.membershipId}`}
                      />
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
                        {m.firstName} {m.lastName}
                      </span>
                      <Badge tone="info" dot={false} outline style={{ textTransform: 'capitalize' }}>
                        {m.role}
                      </Badge>
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={removingId === m.membershipId}
                        disabled={removingId !== null && removingId !== m.membershipId}
                        onClick={() => void handleRemove(m)}
                        data-testid={`project-member-remove-${m.membershipId}`}
                      >
                        Remove
                      </Button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Statistics — two backed tiles only (Total hours, Created); the design's
                "This month" tile has no API field and is deferred. */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-5)' }}>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: 'var(--fs-16)',
                  color: 'var(--text)',
                  margin: 0,
                }}
              >
                Statistics
              </h2>
              <div
                style={{
                  display: 'flex',
                  gap: 'var(--sp-6)',
                  background: 'var(--bg-sunken)',
                  borderRadius: 'var(--radius-lg)',
                  padding: 'var(--sp-6)',
                }}
              >
                <StatTile label="Total hours" value={`${state.project.totalHours} h`} testId="project-stat-total-hours" />
                <StatTile label="Created" value={formatDate(state.project.createdAt)} testId="project-stat-created" />
              </div>
            </div>

            {/* Status / archive line */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                paddingTop: 'var(--sp-6)',
                borderTop: '1px solid var(--divider)',
              }}
            >
              {state.project.status === 'active' ? (
                <Button
                  variant="secondary"
                  onClick={() => setArchiveOpen(true)}
                  data-testid="project-archive-btn"
                >
                  Archive
                </Button>
              ) : (
                <Button
                  variant="secondary"
                  loading={restoring}
                  onClick={() => void handleRestore()}
                  data-testid="project-restore-btn"
                >
                  Restore
                </Button>
              )}
            </div>
          </div>
        </Card>
      )}

      {state.kind === 'ready' && (
        <>
          <ProjectModal
            open={editOpen}
            mode={{ kind: 'edit', projectId, currentName: state.project.name }}
            orgId={orgId}
            onClose={() => setEditOpen(false)}
            onSaved={() => void load()}
          />
          <AddMembersModal
            open={addOpen}
            orgId={orgId}
            projectId={projectId}
            assignedIds={new Set(state.members.map((m) => m.membershipId))}
            onClose={() => setAddOpen(false)}
            onAdded={() => void load()}
          />
          <ArchiveConfirmDialog
            open={archiveOpen}
            saving={archiving}
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

function StatTile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div data-testid={testId} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-11)',
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 600,
          fontSize: 'var(--fs-24)',
          color: 'var(--text)',
        }}
      >
        {value}
      </span>
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
      <div data-testid="project-detail-loading-skeleton" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-4)' }}>
          <div style={block(200, 24)} />
          <div style={block(64, 22, 20)} />
        </div>
        <div style={block('100%', 46)} />
        <div style={block('100%', 46)} />
        <div style={block('60%', 60)} />
      </div>
    </Card>
  );
}

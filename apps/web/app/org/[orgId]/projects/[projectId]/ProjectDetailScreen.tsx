'use client';

import { notFound, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  Avatar,
  BackTo,
  Badge,
  Button,
  Card,
  EmptyState,
  fieldLabelStyle,
  IconButton,
  Preloader,
  TextInput,
} from '@devscribed/ds';
import { PencilIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  KANBAN_MESSAGES,
  PROJECT_MESSAGES,
  can,
  validateProjectKey,
  type Role,
} from '@devscribed/validation';
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

/** §32's own pair. */
const STATUS_META: Record<ProjectStatus, { status: 'active' | 'inactive'; label: string }> = {
  active: { status: 'active', label: 'Active' },
  archived: { status: 'inactive', label: 'Archived' },
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

  // Spec 13 — inline "Add Key" affordance: expands into an Input + Save/Cancel.
  const [addingKey, setAddingKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState('');
  const [keyError, setKeyError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState(false);

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

  async function saveProjectKey(event?: FormEvent): Promise<void> {
    if (event) event.preventDefault();
    if (savingKey) return;
    if (state.kind !== 'ready') return;
    const result = validateProjectKey(keyDraft);
    if (!result.valid) {
      setKeyError(result.error);
      return;
    }
    setKeyError(null);
    setSavingKey(true);
    try {
      const response = await fetch(`/api/organizations/${orgId}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name: state.project.name, key: result.value }),
      });
      if (response.ok) {
        showToast('toast-project-updated', PROJECT_MESSAGES.toastUpdated);
        setAddingKey(false);
        setKeyDraft('');
        await load();
      } else {
        const body = await response.json().catch(() => null);
        if (response.status === 409 || body?.error === 'key_duplicate') {
          setKeyError(KANBAN_MESSAGES.projectKeyDuplicate);
        } else if (body?.errors?.key) {
          setKeyError(body.errors.key);
        } else if (body?.error === 'key_immutable') {
          setKeyError(KANBAN_MESSAGES.projectKeyImmutable);
        } else {
          showToast('toast-project-updated', body?.message ?? PROJECT_MESSAGES.genericError, 'error');
        }
      }
    } catch {
      showToast('toast-project-updated', PROJECT_MESSAGES.genericError, 'error');
    }
    setSavingKey(false);
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
      <BackTo
        label="Back to projects"
        href={`/org/${orgId}/projects`}
        data-testid="project-back-link"
        onClick={(event) => {
          if (event.metaKey || event.ctrlKey || event.shiftKey) return;
          event.preventDefault();
          router.push(`/org/${orgId}/projects`);
        }}
      />

      {state.kind === 'loading' && (
        <Preloader data-testid="project-detail-loading" aria-label="Loading project" />
      )}

      {state.kind === 'error' && (
        <EmptyState data-testid="project-detail-error">{state.message}</EmptyState>
      )}

      {state.kind === 'ready' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
          {/* The header is `Card`'s own title row (§12) rather than a heading this screen
              draws inside a card: the name, the key, the status and the rename control are
              one line, which is what `title` and `action` are for. */}
          <Card
            title={
              <span
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-5)',
                  minWidth: 0,
                  flexWrap: 'wrap',
                }}
              >
                <span
                  data-testid="project-detail-name"
                  style={{
                    minWidth: 0,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {state.project.name}
                </span>
                {state.project.key ? (
                  <span
                    data-testid="project-key-badge"
                    style={{
                      /* §77's literal half — a key is copied and typed, not compared. */
                      fontFamily: 'var(--font-family-mono)',
                      fontSize: 'var(--font-size-xs)',
                      fontWeight: 'var(--font-weight-regular)',
                      color: 'var(--text-secondary)',
                      background: 'var(--surface-sunken)',
                      borderRadius: 'var(--radius-s)',
                      padding: 'var(--space-1) var(--space-4)',
                    }}
                  >
                    {state.project.key}
                  </span>
                ) : addingKey ? (
                  <form
                    onSubmit={saveProjectKey}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 'var(--space-3)' }}
                  >
                    <TextInput
                      autoFocus
                      value={keyDraft}
                      onChange={(event) => {
                        setKeyDraft(event.target.value.toUpperCase());
                        if (keyError) setKeyError(null);
                      }}
                      placeholder="e.g. MOB"
                      aria-label="Project key"
                      data-testid="project-key-input"
                      error={keyError ?? undefined}
                      errorId="field-error-projectKey"
                      wrapperStyle={{ width: 140 }}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      preloader={savingKey}
                      data-testid="project-key-save-btn"
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      disabled={savingKey}
                      onClick={() => {
                        setAddingKey(false);
                        setKeyDraft('');
                        setKeyError(null);
                      }}
                      data-testid="project-key-cancel-btn"
                    >
                      Cancel
                    </Button>
                  </form>
                ) : (
                  <Button
                    onClick={() => {
                      setAddingKey(true);
                      setKeyDraft('');
                      setKeyError(null);
                    }}
                    data-testid="project-add-key-btn"
                  >
                    Add Key
                  </Button>
                )}
                <Badge
                  status={STATUS_META[state.project.status].status}
                  size="s"
                  data-testid="project-status-badge"
                >
                  {STATUS_META[state.project.status].label}
                </Badge>
              </span>
            }
            action={
              <IconButton
                label="Rename project"
                onClick={() => setEditOpen(true)}
                data-testid="project-edit-name-btn"
              >
                <PencilIcon />
              </IconButton>
            }
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
              {/* Client label (spec organization/01 §UI, TC-01-E2E-01). Rendered
                  only when a client is linked; omitted when null so the header
                  stays compact. */}
              {state.project.clientName ? (
                <div
                  data-testid="project-detail-client-label"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  Client:{' '}
                  <span
                    style={{
                      color: 'var(--text-primary)',
                      fontWeight: 'var(--font-weight-medium)',
                    }}
                  >
                    {state.project.clientName}
                  </span>
                </div>
              ) : null}

              {/* Board / List. These go to two routes, so they are links wearing a control's
                  paint — §38's `as="a"`, which keeps middle-click and open-in-new-tab. They
                  are deliberately not `PageTabs` (§45): a tab selects a panel on this page,
                  and neither of these is on this page. */}
              {state.project.key && (
                <div style={{ display: 'flex', gap: 'var(--space-4)' }}>
                  <Button
                    as="a"
                    href={`/org/${orgId}/projects/${projectId}/board`}
                    data-testid="project-board-tab"
                  >
                    Board
                  </Button>
                  <Button
                    as="a"
                    href={`/org/${orgId}/projects/${projectId}/list`}
                    data-testid="project-list-tab"
                  >
                    List
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {/* The roster is its own card. `padded={false}` lets the rows run to the card's
              edge, which is what makes them read as a list rather than as a block of text. */}
          <Card
            title={`Members (${state.members.length})`}
            action={
              <Button onClick={() => setAddOpen(true)} data-testid="project-add-member-btn">
                + Add member
              </Button>
            }
            padded={false}
          >
            <div data-testid="project-members-list">
              {state.members.length === 0 ? (
                <EmptyState style={{ padding: 'var(--space-8)' }}>
                  No members assigned yet
                </EmptyState>
              ) : (
                state.members.map((m, i) => (
                  <div
                    key={m.membershipId}
                    data-testid={`project-member-row-${m.membershipId}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-5)',
                      padding: 'var(--space-5) var(--space-7)',
                      borderTop:
                        i === 0
                          ? 'none'
                          : 'var(--border-width-hairline) solid var(--border-subtle)',
                    }}
                  >
                    {/* The name is written beside the mark, so §93 takes it back out of the
                        tree rather than announcing the same person twice. */}
                    <Avatar
                      name={`${m.firstName} ${m.lastName}`}
                      initials={initialsOf(m.firstName, m.lastName)}
                      size={32}
                      decorative
                      data-testid={`project-member-avatar-${m.membershipId}`}
                    />
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
                      {m.firstName} {m.lastName}
                    </span>
                    {/* §59 — a role is a label on a person, not a status about them. The
                        members list settled this tone; the roster follows it. */}
                    <Badge status="neutral" size="s" outlined style={{ textTransform: 'capitalize' }}>
                      {m.role}
                    </Badge>
                    <Button
                      preloader={removingId === m.membershipId}
                      disabled={removingId !== null}
                      onClick={() => void handleRemove(m)}
                      data-testid={`project-member-remove-${m.membershipId}`}
                    >
                      Remove
                    </Button>
                  </div>
                ))
              )}
            </div>
          </Card>

          {/* Statistics — two backed tiles only (Total hours, Created); the design's
              "This month" tile has no API field and is deferred. */}
          <Card title="Statistics">
            <div
              style={{
                display: 'flex',
                gap: 'var(--space-9)',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-l)',
                padding: 'var(--space-7)',
              }}
            >
              <StatTile
                label="Total hours"
                value={`${state.project.totalHours} h`}
                testId="project-stat-total-hours"
              />
              <StatTile
                label="Created"
                value={formatDate(state.project.createdAt)}
                testId="project-stat-created"
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 'var(--space-8)' }}>
              {state.project.status === 'active' ? (
                <Button onClick={() => setArchiveOpen(true)} data-testid="project-archive-btn">
                  Archive
                </Button>
              ) : (
                <Button
                  preloader={restoring}
                  disabled={restoring}
                  onClick={() => void handleRestore()}
                  data-testid="project-restore-btn"
                >
                  Restore
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <ProjectModal
            open={editOpen}
            mode={{
              kind: 'edit',
              projectId,
              currentName: state.project.name,
              currentClientId: state.project.clientId,
            }}
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

/**
 * One statistic: a micro-label over a value.
 *
 * The label takes `fieldLabelStyle` (§74) — the exported treatment, because this is a caption
 * on a figure rather than a `<label>` for a control. That is where the first migration sent
 * every uppercase micro-cap, and it takes the last of this screen's letter-spacing with it.
 */
function StatTile({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}
    >
      <span style={fieldLabelStyle}>{label}</span>
      <span
        style={{
          fontSize: 'var(--font-size-xl)',
          fontWeight: 'var(--font-weight-semibold)',
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {value}
      </span>
    </div>
  );
}

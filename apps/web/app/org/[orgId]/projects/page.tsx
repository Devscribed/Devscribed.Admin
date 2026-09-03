'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, EmptyState, IconButton, Preloader, Select, Table } from '@devscribed/ds';
import type { TableColumn } from '@devscribed/ds';
import { PencilIcon } from '@/layout/icons';
import { PageHeader } from '@/layout/PageHeader';
import { optionFor, valueOf } from '@/select';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  PROJECT_MESSAGES,
  can,
  parseProjectStatusFilter,
  type ProjectStatusFilter,
  type Role,
} from '@devscribed/validation';
import { AvatarStack } from './AvatarStack';
import { ProjectModal } from './ProjectModal';
import type { ProjectListItem, ProjectStatus, ProjectsResponse, ProjectSummary } from './types';

const FILTER_OPTIONS: { value: ProjectStatusFilter; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'archived', label: 'Archived' },
  { value: 'all', label: 'All' },
];

/**
 * Status → `Badge` (§32), which is written for exactly this pair. Both tones carry text, so
 * the state is never colour alone.
 */
const STATUS_META: Record<ProjectStatus, { status: 'active' | 'inactive'; label: string }> = {
  active: { status: 'active', label: 'Active' },
  archived: { status: 'inactive', label: 'Archived' },
};

/**
 * Projects list page (spec 11). A role-gated admin/manager surface: the full project
 * list with a status filter, create/rename modals, and inline restore. `user`/`viewer`
 * hit `notFound()` — the sidebar row was already omitted for them; this covers direct
 * navigation, and the API's 403/404 is the real boundary.
 *
 * The list is never hand-patched: every mutation refetches from the server (the filtered
 * view is authoritative), matching the members-page discipline.
 */
export default function ProjectsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const router = useRouter();
  const session = useSession();
  const { showToast } = useToast();

  if (!can(session.role as Role, 'manage-projects')) notFound();

  const [filter, setFilter] = useState<ProjectStatusFilter>('active');
  const [projects, setProjects] = useState<ProjectListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProjectListItem | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      setLoading(true);
      try {
        const response = await fetch(
          `/api/organizations/${orgId}/projects?status=${parseProjectStatusFilter(filter)}`,
          { credentials: 'same-origin', signal },
        );
        if (signal?.aborted) return;
        if (response.ok) {
          const data = (await response.json()) as ProjectsResponse;
          if (signal?.aborted) return;
          setProjects(data.projects);
        } else {
          setProjects([]);
          showToast('toast-projects-error', PROJECT_MESSAGES.genericError, 'error');
        }
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return;
        setProjects([]);
        showToast('toast-projects-error', PROJECT_MESSAGES.genericError, 'error');
      }
      if (signal?.aborted) return;
      setLoading(false);
    },
    [orgId, filter, showToast],
  );

  useEffect(() => {
    // Cancel the previous in-flight fetch when the filter changes so its late reply
    // can't clobber the newer one (a race that shows up under slower CI compile times).
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function handleRestore(project: ProjectListItem): Promise<void> {
    if (restoringId) return;
    setRestoringId(project.id);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${project.id}/restore`,
        { method: 'PATCH', credentials: 'same-origin' },
      );
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
    setRestoringId(null);
  }

  function handleCreated(project: ProjectSummary): void {
    router.push(`/org/${orgId}/projects/${project.id}`);
  }

  const columns: TableColumn<ProjectListItem>[] = [
    {
      label: 'Name',
      flex: 2,
      render: (p) => (
        <span
          style={{
            fontWeight: 'var(--font-weight-medium)',
            color: 'var(--text-primary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {p.name}
        </span>
      ),
    },
    {
      // Client column (spec organization/01) — read-only surface even for `user`,
      // who never sees the Clients page itself. Empty link renders as an em-dash.
      label: 'Client',
      flex: 1.2,
      render: (p) => (
        <span
          data-testid={`projects-row-${p.id}-client`}
          style={{
            color: p.clientName ? 'var(--text-primary)' : 'var(--text-tertiary)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {p.clientName ?? '—'}
        </span>
      ),
    },
    {
      label: 'Members',
      flex: 1.3,
      render: (p) => <AvatarStack count={p.memberCount} members={p.memberPreview} />,
    },
    {
      label: 'Hours logged',
      flex: 1,
      align: 'flex-end',
      render: (p) => (
        <span
          style={{
            fontWeight: 'var(--font-weight-semibold)',
            color: 'var(--text-primary)',
            /* A total in a column of totals: the figures line up because the digits are one
               width, which is what Phase 2 settled for every number in this product. A
               second family would say this one is code. */
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {p.totalHours} h
        </span>
      ),
    },
    {
      label: 'Status',
      flex: 0.9,
      render: (p) => (
        <Badge status={STATUS_META[p.status].status} size="s">
          {STATUS_META[p.status].label}
        </Badge>
      ),
    },
    {
      label: 'Actions',
      flex: 0.7,
      align: 'flex-end',
      render: (p) =>
        p.status === 'archived' ? (
          <Button
            preloader={restoringId === p.id}
            disabled={restoringId !== null}
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              void handleRestore(p);
            }}
            data-testid={`projects-restore-${p.id}`}
          >
            Restore
          </Button>
        ) : (
          <IconButton
            label="Rename project"
            onClick={(event: React.MouseEvent) => {
              event.stopPropagation();
              setEditTarget(p);
            }}
            data-testid={`projects-edit-${p.id}`}
          >
            <PencilIcon />
          </IconButton>
        ),
    },
  ];

  return (
    <div data-testid="projects-page">
      <PageHeader
        title={<span data-testid="projects-page-title">Projects</span>}
        subtitle="Manage projects and assign members. Assignment controls who can log time."
        action={
          <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="projects-new-btn">
            + New project
          </Button>
        }
      />

      <div style={{ marginBottom: 'var(--space-7)', maxWidth: 200 }}>
        {/* `value` takes an **option**, not the value behind it: a bare string is a legal
            option whose label is itself, so binding the filter directly would draw `active`
            where the list says `Active`. `optionFor` is the crossing. */}
        <Select
          value={optionFor(FILTER_OPTIONS, filter)}
          options={FILTER_OPTIONS}
          onChange={(option) => setFilter(parseProjectStatusFilter(valueOf(option)))}
          data-testid="projects-status-filter"
        />
      </div>

      {loading || projects === null ? (
        <Preloader data-testid="projects-loading" aria-label="Loading projects" />
      ) : projects.length === 0 ? (
        <EmptyState data-testid="projects-empty-state">
          {PROJECT_MESSAGES.emptyState}
          <div style={{ marginTop: 'var(--space-6)' }}>
            <Button variant="primary" onClick={() => setCreateOpen(true)} data-testid="projects-empty-new-btn">
              + New project
            </Button>
          </div>
        </EmptyState>
      ) : (
        <Table<ProjectListItem>
          data-testid="projects-table"
          columns={columns}
          rows={projects}
          rowKey="id"
          rowTestId={(p) => `projects-row-${p.id}`}
          /* An archived project is **not** in `disabledRowIds`, though the system offers it:
             `Restore` lives on the row, and a greyed row takes `pointerEvents: none` with the
             control inside it. That is the members list's argument (a removed member's card is
             still the place a restore is decided from) arriving on a project, and the
             `Archived` badge is what says the state. */
          onRowClick={(row) => router.push(`/org/${orgId}/projects/${row.id}`)}
        />
      )}

      <ProjectModal
        open={createOpen}
        mode={{ kind: 'create' }}
        orgId={orgId}
        onClose={() => setCreateOpen(false)}
        onCreated={handleCreated}
      />

      <ProjectModal
        open={editTarget !== null}
        mode={
          editTarget
            ? {
                kind: 'edit',
                projectId: editTarget.id,
                currentName: editTarget.name,
                currentClientId: editTarget.clientId,
              }
            : { kind: 'create' }
        }
        orgId={orgId}
        onClose={() => setEditTarget(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

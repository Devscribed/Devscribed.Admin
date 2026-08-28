'use client';

import { notFound, useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { Badge, Button, IconButton, Select, Table } from '@/ds';
import type { TableColumn } from '@ds/components/data/Table';
import { PencilIcon } from '@/layout/icons';
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

/** Status → DS `Badge` tone + label. Active reuses the green "active" tone, archived the
 * grey "inactive" tone — both carry dot + text so status is never colour-only. */
const STATUS_META: Record<ProjectStatus, { tone: 'active' | 'inactive'; label: string }> = {
  active: { tone: 'active', label: 'Active' },
  archived: { tone: 'inactive', label: 'Archived' },
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

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects?status=${parseProjectStatusFilter(filter)}`,
        { credentials: 'same-origin' },
      );
      if (response.ok) {
        const data = (await response.json()) as ProjectsResponse;
        setProjects(data.projects);
      } else {
        setProjects([]);
        showToast('toast-projects-error', PROJECT_MESSAGES.genericError, 'error');
      }
    } catch {
      setProjects([]);
      showToast('toast-projects-error', PROJECT_MESSAGES.genericError, 'error');
    }
    setLoading(false);
  }, [orgId, filter, showToast]);

  useEffect(() => {
    void load();
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
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: 'var(--fs-15)',
            color: 'var(--text)',
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
      label: 'Members',
      flex: 1.3,
      render: (p) => <AvatarStack count={p.memberCount} />,
    },
    {
      label: 'Hours logged',
      flex: 1,
      align: 'flex-end',
      mono: true,
      render: (p) => (
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 'var(--fs-14)' }}>
          {p.totalHours} h
        </span>
      ),
    },
    {
      label: 'Status',
      flex: 0.9,
      render: (p) => (
        <Badge tone={STATUS_META[p.status].tone}>{STATUS_META[p.status].label}</Badge>
      ),
    },
    {
      label: 'Actions',
      flex: 0.7,
      align: 'flex-end',
      render: (p) =>
        p.status === 'archived' ? (
          <Button
            variant="secondary"
            size="sm"
            loading={restoringId === p.id}
            disabled={restoringId !== null && restoringId !== p.id}
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
      {/* Page header (own testid on the h1 per the spec's roster, distinct from the
          shell's `page-title`). */}
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
            data-testid="projects-page-title"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: 'var(--fs-27)',
              letterSpacing: '-.6px',
              margin: '0 0 5px',
              color: 'var(--text)',
            }}
          >
            Projects
          </h1>
          <div style={{ fontSize: 'var(--fs-14)', color: 'var(--text-sub)' }}>
            Manage projects and assign members. Assignment controls who can log time.
          </div>
        </div>
        <Button
          variant="primary"
          onClick={() => setCreateOpen(true)}
          data-testid="projects-new-btn"
        >
          + New project
        </Button>
      </div>

      <div style={{ marginBottom: 18, maxWidth: 200 }}>
        <Select
          value={filter}
          options={FILTER_OPTIONS}
          onChange={(value) => setFilter(parseProjectStatusFilter(value))}
          data-testid="projects-status-filter"
        />
      </div>

      {loading || projects === null ? (
        <ProjectsSkeleton />
      ) : projects.length === 0 ? (
        <EmptyState onCreate={() => setCreateOpen(true)} />
      ) : (
        <Table
          data-testid="projects-table"
          columns={columns}
          rows={projects.map((p) => ({
            ...p,
            testId: `projects-row-${p.id}`,
            dim: p.status === 'archived',
          }))}
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
            ? { kind: 'edit', projectId: editTarget.id, currentName: editTarget.name }
            : { kind: 'create' }
        }
        orgId={orgId}
        onClose={() => setEditTarget(null)}
        onSaved={() => void load()}
      />
    </div>
  );
}

/** Centered empty-state panel — the business spec's verbatim string + a create button. */
function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div
      data-testid="projects-empty-state"
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
        No projects yet
      </div>
      <div style={{ fontSize: 'var(--fs-15)', color: 'var(--text-sub)', maxWidth: 420 }}>
        {PROJECT_MESSAGES.emptyState}
      </div>
      <Button variant="primary" onClick={onCreate} data-testid="projects-empty-new-btn">
        + New project
      </Button>
    </div>
  );
}

/** Static token-colored table-shaped blocks — the app ships no skeleton primitive
 * (carried gap from 04/05/09/10). */
function ProjectsSkeleton() {
  const block = (w: number | string, h: number, radius = 8): React.CSSProperties => ({
    width: w,
    height: h,
    borderRadius: radius,
    background: 'var(--bg-sunken)',
  });
  return (
    <div
      data-testid="projects-loading-skeleton"
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflow: 'hidden',
      }}
    >
      <div style={{ height: 52, background: 'var(--bg-header)' }} />
      {[0, 1, 2].map((i) => (
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
          <div style={{ ...block(160, 16), flex: 2 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1.3 }}>
            <div style={block(26, 26, 20)} />
            <div style={block(70, 12)} />
          </div>
          <div style={{ ...block(50, 14), flex: 1 }} />
          <div style={{ ...block(64, 22, 20), flex: 0.9 }} />
          <div style={{ ...block(34, 34, 8), flex: 0.7 }} />
        </div>
      ))}
    </div>
  );
}

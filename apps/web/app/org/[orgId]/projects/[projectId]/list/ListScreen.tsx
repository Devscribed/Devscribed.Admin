'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InfoBanner, SearchField, Select, Spinner } from '@/ds';
import { PlusIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import {
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  TASK_TYPES,
  can,
  parseTaskListSort,
  type Role,
  type TaskListSort,
} from '@devscribed/validation';
import { AvatarInitials } from '../../../members/[memberId]/AvatarInitials';
import type { MemberListResponse } from '../../../members/types';
import { CreateTaskModal, type OrgMember } from '../kanban/CreateTaskModal';
import { KanbanHeader } from '../kanban/KanbanHeader';
import { MultiSelectFilter } from '../kanban/MultiSelectFilter';
import type {
  BoardResponse,
  KanbanColumn,
  KanbanProject,
  KanbanTaskSummary,
  TaskListResponse,
} from '../kanban/types';
import {
  PRIORITY_LABEL,
  PriorityGlyph,
  TASK_TYPE_LABEL,
  TaskTypeGlyph,
  formatDueDateShort,
  initialsOfMember,
  isOverdueISO,
} from '../kanban/visual';

const SORT_LABELS: Record<TaskListSort, string> = {
  created_desc: 'Created (newest)',
  created_asc: 'Created (oldest)',
  priority_desc: 'Priority (high→low)',
  priority_asc: 'Priority (low→high)',
  due_date_asc: 'Due date (earliest)',
  due_date_desc: 'Due date (latest)',
  story_points_desc: 'Story points (high→low)',
  title_asc: 'Title (A→Z)',
};

/**
 * Spec 13 — List view. Loads `GET .../tasks` (server-side sort/filter), plus
 * `GET .../board` once to know the project header (name + key + status) and the
 * column names for the Status filter/badge.
 */
export function ListScreen({ orgId, projectId }: { orgId: string; projectId: string }) {
  const session = useSession();
  const router = useRouter();
  const role = session.role as Role;

  const canManageTasks = can(role, 'manage-tasks');
  const canManageColumns = can(role, 'manage-board-columns');

  const [project, setProject] = useState<KanbanProject | null>(null);
  const [columns, setColumns] = useState<KanbanColumn[]>([]);
  const [tasks, setTasks] = useState<KanbanTaskSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [createOpen, setCreateOpen] = useState(false);

  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<TaskListSort>('created_desc');

  const hasFilters =
    typeFilter.length > 0 ||
    priorityFilter.length > 0 ||
    assigneeFilter.length > 0 ||
    statusFilter.length > 0 ||
    search.trim().length > 0;

  const loadHeader = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board`,
        { credentials: 'same-origin' },
      );
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as BoardResponse;
      setProject(data.project);
      setColumns(data.columns);
    } catch {
      // non-blocking
    }
  }, [orgId, projectId]);

  const loadTasks = useCallback(async () => {
    setTasks(null);
    const params = new URLSearchParams();
    if (typeFilter.length) params.set('type', typeFilter.join(','));
    if (priorityFilter.length) params.set('priority', priorityFilter.join(','));
    if (assigneeFilter.length) params.set('assigneeId', assigneeFilter.join(','));
    if (statusFilter.length) params.set('columnId', statusFilter.join(','));
    if (search.trim()) params.set('search', search.trim());
    params.set('sort', sort);
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks?${params.toString()}`,
        { credentials: 'same-origin' },
      );
      if (response.status === 403) {
        setForbidden(true);
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.message ?? KANBAN_MESSAGES.genericError);
        return;
      }
      const data = (await response.json()) as TaskListResponse;
      setTasks(data.tasks);
      setError(null);
    } catch {
      setError(KANBAN_MESSAGES.genericError);
    }
  }, [orgId, projectId, typeFilter, priorityFilter, assigneeFilter, statusFilter, search, sort]);

  useEffect(() => {
    void loadHeader();
  }, [loadHeader]);

  useEffect(() => {
    void loadTasks();
  }, [loadTasks]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/organizations/${orgId}/members`, {
          credentials: 'same-origin',
        });
        if (!response.ok) return;
        const data = (await response.json()) as MemberListResponse;
        if (cancelled) return;
        const mapped: OrgMember[] = data.members
          .filter((m) => m.status === 'active')
          .map((m) => {
            const parts = m.fullName.trim().split(/\s+/);
            const first = parts[0] ?? '';
            const last = parts.length > 1 ? parts[parts.length - 1] : '';
            return { membershipId: m.id, firstName: first, lastName: last };
          });
        setMembers(mapped);
      } catch {
        // non-blocking
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const columnById = useMemo(() => {
    const map = new Map<string, KanbanColumn>();
    for (const c of columns) map.set(c.id, c);
    return map;
  }, [columns]);

  const archived = project?.status === 'archived';

  if (forbidden) {
    return (
      <div data-testid="list-view" style={{ maxWidth: 560, margin: '0 auto', padding: 'var(--sp-12) var(--sp-6)' }}>
        <InfoBanner tone="warning">{KANBAN_MESSAGES.boardPermissionDenied}</InfoBanner>
        <div style={{ marginTop: 'var(--sp-6)' }}>
          <Link
            href={`/org/${orgId}/projects`}
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 500,
              color: 'var(--accent)',
              textDecoration: 'none',
            }}
          >
            ← Back to Projects
          </Link>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div data-testid="list-view" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-12)' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div data-testid="list-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <KanbanHeader
        project={project}
        orgId={orgId}
        projectId={projectId}
        view="list"
        canManageColumns={canManageColumns}
      />

      {archived && (
        <div
          style={{
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: '10px 14px',
            color: 'var(--text-muted)',
            fontSize: 'var(--fs-13)',
          }}
        >
          This project is archived — the board is read-only.
        </div>
      )}

      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {canManageTasks && !archived && (
          <Button
            variant="primary"
            onClick={() => setCreateOpen(true)}
            data-testid="list-create-task-btn"
          >
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <PlusIcon />
              Create Task
            </span>
          </Button>
        )}
        <MultiSelectFilter
          label="Type"
          value={typeFilter}
          options={TASK_TYPES.map((t) => ({ value: t, label: TASK_TYPE_LABEL[t] }))}
          onChange={setTypeFilter}
          data-testid="list-filter-type"
        />
        <MultiSelectFilter
          label="Priority"
          value={priorityFilter}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          onChange={setPriorityFilter}
          data-testid="list-filter-priority"
        />
        <MultiSelectFilter
          label="Assignee"
          value={assigneeFilter}
          options={members.map((m) => ({
            value: m.membershipId,
            label: `${m.firstName} ${m.lastName}`,
          }))}
          onChange={setAssigneeFilter}
          data-testid="list-filter-assignee"
        />
        <MultiSelectFilter
          label="Status"
          value={statusFilter}
          options={columns.map((c) => ({ value: c.id, label: c.name }))}
          onChange={setStatusFilter}
          data-testid="list-filter-status"
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchField
            value={search}
            onChange={(event: { target: { value: string } }) => setSearch(event.target.value)}
            placeholder="Search tasks…"
            data-testid="list-search"
          />
        </div>
        <div style={{ minWidth: 200 }} data-testid="list-sort">
          <Select
            value={sort}
            options={Object.entries(SORT_LABELS).map(([value, label]) => ({
              value,
              label,
            }))}
            onChange={(v) => setSort(parseTaskListSort(v))}
          />
        </div>
      </div>

      {error && !tasks ? (
        <InfoBanner tone="error">{error}</InfoBanner>
      ) : tasks === null ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-8)' }}>
          <Spinner />
        </div>
      ) : tasks.length === 0 ? (
        <div
          style={{
            padding: 'var(--sp-12) var(--sp-6)',
            textAlign: 'center',
            color: 'var(--text-muted)',
            background: 'var(--bg-panel)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-2xl)',
          }}
        >
          {hasFilters ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)', alignItems: 'center' }}>
              <div>{KANBAN_MESSAGES.emptyList}</div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setTypeFilter([]);
                  setPriorityFilter([]);
                  setAssigneeFilter([]);
                  setStatusFilter([]);
                  setSearch('');
                }}
              >
                Clear filters
              </Button>
            </div>
          ) : (
            KANBAN_MESSAGES.emptyBoard
          )}
        </div>
      ) : (
        <TasksTable
          tasks={tasks}
          columnById={columnById}
          onOpen={(task) =>
            router.push(`/org/${orgId}/projects/${projectId}/tasks/${task.id}`)
          }
        />
      )}

      {createOpen && (
        <CreateTaskModal
          open={createOpen}
          orgId={orgId}
          projectId={projectId}
          columns={columns}
          tasks={tasks ?? []}
          members={members}
          onClose={() => setCreateOpen(false)}
          onCreated={() => void loadTasks()}
        />
      )}
    </div>
  );
}

function TasksTable({
  tasks,
  columnById,
  onOpen,
}: {
  tasks: KanbanTaskSummary[];
  columnById: Map<string, KanbanColumn>;
  onOpen: (task: KanbanTaskSummary) => void;
}) {
  return (
    <div
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-2xl)',
        overflowX: 'auto',
      }}
    >
      <table
        style={{
          width: '100%',
          borderCollapse: 'collapse',
          minWidth: 720,
        }}
      >
        <thead>
          <tr style={{ background: 'var(--bg-header)' }}>
            <Th width={90}>Key</Th>
            <Th width={44}>Type</Th>
            <Th>Title</Th>
            <Th width={140}>Status</Th>
            <Th width={60}>Priority</Th>
            <Th width={60}>Assignee</Th>
            <Th width={48} align="right">
              SP
            </Th>
            <Th width={100}>Due</Th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const column = columnById.get(task.columnId);
            return (
              <tr
                key={task.id}
                data-testid={`list-task-row-${task.id}`}
                onClick={() => onOpen(task)}
                style={{
                  cursor: 'pointer',
                  borderTop: '1px solid var(--divider)',
                }}
              >
                <Td width={90}>
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 'var(--fs-12)',
                      color: 'var(--text-muted)',
                    }}
                  >
                    {task.key}
                  </span>
                </Td>
                <Td width={44}>
                  <TaskTypeGlyph type={task.type} size={18} />
                </Td>
                <Td>
                  <span
                    style={{
                      fontSize: 'var(--fs-14)',
                      color: 'var(--text)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      display: 'block',
                    }}
                  >
                    {task.title}
                  </span>
                </Td>
                <Td width={140}>
                  {column && (
                    <span
                      style={{
                        fontSize: 'var(--fs-12)',
                        color: 'var(--text-muted)',
                        background: 'var(--bg-sunken)',
                        borderRadius: 999,
                        padding: '2px 10px',
                      }}
                    >
                      {column.name}
                    </span>
                  )}
                </Td>
                <Td width={60}>
                  <PriorityGlyph priority={task.priority} size={16} />
                </Td>
                <Td width={60}>
                  {task.assignee && (
                    <AvatarInitials
                      fullName={`${task.assignee.firstName} ${task.assignee.lastName}`}
                      initials={initialsOfMember(task.assignee)}
                      size={22}
                      data-testid={`list-assignee-avatar-${task.id}`}
                    />
                  )}
                </Td>
                <Td width={48} align="right">
                  {task.storyPoints != null && (
                    <span
                      style={{
                        fontFamily: 'var(--font-display)',
                        fontWeight: 600,
                        fontSize: 'var(--fs-13)',
                        color: 'var(--text-sub)',
                      }}
                    >
                      {task.storyPoints}
                    </span>
                  )}
                </Td>
                <Td width={100}>
                  {task.dueDate && (
                    <span
                      style={{
                        fontSize: 'var(--fs-12)',
                        color: isOverdueISO(task.dueDate)
                          ? 'var(--error-500)'
                          : 'var(--text-muted)',
                      }}
                    >
                      {formatDueDateShort(task.dueDate)}
                    </span>
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({
  children,
  width,
  align = 'left',
}: {
  children: React.ReactNode;
  width?: number;
  align?: 'left' | 'right';
}) {
  return (
    <th
      style={{
        width,
        textAlign: align,
        padding: '10px 14px',
        fontFamily: 'var(--font-display)',
        fontWeight: 600,
        fontSize: 'var(--fs-11)',
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  width,
  align = 'left',
}: {
  children: React.ReactNode;
  width?: number;
  align?: 'left' | 'right';
}) {
  return (
    <td
      style={{
        width,
        textAlign: align,
        padding: '10px 14px',
        verticalAlign: 'middle',
      }}
    >
      {children}
    </td>
  );
}

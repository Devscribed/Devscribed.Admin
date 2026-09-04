'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  BackTo,
  Badge,
  Button,
  EmptyState,
  InfoBanner,
  Preloader,
  SearchInput,
  Select,
  Table,
  type SelectOption,
  type TableColumn,
} from '@devscribed/ds';
import { PlusIcon } from '@/layout/icons';
import { optionFor, valueOf, valuesOf } from '@/select';
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
import type { MemberListResponse } from '../../../members/types';
import { CreateTaskModal, type OrgMember } from '../kanban/CreateTaskModal';
import { KanbanHeader } from '../kanban/KanbanHeader';
import { LabelStrip } from '../kanban/LabelStrip';
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

/** The width a filter takes in the bar — the same 200px the report filters settled on. */
const FILTER_WIDTH = { width: 200 };

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

  const typeOptions: SelectOption[] = TASK_TYPES.map((t) => ({
    value: t,
    label: TASK_TYPE_LABEL[t],
    testId: `list-filter-type-item-${t}`,
  }));
  const priorityOptions: SelectOption[] = TASK_PRIORITIES.map((pr) => ({
    value: pr,
    label: PRIORITY_LABEL[pr],
    testId: `list-filter-priority-item-${pr}`,
  }));
  const assigneeOptions: SelectOption[] = members.map((m) => ({
    value: m.membershipId,
    label: `${m.firstName} ${m.lastName}`,
    testId: `list-filter-assignee-item-${m.membershipId}`,
  }));
  const statusOptions: SelectOption[] = columns.map((c) => ({
    value: c.id,
    label: c.name,
    testId: `list-filter-status-item-${c.id}`,
  }));
  const sortOptions: SelectOption[] = Object.entries(SORT_LABELS).map(([value, label]) => ({
    value,
    label,
    testId: `list-sort-item-${value}`,
  }));

  const archived = project?.status === 'archived';

  if (forbidden) {
    return (
      <div data-testid="list-view" style={{ maxWidth: 560, margin: '0 auto' }}>
        <InfoBanner variant="warning">{KANBAN_MESSAGES.boardPermissionDenied}</InfoBanner>
        <div style={{ marginTop: 'var(--space-7)' }}>
          <BackTo
            label="Back to Projects"
            href={`/org/${orgId}/projects`}
            onClick={(event) => {
              if (event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              router.push(`/org/${orgId}/projects`);
            }}
          />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div data-testid="list-view">
        <Preloader aria-label="Loading tasks" />
      </div>
    );
  }

  return (
    <div data-testid="list-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
      <KanbanHeader
        project={project}
        orgId={orgId}
        projectId={projectId}
        view="list"
        canManageColumns={canManageColumns}
      />

      {archived && (
        <InfoBanner variant="info">This project is archived — the board is read-only.</InfoBanner>
      )}

      {/* The four filters were one hand-built `MultiSelectFilter` each; they are `Select
          isMulti` (§21, §29, §36) now, and this file is the second half of the deletion the
          board's is the first half of. The sort beside them is the single-value form of the
          same control. */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {canManageTasks && !archived && (
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setCreateOpen(true)}
            data-testid="list-create-task-btn"
          >
            Create Task
          </Button>
        )}
        <Select
          data-testid="list-filter-type"
          placeholder="Type"
          isMulti
          closeMenuOnSelect={false}
          options={typeOptions}
          value={typeFilter.map((v) => optionFor(typeOptions, v)).filter((o) => o !== undefined)}
          onChange={(next) => setTypeFilter(valuesOf(next))}
          chipTestId={(option) =>
            `list-filter-type-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={FILTER_WIDTH}
        />
        <Select
          data-testid="list-filter-priority"
          placeholder="Priority"
          isMulti
          closeMenuOnSelect={false}
          options={priorityOptions}
          value={priorityFilter
            .map((v) => optionFor(priorityOptions, v))
            .filter((o) => o !== undefined)}
          onChange={(next) => setPriorityFilter(valuesOf(next))}
          chipTestId={(option) =>
            `list-filter-priority-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={FILTER_WIDTH}
        />
        <Select
          data-testid="list-filter-assignee"
          placeholder="Assignee"
          isMulti
          isSearchable
          closeMenuOnSelect={false}
          options={assigneeOptions}
          value={assigneeFilter
            .map((v) => optionFor(assigneeOptions, v))
            .filter((o) => o !== undefined)}
          onChange={(next) => setAssigneeFilter(valuesOf(next))}
          chipTestId={(option) =>
            `list-filter-assignee-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={FILTER_WIDTH}
        />
        <Select
          data-testid="list-filter-status"
          placeholder="Status"
          isMulti
          closeMenuOnSelect={false}
          options={statusOptions}
          value={statusFilter
            .map((v) => optionFor(statusOptions, v))
            .filter((o) => o !== undefined)}
          onChange={(next) => setStatusFilter(valuesOf(next))}
          chipTestId={(option) =>
            `list-filter-status-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={FILTER_WIDTH}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search tasks…"
            aria-label="Search tasks"
            data-testid="list-search"
          />
        </div>
        <Select
          data-testid="list-sort"
          value={optionFor(sortOptions, sort)}
          options={sortOptions}
          onChange={(next) => setSort(parseTaskListSort(valueOf(next)))}
          wrapperStyle={{ width: 220 }}
        />
      </div>

      {error && !tasks ? (
        <InfoBanner variant="error">{error}</InfoBanner>
      ) : tasks === null ? (
        <Preloader aria-label="Loading tasks" />
      ) : tasks.length === 0 ? (
        <EmptyState data-testid="list-empty-state">
          {hasFilters ? KANBAN_MESSAGES.emptyList : KANBAN_MESSAGES.emptyBoard}
          {hasFilters && (
            <div style={{ marginTop: 'var(--space-6)' }}>
              <Button
                onClick={() => {
                  setTypeFilter([]);
                  setPriorityFilter([]);
                  setAssigneeFilter([]);
                  setStatusFilter([]);
                  setSearch('');
                }}
                data-testid="list-clear-filters-btn"
              >
                Clear filters
              </Button>
            </div>
          )}
        </EmptyState>
      ) : (
        <TasksTable
          tasks={tasks}
          columnById={columnById}
          taskHref={(task) => `/org/${orgId}/projects/${projectId}/tasks/${task.id}`}
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

/**
 * The task list, on the system's `Table` (§18, §34, §48).
 *
 * It was a hand-built `<table>` with its own `Th` and `Td` — a header background, an
 * uppercase micro-label treatment, a row border and eight column widths, all stated here.
 * Every one of those belongs to `Table`, and two of them it does better: the row is a real
 * anchor through `rowHref`, so a task can be middle-clicked and opened in a tab and is
 * reachable by keyboard, where a `<tr onClick>` was neither. Spec 13 asks for a focusable row
 * that `Enter` opens; this is the first version that actually has one.
 */
function TasksTable({
  tasks,
  columnById,
  taskHref,
  onOpen,
}: {
  tasks: KanbanTaskSummary[];
  columnById: Map<string, KanbanColumn>;
  taskHref: (task: KanbanTaskSummary) => string;
  onOpen: (task: KanbanTaskSummary) => void;
}) {
  const columns: TableColumn<KanbanTaskSummary>[] = [
    {
      label: 'Key',
      flex: 0.7,
      render: (task) => (
        <span
          style={{
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {task.key}
        </span>
      ),
    },
    {
      label: 'Type',
      flex: 0.4,
      render: (task) => <TaskTypeGlyph type={task.type} size={18} />,
    },
    {
      label: 'Title',
      flex: 2.6,
      align: 'flex-start',
      render: (task) => (
        <span
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            minWidth: 0,
          }}
        >
          <span
            style={{
              color: 'var(--text-primary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {task.title}
          </span>
          {task.labels && task.labels.length > 0 && (
            <LabelStrip labels={task.labels} max={4} testIdPrefix="task-card-label" />
          )}
        </span>
      ),
    },
    {
      label: 'Status',
      flex: 1,
      render: (task) => {
        const column = columnById.get(task.columnId);
        /* §59's `neutral` — a column is a label on the task, not a judgement about it, so it
           takes the one tone that claims nothing. */
        return column ? (
          <Badge status="neutral" size="s">
            {column.name}
          </Badge>
        ) : null;
      },
    },
    {
      label: 'Priority',
      flex: 0.5,
      render: (task) => <PriorityGlyph priority={task.priority} size={16} />,
    },
    {
      label: 'Assignee',
      flex: 0.5,
      render: (task) =>
        task.assignee ? (
          <Avatar
            name={`${task.assignee.firstName} ${task.assignee.lastName}`}
            initials={initialsOfMember(task.assignee)}
            size={22}
            data-testid={`list-assignee-avatar-${task.id}`}
          />
        ) : null,
    },
    {
      label: 'SP',
      flex: 0.4,
      align: 'flex-end',
      render: (task) =>
        task.storyPoints != null ? (
          <span
            style={{
              fontWeight: 'var(--font-weight-semibold)',
              color: 'var(--text-secondary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {task.storyPoints}
          </span>
        ) : null,
    },
    {
      label: 'Due',
      flex: 0.8,
      maxWidth: 'none',
      render: (task) =>
        task.dueDate ? (
          <span
            style={{
              fontSize: 'var(--font-size-xs)',
              color: isOverdueISO(task.dueDate) ? 'var(--status-error)' : 'var(--text-secondary)',
            }}
          >
            {formatDueDateShort(task.dueDate)}
          </span>
        ) : null,
    },
  ];

  return (
    <Table<KanbanTaskSummary>
      columns={columns}
      rows={tasks}
      rowKey="id"
      rowTestId={(task) => `list-task-row-${task.id}`}
      rowHref={taskHref}
      onRowClick={(task, event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey) return;
        event.preventDefault();
        onOpen(task);
      }}
    />
  );
}

'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, InfoBanner, SearchField, Spinner } from '@/ds';
import { PlusIcon } from '@/layout/icons';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  TASK_TYPES,
  can,
  type Role,
  type TaskPriority,
  type TaskType,
} from '@devscribed/validation';
import { AvatarInitials } from '../../../members/[memberId]/AvatarInitials';
import type { MemberListResponse } from '../../../members/types';
import { BoardSettingsModal } from '../kanban/BoardSettingsModal';
import { CreateTaskModal, type OrgMember } from '../kanban/CreateTaskModal';
import { KanbanHeader } from '../kanban/KanbanHeader';
import { MultiSelectFilter } from '../kanban/MultiSelectFilter';
import type {
  BoardResponse,
  KanbanAssignee,
  KanbanColumn,
  KanbanTaskSummary,
} from '../kanban/types';
import {
  PRIORITY_LABEL,
  PriorityGlyph,
  TASK_TYPE_LABEL,
  TaskTypeGlyph,
  columnCategoryBorder,
  formatDueDateShort,
  initialsOfMember,
  isOverdueISO,
} from '../kanban/visual';

/**
 * Spec 13 — Board view. Loads `GET .../board`, renders columns and cards with
 * drag-and-drop between columns (optimistic; PATCH .../tasks/{id}/move on drop).
 * Hides create/settings for archived projects, renders a full-page permission
 * panel for callers without `view-board` or project membership.
 */
export function BoardScreen({ orgId, projectId }: { orgId: string; projectId: string }) {
  const session = useSession();
  const router = useRouter();
  const { showToast } = useToast();
  const role = session.role as Role;

  const canManageTasks = can(role, 'manage-tasks');
  const canManageColumns = can(role, 'manage-board-columns');

  const [state, setState] = useState<
    | { kind: 'loading' }
    | { kind: 'error'; message: string }
    | { kind: 'forbidden' }
    | { kind: 'ready'; data: BoardResponse }
  >({ kind: 'loading' });
  const [members, setMembers] = useState<OrgMember[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Filter + search state.
  const [typeFilter, setTypeFilter] = useState<string[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<string[]>([]);
  const [assigneeFilter, setAssigneeFilter] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  // Inline add-column input on the trailing lane.
  const [addingColumn, setAddingColumn] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');

  // Drag state (used for the DragOverlay).
  const [draggingTask, setDraggingTask] = useState<KanbanTaskSummary | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board`,
        { credentials: 'same-origin' },
      );
      if (response.status === 403) {
        setState({ kind: 'forbidden' });
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setState({
          kind: 'error',
          message: body?.message ?? KANBAN_MESSAGES.genericError,
        });
        return;
      }
      const data = (await response.json()) as BoardResponse;
      setState({ kind: 'ready', data });
    } catch {
      setState({ kind: 'error', message: KANBAN_MESSAGES.genericError });
    }
  }, [orgId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // Load org members for the create modal + assignee filter.
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

  const board = state.kind === 'ready' ? state.data : null;
  const archived = board?.project.status === 'archived';

  // Client-side filtering per §Board view. Search is title substring, case-insensitive.
  const filteredTasks = useMemo(() => {
    if (!board) return [] as KanbanTaskSummary[];
    return board.tasks.filter((t) => {
      if (typeFilter.length && !typeFilter.includes(t.type)) return false;
      if (priorityFilter.length) {
        if (!t.priority || !priorityFilter.includes(t.priority)) return false;
      }
      if (assigneeFilter.length) {
        if (!t.assignee || !assigneeFilter.includes(t.assignee.membershipId)) return false;
      }
      if (search.trim()) {
        if (!t.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [board, typeFilter, priorityFilter, assigneeFilter, search]);

  const tasksByColumn = useMemo(() => {
    const map = new Map<string, KanbanTaskSummary[]>();
    if (!board) return map;
    for (const col of board.columns) map.set(col.id, []);
    for (const task of filteredTasks) {
      const list = map.get(task.columnId);
      if (list) list.push(task);
    }
    for (const list of map.values()) list.sort((a, b) => a.position - b.position);
    return map;
  }, [board, filteredTasks]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragStart(event: DragStartEvent) {
    if (archived) return;
    const t = board?.tasks.find((x) => x.id === event.active.id);
    setDraggingTask(t ?? null);
  }

  async function onDragEnd(event: DragEndEvent) {
    setDraggingTask(null);
    if (!board || archived) return;
    const { active, over } = event;
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId === overId) return;

    const activeTask = board.tasks.find((t) => t.id === activeId);
    if (!activeTask) return;

    // `over` may be a column id (dropped on empty area) or a task id.
    const overTask = board.tasks.find((t) => t.id === overId);
    const targetColumnId = overTask ? overTask.columnId : overId;
    const targetColumn = board.columns.find((c) => c.id === targetColumnId);
    if (!targetColumn) return;

    // Compute the new fractional position: midpoint between neighbors.
    const columnTasks = (tasksByColumn.get(targetColumnId) ?? []).filter(
      (t) => t.id !== activeId,
    );
    let insertIndex = columnTasks.length;
    if (overTask) {
      insertIndex = columnTasks.findIndex((t) => t.id === overTask.id);
      if (insertIndex < 0) insertIndex = columnTasks.length;
    }
    const prev = columnTasks[insertIndex - 1];
    const next = columnTasks[insertIndex];
    let newPosition: number;
    if (!prev && !next) newPosition = 1;
    else if (!prev && next) newPosition = next.position - 1;
    else if (prev && !next) newPosition = prev.position + 1;
    else newPosition = (prev!.position + next!.position) / 2;

    const originalColumnId = activeTask.columnId;
    const originalPosition = activeTask.position;

    // Optimistic update.
    setState((prev) => {
      if (prev.kind !== 'ready') return prev;
      const nextTasks = prev.data.tasks.map((t) =>
        t.id === activeId
          ? { ...t, columnId: targetColumnId, position: newPosition }
          : t,
      );
      const nextColumns = prev.data.columns.map((c) => {
        if (c.id === targetColumnId && targetColumnId !== originalColumnId) {
          return { ...c, taskCount: c.taskCount + 1 };
        }
        if (c.id === originalColumnId && targetColumnId !== originalColumnId) {
          return { ...c, taskCount: Math.max(0, c.taskCount - 1) };
        }
        return c;
      });
      return {
        kind: 'ready',
        data: { ...prev.data, tasks: nextTasks, columns: nextColumns },
      };
    });

    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/tasks/${activeId}/move`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ columnId: targetColumnId, position: newPosition }),
        },
      );
      if (!response.ok) {
        // Revert.
        setState((prev) => {
          if (prev.kind !== 'ready') return prev;
          const nextTasks = prev.data.tasks.map((t) =>
            t.id === activeId
              ? { ...t, columnId: originalColumnId, position: originalPosition }
              : t,
          );
          return { kind: 'ready', data: { ...prev.data, tasks: nextTasks } };
        });
        const body = await response.json().catch(() => null);
        showToast('toast-task-moved', body?.message ?? KANBAN_MESSAGES.genericError, 'error');
        void load();
        return;
      }
      if (targetColumnId !== originalColumnId) {
        showToast('toast-task-moved', KANBAN_MESSAGES.toastTaskMoved);
      }
    } catch {
      showToast('toast-task-moved', KANBAN_MESSAGES.genericError, 'error');
      void load();
    }
  }

  async function addColumn() {
    const trimmed = newColumnName.trim();
    if (!trimmed) return;
    try {
      const response = await fetch(
        `/api/organizations/${orgId}/projects/${projectId}/board/columns`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ name: trimmed }),
        },
      );
      if (response.ok) {
        setAddingColumn(false);
        setNewColumnName('');
        showToast('toast-column-created', KANBAN_MESSAGES.toastColumnCreated);
        void load();
        return;
      }
      const body = await response.json().catch(() => null);
      showToast(
        'toast-column-created',
        body?.message ?? KANBAN_MESSAGES.genericError,
        'error',
      );
    } catch {
      showToast('toast-column-created', KANBAN_MESSAGES.genericError, 'error');
    }
  }

  if (state.kind === 'loading') {
    return (
      <div data-testid="board-view" style={{ display: 'flex', justifyContent: 'center', padding: 'var(--sp-12)' }}>
        <Spinner />
      </div>
    );
  }
  if (state.kind === 'forbidden') {
    return (
      <div data-testid="board-view" style={{ maxWidth: 560, margin: '0 auto', padding: 'var(--sp-12) var(--sp-6)' }}>
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
  if (state.kind === 'error') {
    return (
      <div data-testid="board-view" style={{ padding: 'var(--sp-8)' }}>
        <InfoBanner tone="error">{state.message}</InfoBanner>
      </div>
    );
  }

  const data = state.data;
  const isBoardEmpty = data.tasks.length === 0;

  return (
    <div data-testid="board-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
      <KanbanHeader
        project={data.project}
        orgId={orgId}
        projectId={projectId}
        view="board"
        canManageColumns={canManageColumns && !archived}
        onOpenSettings={() => setSettingsOpen(true)}
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

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
        {canManageTasks && !archived && (
          <Button
            variant="primary"
            onClick={() => setCreateOpen(true)}
            data-testid="board-create-task-btn"
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
          data-testid="board-filter-type"
        />
        <MultiSelectFilter
          label="Priority"
          value={priorityFilter}
          options={TASK_PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] }))}
          onChange={setPriorityFilter}
          data-testid="board-filter-priority"
        />
        <MultiSelectFilter
          label="Assignee"
          value={assigneeFilter}
          options={members.map((m) => ({
            value: m.membershipId,
            label: `${m.firstName} ${m.lastName}`,
          }))}
          onChange={setAssigneeFilter}
          data-testid="board-filter-assignee"
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchField
            value={search}
            onChange={(event: { target: { value: string } }) => setSearch(event.target.value)}
            placeholder="Search tasks…"
            data-testid="board-search"
          />
        </div>
      </div>

      {/* Columns */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <div
          style={{
            display: 'flex',
            gap: 'var(--sp-4)',
            overflowX: 'auto',
            paddingBottom: 'var(--sp-4)',
          }}
        >
          {data.columns.map((column) => (
            <BoardColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              draggable={!archived && canManageTasks}
              onOpenTask={(task) =>
                router.push(
                  `/org/${orgId}/projects/${projectId}/tasks/${task.id}`,
                )
              }
              isBoardEmpty={isBoardEmpty}
              canCreate={canManageTasks && !archived}
              onCreate={() => setCreateOpen(true)}
            />
          ))}
          {canManageColumns && !archived && (
            <div style={{ width: 300, flexShrink: 0 }}>
              {addingColumn ? (
                <div
                  style={{
                    background: 'var(--bg-panel-2)',
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius-xl)',
                    padding: 'var(--sp-4)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--sp-3)',
                  }}
                >
                  <input
                    type="text"
                    autoFocus
                    value={newColumnName}
                    onChange={(e) => setNewColumnName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void addColumn();
                      } else if (e.key === 'Escape') {
                        setAddingColumn(false);
                        setNewColumnName('');
                      }
                    }}
                    placeholder="Column name"
                    style={{
                      fontFamily: 'var(--font-display)',
                      fontSize: 'var(--fs-14)',
                      color: 'var(--text)',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)',
                      padding: '8px 10px',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 'var(--sp-2)' }}>
                    <Button variant="primary" size="sm" onClick={() => void addColumn()}>
                      Add
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setAddingColumn(false);
                        setNewColumnName('');
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setAddingColumn(true)}
                  data-testid="board-column-add"
                  style={{
                    width: '100%',
                    minHeight: 120,
                    background: 'transparent',
                    border: '1px dashed var(--border)',
                    borderRadius: 'var(--radius-xl)',
                    color: 'var(--text-muted)',
                    fontFamily: 'var(--font-display)',
                    fontSize: 'var(--fs-13)',
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <PlusIcon />
                  Column
                </button>
              )}
            </div>
          )}
        </div>
        <DragOverlay>
          {draggingTask ? (
            <div style={{ opacity: 0.9 }}>
              <TaskCard task={draggingTask} draggable={false} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {createOpen && (
        <CreateTaskModal
          open={createOpen}
          orgId={orgId}
          projectId={projectId}
          columns={data.columns}
          tasks={data.tasks.map((t) => ({
            id: t.id,
            key: t.key,
            title: t.title,
            type: t.type,
          }))}
          members={members}
          onClose={() => setCreateOpen(false)}
          onCreated={() => void load()}
        />
      )}

      {settingsOpen && (
        <BoardSettingsModal
          open={settingsOpen}
          orgId={orgId}
          projectId={projectId}
          columns={data.columns}
          onClose={() => setSettingsOpen(false)}
          onChanged={() => void load()}
        />
      )}
    </div>
  );
}

function BoardColumn({
  column,
  tasks,
  draggable,
  onOpenTask,
  isBoardEmpty,
  canCreate,
  onCreate,
}: {
  column: KanbanColumn;
  tasks: KanbanTaskSummary[];
  draggable: boolean;
  onOpenTask: (task: KanbanTaskSummary) => void;
  isBoardEmpty: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  return (
    <div
      data-testid={`board-column-${column.id}`}
      style={{
        width: 300,
        flexShrink: 0,
        background: 'var(--bg-panel-2)',
        borderRadius: 'var(--radius-xl)',
        borderTop: `3px solid ${columnCategoryBorder(column.category)}`,
        display: 'flex',
        flexDirection: 'column',
        maxHeight: 'calc(100vh - 260px)',
      }}
    >
      <div
        data-testid={`board-column-header-${column.id}`}
        style={{
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          position: 'sticky',
          top: 0,
          background: 'var(--bg-panel-2)',
          borderTopLeftRadius: 'var(--radius-xl)',
          borderTopRightRadius: 'var(--radius-xl)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-14)',
            color: 'var(--text)',
          }}
        >
          {column.name}
        </span>
        <span
          data-testid={`board-column-count-${column.id}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-11)',
            color: 'var(--text-muted)',
            background: 'var(--bg-sunken)',
            borderRadius: 999,
            padding: '1px 8px',
          }}
        >
          {column.taskCount}
        </span>
      </div>
      <div
        ref={setNodeRef}
        style={{
          padding: '0 var(--sp-3) var(--sp-3)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--sp-3)',
          background: isOver ? 'var(--hover-bg-tint)' : 'transparent',
          minHeight: 40,
          overflowY: 'auto',
          flex: 1,
        }}
      >
        <SortableContext
          items={tasks.map((t) => t.id)}
          strategy={verticalListSortingStrategy}
        >
          {tasks.length === 0 ? (
            isBoardEmpty ? (
              <div
                style={{
                  padding: 'var(--sp-8) var(--sp-4)',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 'var(--fs-13)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--sp-4)',
                  alignItems: 'center',
                }}
              >
                <div>No tasks yet. Create your first task to get started.</div>
                {canCreate && (
                  <Button variant="primary" size="sm" onClick={onCreate}>
                    + Create Task
                  </Button>
                )}
              </div>
            ) : (
              <div
                style={{
                  padding: 'var(--sp-8) var(--sp-4)',
                  textAlign: 'center',
                  color: 'var(--text-faint)',
                  fontSize: 'var(--fs-12)',
                }}
              >
                No tasks in this column.
              </div>
            )
          ) : (
            tasks.map((task) => (
              <SortableTaskCard
                key={task.id}
                task={task}
                draggable={draggable}
                onOpen={() => onOpenTask(task)}
              />
            ))
          )}
        </SortableContext>
      </div>
    </div>
  );
}

function SortableTaskCard({
  task,
  draggable,
  onOpen,
}: {
  task: KanbanTaskSummary;
  draggable: boolean;
  onOpen: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: task.id, disabled: !draggable });
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...(draggable ? listeners : {})}
    >
      <TaskCard task={task} draggable={draggable} onOpen={onOpen} />
    </div>
  );
}

function TaskCard({
  task,
  draggable,
  onOpen,
}: {
  task: KanbanTaskSummary;
  draggable: boolean;
  onOpen?: () => void;
}) {
  const typeColor: Record<TaskType, string> = {
    epic: 'var(--accent)',
    task: 'oklch(0.55 0.11 180)',
    bug: 'var(--error-500)',
    story: 'var(--success-500)',
    subtask: 'var(--text-muted)',
  };
  return (
    <div
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (!onOpen) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      data-testid={`board-task-card-${task.id}`}
      style={{
        background: 'var(--bg-panel)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        padding: '10px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        borderLeft: `4px solid ${typeColor[task.type]}`,
        cursor: draggable ? 'grab' : onOpen ? 'pointer' : 'default',
        boxShadow: 'var(--shadow-card)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <TaskTypeGlyph type={task.type} size={14} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--fs-12)',
            color: 'var(--text-muted)',
          }}
        >
          {task.key}
        </span>
        {task.childCount > 0 && (
          <span style={{ fontSize: 'var(--fs-11)', color: 'var(--text-faint)' }}>
            ⌐ {task.childCount}
          </span>
        )}
      </div>
      <div
        style={{
          fontFamily: 'var(--font-text)',
          fontSize: 'var(--fs-14)',
          color: 'var(--text)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {task.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 22 }}>
        {task.priority && <PriorityGlyph priority={task.priority} size={14} />}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {task.storyPoints != null && (
            <span
              style={{
                fontFamily: 'var(--font-display)',
                fontWeight: 600,
                fontSize: 'var(--fs-11)',
                color: 'var(--text-muted)',
                background: 'var(--bg-sunken)',
                borderRadius: 999,
                padding: '2px 8px',
              }}
            >
              {task.storyPoints}
            </span>
          )}
          {task.assignee && <AssigneeAvatar assignee={task.assignee} />}
          {task.dueDate && (
            <span
              style={{
                fontSize: 'var(--fs-11)',
                color: isOverdueISO(task.dueDate)
                  ? 'var(--error-500)'
                  : 'var(--text-muted)',
              }}
            >
              {formatDueDateShort(task.dueDate)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function AssigneeAvatar({ assignee }: { assignee: KanbanAssignee }) {
  const initials = initialsOfMember(assignee);
  return (
    <AvatarInitials
      fullName={`${assignee.firstName} ${assignee.lastName}`}
      initials={initials}
      size={22}
      data-testid={`assignee-avatar-${assignee.membershipId}`}
    />
  );
}

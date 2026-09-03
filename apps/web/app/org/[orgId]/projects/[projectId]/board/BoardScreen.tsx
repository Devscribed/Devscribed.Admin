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
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  BackTo,
  BoardColumn,
  Button,
  InfoBanner,
  Preloader,
  SearchInput,
  Select,
  TextInput,
  type SelectOption,
} from '@devscribed/ds';
import { PlusIcon } from '@/layout/icons';
import { optionFor, valuesOf } from '@/select';
import { useSession } from '@/layout/session-context';
import { useToast } from '@/toast';
import {
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  TASK_TYPES,
  can,
  type Role,
} from '@devscribed/validation';
import type { MemberListResponse } from '../../../members/types';
import { BoardSettingsModal } from '../kanban/BoardSettingsModal';
import { CreateTaskModal, type OrgMember } from '../kanban/CreateTaskModal';
import { KanbanHeader } from '../kanban/KanbanHeader';
import { LabelStrip } from '../kanban/LabelStrip';
import type {
  BoardResponse,
  KanbanAssignee,
  KanbanColumn as KanbanColumnData,
  KanbanTaskSummary,
} from '../kanban/types';
import {
  PRIORITY_LABEL,
  PriorityGlyph,
  TASK_TYPE_COLOR,
  TASK_TYPE_LABEL,
  TaskTypeGlyph,
  columnCategoryBorder,
  formatDueDateShort,
  initialsOfMember,
  isOverdueISO,
} from '../kanban/visual';

/** One column's width. The board scrolls sideways rather than squeezing them. */
const COLUMN_WIDTH = 300;

/**
 * Spec 13 — Board view. Loads `GET .../board`, renders columns and cards with
 * drag-and-drop between columns (optimistic; PATCH .../tasks/{id}/move on drop).
 * Hides create/settings for archived projects, renders a full-page permission
 * panel for callers without `view-board` or project membership.
 *
 * **The column is the system's `BoardColumn` (§43); the card is not `BoardCard` (§42).**
 * That split is this phase's finding rather than its plan, and the reason is what each
 * component *is*. §43 is a container — a recessed well, a name, a count, an empty line, a
 * scrolling body — and a kanban column is exactly that container, so it is taken whole,
 * including the two test ids it draws for itself. §42 is not a container: it is a card with
 * a fixed body of three facts, written for a hiring application — a name, a date, and the
 * two marks a column can put on it. A task card carries seven, and four of them (labels,
 * priority, story points, assignee) have no slot to go in. A card whose body would have to
 * be passed through the one prop that ellipsises to a single line is not the same component
 * wearing different content; it is a different component. So the task card stays here, under
 * E3's third tier, composed from the system's `Chip`, `Avatar` and tokens.
 *
 * `@dnd-kit` stays with it, and that is decided rather than inherited. §43 speaks native
 * HTML5 drag through `onDragOverIndex` / `onDrop`, and that protocol is written *between*
 * §43 and §42 — the column finds its slots by `[data-board-card]`, which the card sets. With
 * the card refused there is nothing on the other end of it, and the alternative is
 * reimplementing §42's drag half here. The board would also not be the only loser: spec 13
 * requires keyboard reordering in Board Settings and names `@dnd-kit`'s keyboard sensors as
 * how it is met, so the library stays in the feature regardless. One mechanism across the
 * whole feature beats two, which is the argument D4 makes everywhere else.
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

  const typeOptions: SelectOption[] = TASK_TYPES.map((t) => ({
    value: t,
    label: TASK_TYPE_LABEL[t],
    testId: `board-filter-type-item-${t}`,
  }));
  const priorityOptions: SelectOption[] = TASK_PRIORITIES.map((p) => ({
    value: p,
    label: PRIORITY_LABEL[p],
    testId: `board-filter-priority-item-${p}`,
  }));
  const assigneeOptions: SelectOption[] = members.map((m) => ({
    value: m.membershipId,
    label: `${m.firstName} ${m.lastName}`,
    testId: `board-filter-assignee-item-${m.membershipId}`,
  }));

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
      <div data-testid="board-view">
        <Preloader aria-label="Loading board" />
      </div>
    );
  }
  if (state.kind === 'forbidden') {
    return (
      <div data-testid="board-view" style={{ maxWidth: 560, margin: '0 auto' }}>
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
  if (state.kind === 'error') {
    return (
      <div data-testid="board-view">
        <InfoBanner variant="error">{state.message}</InfoBanner>
      </div>
    );
  }

  const data = state.data;
  const isBoardEmpty = data.tasks.length === 0;

  return (
    <div data-testid="board-view" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-7)' }}>
      <KanbanHeader
        project={data.project}
        orgId={orgId}
        projectId={projectId}
        view="board"
        canManageColumns={canManageColumns && !archived}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* §7's `info`, not a hand-built grey strip: a read-only board is a fact about the
          state of the project, and nothing is going wrong. */}
      {archived && (
        <InfoBanner variant="info">This project is archived — the board is read-only.</InfoBanner>
      )}

      {/* Filter bar. The three filters were one hand-built `MultiSelectFilter` each — a
          trigger, a caret, a count bubble, an outside-click listener and a checkbox list,
          150 lines — and they are `Select isMulti` (§21, §29, §36) now. This is the second
          consumer of the collapse Phase 3 made, which is what proves it was a component
          rather than one screen's composition. `closeMenuOnSelect={false}` is §36's
          documented opt-out and this is its case: picking two types is one act. */}
      <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        {canManageTasks && !archived && (
          <Button
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => setCreateOpen(true)}
            data-testid="board-create-task-btn"
          >
            Create Task
          </Button>
        )}
        <Select
          data-testid="board-filter-type"
          placeholder="Type"
          isMulti
          closeMenuOnSelect={false}
          options={typeOptions}
          value={typeFilter.map((v) => optionFor(typeOptions, v)).filter((o) => o !== undefined)}
          onChange={(next) => setTypeFilter(valuesOf(next))}
          chipTestId={(option) =>
            `board-filter-type-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={{ width: 180 }}
        />
        <Select
          data-testid="board-filter-priority"
          placeholder="Priority"
          isMulti
          closeMenuOnSelect={false}
          options={priorityOptions}
          value={priorityFilter
            .map((v) => optionFor(priorityOptions, v))
            .filter((o) => o !== undefined)}
          onChange={(next) => setPriorityFilter(valuesOf(next))}
          chipTestId={(option) =>
            `board-filter-priority-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={{ width: 180 }}
        />
        <Select
          data-testid="board-filter-assignee"
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
            `board-filter-assignee-chip-${typeof option === 'string' ? option : option.value}`
          }
          wrapperStyle={{ width: 200 }}
        />
        <div style={{ flex: 1, minWidth: 200 }}>
          <SearchInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClear={() => setSearch('')}
            placeholder="Search tasks…"
            aria-label="Search tasks"
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
            gap: 'var(--space-5)',
            overflowX: 'auto',
            paddingBottom: 'var(--space-5)',
            alignItems: 'flex-start',
          }}
        >
          {data.columns.map((column) => (
            <TaskColumn
              key={column.id}
              column={column}
              tasks={tasksByColumn.get(column.id) ?? []}
              draggable={!archived && canManageTasks}
              onOpenTask={(task) =>
                router.push(`/org/${orgId}/projects/${projectId}/tasks/${task.id}`)
              }
              isBoardEmpty={isBoardEmpty}
              canCreate={canManageTasks && !archived}
              onCreate={() => setCreateOpen(true)}
            />
          ))}
          {canManageColumns && !archived && (
            <div style={{ width: COLUMN_WIDTH, flexShrink: 0 }}>
              {addingColumn ? (
                <div
                  style={{
                    background: 'var(--surface-sunken)',
                    borderRadius: 'var(--radius-l)',
                    padding: 'var(--space-5)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--space-4)',
                  }}
                >
                  <TextInput
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
                    aria-label="Column name"
                  />
                  <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <Button variant="primary" onClick={() => void addColumn()}>
                      Add
                    </Button>
                    <Button
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
                    /* The one dashed edge on the board, and it is the same mark §43 uses for
                       the gap a drop would land in: a dashed outline here means "a column
                       could go here". */
                    border: 'var(--border-width-hairline) dashed var(--border-default)',
                    borderRadius: 'var(--radius-l)',
                    color: 'var(--text-secondary)',
                    fontFamily: 'var(--font-family-base)',
                    fontSize: 'var(--font-size-s)',
                    fontWeight: 'var(--font-weight-medium)',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--space-2)',
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

/**
 * One column, on §43. Everything drawn here belongs to the system — the recessed well, the
 * name, the count, the empty line, the scrolling body — and what is left is this board's
 * three additions: the category rule along its top edge, a fixed width because the board
 * scrolls sideways, and the droppable wrapper `@dnd-kit` needs a real node for.
 *
 * The wrapper exists because §43 is a plain function component and cannot take a `ref`. It
 * is the drop target rather than the section itself, which is the same rectangle.
 */
function TaskColumn({
  column,
  tasks,
  draggable,
  onOpenTask,
  isBoardEmpty,
  canCreate,
  onCreate,
}: {
  column: KanbanColumnData;
  tasks: KanbanTaskSummary[];
  draggable: boolean;
  onOpenTask: (task: KanbanTaskSummary) => void;
  isBoardEmpty: boolean;
  canCreate: boolean;
  onCreate: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    /* `SortableContext` is a provider and draws nothing, but it is still a React child — and
       §43 counts its children to know whether the column is empty and where a drop would
       land. Wrapping the column rather than its cards keeps that count honest. */
    <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
      <div ref={setNodeRef} style={{ width: COLUMN_WIDTH, flexShrink: 0 }}>
        <BoardColumn
          status={column.id}
          name={column.name}
          count={column.taskCount}
          /* The empty line says which of two things is true, and they are different states: a
             board with no tasks at all is a screen waiting to be started, while a column with
             none on a board that has them is just an empty column. */
          emptyLabel={
            isBoardEmpty ? (
              <span style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                No tasks yet. Create your first task to get started.
                {canCreate && (
                  <span>
                    <Button variant="primary" onClick={onCreate}>
                      + Create Task
                    </Button>
                  </span>
                )}
              </span>
            ) : (
              'No tasks in this column.'
            )
          }
          style={{
            /* The category rule. `in_progress` and `done` are the two columns whose meaning is
               not their name, and the edge is the only place on the board carrying it. */
            borderTop: `3px solid ${columnCategoryBorder(column.category)}`,
            maxHeight: 'calc(100vh - 260px)',
            /* §34's own reading for a container under a pointer that is carrying something. */
            outline: isOver ? '2px solid var(--action-primary)' : undefined,
          }}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              draggable={draggable}
              onOpen={() => onOpenTask(task)}
            />
          ))}
        </BoardColumn>
      </div>
    </SortableContext>
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

/**
 * A task, as a board sees it: what kind of thing it is and its key, the title, its labels,
 * and the row of marks that say how it is going and whose it is.
 *
 * Local under E3's third tier — see the note on `BoardScreen` for why this is not §42. What
 * is *not* local is anything the system already draws: the labels are `Chip` (§20) through
 * `LabelStrip`, the assignee is `Avatar` (§93), and every value here is a token. The surface
 * is §12's — white, a hairline, the 8px radius — because that is what a card is in this
 * system, and repeating those three values is cheaper than a component that only holds them.
 */
function TaskCard({
  task,
  draggable,
  onOpen,
}: {
  task: KanbanTaskSummary;
  draggable: boolean;
  onOpen?: () => void;
}) {
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
        background: 'var(--surface-card)',
        border: 'var(--border-width-hairline) solid var(--border-default)',
        borderRadius: 'var(--radius-l)',
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        /* The type, as an edge. `TASK_TYPE_COLOR` is the one map both this card and the
           timer bar read, so a bug is the same colour wherever it is drawn. */
        borderLeft: `4px solid ${TASK_TYPE_COLOR[task.type]}`,
        cursor: draggable ? 'grab' : onOpen ? 'pointer' : 'default',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <TaskTypeGlyph type={task.type} size={14} />
        <span
          style={{
            /* §77's other half: a task key is a literal identifier somebody copies, which is
               what the mono family is for. The numbers on this card are not compared down a
               column, so nothing here wants tabular figures. */
            fontFamily: 'var(--font-family-mono)',
            fontSize: 'var(--font-size-xs)',
            color: 'var(--text-secondary)',
          }}
        >
          {task.key}
        </span>
        {task.childCount > 0 && (
          <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--text-tertiary)' }}>
            ⌐ {task.childCount}
          </span>
        )}
      </div>
      <div
        style={{
          fontSize: 'var(--font-size-s)',
          color: 'var(--text-primary)',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {task.title}
      </div>
      {task.labels && task.labels.length > 0 && (
        <LabelStrip labels={task.labels} testIdPrefix="task-card-label" />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', minHeight: 22 }}>
        {task.priority && <PriorityGlyph priority={task.priority} size={14} />}
        <div
          style={{
            marginLeft: 'auto',
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
          }}
        >
          {task.storyPoints != null && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                fontWeight: 'var(--font-weight-semibold)',
                color: 'var(--text-secondary)',
                background: 'var(--surface-sunken)',
                borderRadius: 'var(--radius-pill)',
                padding: 'var(--space-1) var(--space-4)',
              }}
            >
              {task.storyPoints}
            </span>
          )}
          {task.assignee && <AssigneeAvatar assignee={task.assignee} />}
          {task.dueDate && (
            <span
              style={{
                fontSize: 'var(--font-size-xs)',
                /* Overdue is the one thing on this card that is going badly, so it is the one
                   thing that takes a status hue. */
                color: isOverdueISO(task.dueDate)
                  ? 'var(--status-error)'
                  : 'var(--text-secondary)',
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

/**
 * The mark is **not** `decorative`: a board card writes the assignee's name nowhere else, so
 * a reader who cannot see the circle has no other way to learn whose task this is. That is
 * the case §93's default was written for.
 */
function AssigneeAvatar({ assignee }: { assignee: KanbanAssignee }) {
  return (
    <Avatar
      name={`${assignee.firstName} ${assignee.lastName}`}
      initials={initialsOfMember(assignee)}
      size={22}
      data-testid={`assignee-avatar-${assignee.membershipId}`}
    />
  );
}

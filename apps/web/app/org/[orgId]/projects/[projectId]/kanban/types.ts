import type {
  ColumnCategory,
  TaskActivityAction,
  TaskPriority,
  TaskType,
} from '@devscribed/validation';

/**
 * Kanban surface types (spec 13). Mirror the API contract in
 * `specs/user-management/13-kanban-board.md` §API Contracts — the response
 * shapes here are read verbatim from that spec.
 */

export interface KanbanProject {
  id: string;
  name: string;
  key: string;
  status: 'active' | 'archived';
}

export interface KanbanColumn {
  id: string;
  name: string;
  position: number;
  category: ColumnCategory;
  taskCount: number;
}

export interface KanbanAssignee {
  membershipId: string;
  firstName: string;
  lastName: string;
}

export interface KanbanTaskSummary {
  id: string;
  key: string;
  taskNumber: number;
  type: TaskType;
  title: string;
  priority: TaskPriority | null;
  columnId: string;
  columnName?: string;
  position: number;
  storyPoints: number | null;
  assignee: KanbanAssignee | null;
  dueDate: string | null;
  parentId: string | null;
  parentKey: string | null;
  childCount: number;
  createdAt: string;
  /** Spec 14 — label chips shown on cards (board/list). Backend may return
   * an empty array when the task carries no labels. */
  labels?: TaskLabelChip[];
}

/** Spec 14 — project-scoped label definition (list/board settings). */
export interface KanbanLabel {
  id: string;
  name: string;
  color: string;
  createdAt?: string;
  /** Optional — surface labels endpoint may include the count of tasks currently
   * carrying this label so the Board Settings delete confirmation can display it. */
  assignmentCount?: number;
}

/** Spec 14 — a label chip embedded on a task (card row / detail chip). */
export interface TaskLabelChip {
  id: string;
  name: string;
  color: string;
}

/** Spec 14 — comment as returned by the API. */
export interface TaskCommentAuthor {
  membershipId: string;
  firstName: string;
  lastName: string;
}
export interface TaskComment {
  id: string;
  author: TaskCommentAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/** Spec 14 — watcher row + list response. */
export interface TaskWatcher {
  membershipId: string;
  firstName: string;
  lastName: string;
}
export interface WatchersResponse {
  watchers: TaskWatcher[];
  isWatching: boolean;
}

/** Spec 14 — activity feed row (§API Contracts). */
export interface TaskActivityActor {
  membershipId: string;
  firstName: string;
  lastName: string;
}
export interface TaskActivityRow {
  id: string;
  action: TaskActivityAction;
  actor: TaskActivityActor | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  /** Human-readable snapshot of oldValue at write time (name of column/label/member/parent). */
  oldLabel: string | null;
  /** Human-readable snapshot of newValue at write time. */
  newLabel: string | null;
  createdAt: string;
}

export interface BoardResponse {
  project: KanbanProject;
  columns: KanbanColumn[];
  tasks: KanbanTaskSummary[];
}

export interface TaskListResponse {
  tasks: KanbanTaskSummary[];
}

export interface KanbanTaskChild {
  id: string;
  key: string;
  type: TaskType;
  title: string;
  priority: TaskPriority | null;
  columnName: string;
  columnCategory?: ColumnCategory;
  assignee: KanbanAssignee | null;
}

export interface KanbanTaskParent {
  id: string;
  key: string;
  title: string;
}

export interface KanbanTaskDetail {
  id: string;
  key: string;
  taskNumber: number;
  type: TaskType;
  title: string;
  description: string | null;
  priority: TaskPriority | null;
  columnId: string;
  columnName: string;
  position: number;
  storyPoints: number | null;
  dueDate: string | null;
  assignee: KanbanAssignee | null;
  reporter: KanbanAssignee | null;
  parent: KanbanTaskParent | null;
  children: KanbanTaskChild[];
  createdAt: string;
  updatedAt: string;
  /** Spec 14 — labels currently attached to the task (see §Task Detail — Labels). */
  labels?: TaskLabelChip[];
  /** Spec 15 — total minutes logged against this task, scoped per role (user sees
   * only their own; admin/manager see all members' entries). */
  timeLoggedMinutes?: number;
  /** Spec 15 — up to `TASK_TIME_LOGGED_RECENT_LIMIT` most recent time entries with
   * this taskId, sorted date desc then createdAt desc. Same per-role scoping. */
  recentTimeEntries?: TaskTimeEntryRow[];
}

/** Spec 15 — a row in the task detail's "Time Logged" section. */
export interface TaskTimeEntryRow {
  id: string;
  date: string;
  durationMinutes: number;
  memberName: string;
  membershipId: string;
}

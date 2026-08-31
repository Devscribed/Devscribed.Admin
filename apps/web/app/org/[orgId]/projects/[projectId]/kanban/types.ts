import type {
  ColumnCategory,
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
}

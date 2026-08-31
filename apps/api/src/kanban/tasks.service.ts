import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KANBAN_MESSAGES,
  TASK_PRIORITIES,
  checkTaskHierarchy,
  formatTaskKey,
  parseTaskListSort,
  validateDueDate,
  validateStoryPoints,
  validateTaskDescription,
  validateTaskPriority,
  validateTaskTitle,
  validateTaskType,
  type TaskListSort,
  type TaskPriority,
  type TaskType,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import type { AssigneeSummary } from './board.service';
import { CollaborationService } from './collaboration.service';
import { KanbanAccessService, type CallerMembership, type ProjectContext } from './kanban.shared';

export interface CreateTaskInput {
  type?: unknown;
  title?: unknown;
  description?: unknown;
  priority?: unknown;
  columnId?: unknown;
  storyPoints?: unknown;
  assigneeId?: unknown;
  parentId?: unknown;
  dueDate?: unknown;
}

export interface UpdateTaskInput extends CreateTaskInput {}

export interface MoveTaskInput {
  columnId?: unknown;
  position?: unknown;
}

export interface ListTasksQuery {
  type?: string;
  priority?: string;
  assigneeId?: string;
  columnId?: string;
  sort?: string;
  search?: string;
}

export interface TaskLabelSummary {
  id: string;
  name: string;
  color: string;
}

export interface TaskSummary {
  id: string;
  key: string;
  taskNumber: number;
  type: string;
  title: string;
  priority: string | null;
  columnId: string;
  columnName: string;
  storyPoints: number | null;
  dueDate: string | null;
  assignee: AssigneeSummary | null;
  parentId: string | null;
  parentKey: string | null;
  childCount: number;
  labels: TaskLabelSummary[];
  createdAt: string;
}

export interface TaskDetail extends Omit<TaskSummary, 'parentKey'> {
  description: string | null;
  position: number;
  reporter: AssigneeSummary;
  parent: { id: string; key: string; title: string } | null;
  children: Array<{
    id: string;
    key: string;
    type: string;
    title: string;
    priority: string | null;
    columnName: string;
    columnCategory: string;
    assignee: AssigneeSummary | null;
  }>;
  updatedAt: string;
}

/** Priority ordering for sort — critical → high → medium → low → null. */
const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

/**
 * Spec 13 — task endpoints. Task-number allocation is a `SELECT ... FOR UPDATE` on the
 * project row inside a transaction so concurrent creates never collide (§Concurrency 25).
 * Hierarchy checks use `checkTaskHierarchy` for the pure rule and a separate DB check
 * for existence/same-project/circular. Cross-org lookups always 404 to prevent IDOR.
 */
@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KanbanAccessService,
    private readonly collab: CollaborationService,
  ) {}

  async createTask(
    session: SessionPayload,
    projectId: string,
    input: CreateTaskInput,
  ): Promise<TaskDetail> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-tasks', KANBAN_MESSAGES.tasksPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);
    this.access.requireProjectActive(project);

    const parsed = this.parseTaskFields(input, { requireType: true, requireTitle: true });

    return this.prisma.$transaction(async (tx) => {
      // Serialize `nextTaskNumber` allocation on the project row.
      const rows = await tx.$queryRaw<{ nextTaskNumber: number }[]>`
        SELECT "nextTaskNumber" FROM "Project"
        WHERE "id" = ${project.id}
        FOR UPDATE`;
      const projectRow = rows[0];
      if (!projectRow) {
        throw new NotFoundException({ error: 'not_found', message: 'Project not found' });
      }
      const taskNumber = projectRow.nextTaskNumber;

      // Column selection — omitted defaults to the first column by position.
      const column = await this.resolveColumn(tx, project.id, parsed.columnId);

      // Assignee: must be an active membership in caller's org.
      await this.validateAssignee(tx, caller.organizationId, parsed.assigneeId);

      // Parent: existence, same-project, hierarchy rules.
      const parentType = await this.resolveParentType(tx, project.id, parsed.parentId);
      const hierarchyError = checkTaskHierarchy(parsed.type!, parentType);
      if (hierarchyError) {
        throw new BadRequestException({
          error: this.hierarchyErrorCode(hierarchyError),
          message: hierarchyError,
        });
      }

      // Position: append to end of the target column (max + 1024, or 1024 if empty).
      const last = await tx.task.findFirst({
        where: { projectId: project.id, columnId: column.id },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const position = last ? last.position + 1024 : 1024;

      const created = await tx.task.create({
        data: {
          projectId: project.id,
          taskNumber,
          type: parsed.type!,
          title: parsed.title!,
          description: parsed.description ?? null,
          priority: parsed.priority ?? null,
          columnId: column.id,
          position,
          storyPoints: parsed.storyPoints ?? null,
          assigneeId: parsed.assigneeId ?? null,
          reporterId: caller.id,
          parentId: parsed.parentId ?? null,
          dueDate: parsed.dueDate ? new Date(parsed.dueDate + 'T00:00:00Z') : null,
        },
      });
      await tx.project.update({
        where: { id: project.id },
        data: { nextTaskNumber: taskNumber + 1 },
      });

      // Spec 14 — activity + auto-watch on task creation. The `created` row is written
      // by the reporter (caller), and the reporter is auto-watched (FR-17). If an
      // assignee was set at create time, they are auto-watched too.
      await this.collab.writeActivity(tx, {
        taskId: created.id,
        actorId: caller.id,
        action: 'created',
      });
      await this.collab.autoWatch(tx, {
        taskId: created.id,
        membershipId: caller.id,
        actorId: caller.id,
      });
      if (parsed.assigneeId) {
        await this.collab.autoWatch(tx, {
          taskId: created.id,
          membershipId: parsed.assigneeId,
          actorId: caller.id,
        });
      }

      return this.toDetail(tx, created.id, project.key!);
    });
  }

  async getTask(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<TaskDetail> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId: project.id },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException({ error: 'task_not_found', message: KANBAN_MESSAGES.taskNotFound });
    }
    return this.toDetail(this.prisma, task.id, project.key!);
  }

  async listTasks(
    session: SessionPayload,
    projectId: string,
    query: ListTasksQuery,
  ): Promise<{ tasks: TaskSummary[] }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);

    const types = this.parseCsv(query.type);
    const priorities = this.parseCsv(query.priority);
    const assignees = this.parseCsv(query.assigneeId);
    const columnIds = this.parseCsv(query.columnId);
    const sort = parseTaskListSort(query.sort);
    const search = (query.search ?? '').trim();

    const where = {
      projectId: project.id,
      ...(types.length > 0 ? { type: { in: types } } : {}),
      ...(priorities.length > 0 ? { priority: { in: priorities } } : {}),
      ...(assignees.length > 0 ? { assigneeId: { in: assignees } } : {}),
      ...(columnIds.length > 0 ? { columnId: { in: columnIds } } : {}),
      ...(search.length > 0
        ? { title: { contains: search, mode: 'insensitive' as const } }
        : {}),
    };

    const tasks = await this.prisma.task.findMany({
      where,
      include: {
        column: { select: { name: true } },
        assignee: { include: { account: { select: { firstName: true, lastName: true } } } },
        parent: { select: { taskNumber: true } },
        labels: { include: { label: true } },
        _count: { select: { children: true } },
      },
    });

    const mapped = tasks.map((t) => this.toSummary(t, project.key!));
    this.applySort(mapped, sort);
    return { tasks: mapped };
  }

  async updateTask(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    input: UpdateTaskInput,
  ): Promise<TaskDetail> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-tasks', KANBAN_MESSAGES.tasksPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);
    this.access.requireProjectActive(project);

    const existing = await this.prisma.task.findFirst({
      where: { id: taskId, projectId: project.id },
    });
    if (!existing) {
      throw new NotFoundException({ error: 'task_not_found', message: KANBAN_MESSAGES.taskNotFound });
    }

    const parsed = this.parseTaskFields(input, { requireType: false, requireTitle: false });

    return this.prisma.$transaction(async (tx) => {
      // Effective new type + parent (either the incoming value, or the current one).
      const effectiveType = (parsed.typeProvided ? parsed.type : (existing.type as TaskType))!;
      const effectiveParentId =
        parsed.parentIdProvided ? parsed.parentId ?? null : existing.parentId;

      // Cross-project column changes require validating the new column belongs to project.
      let effectiveColumnId = existing.columnId;
      if (parsed.columnIdProvided && parsed.columnId) {
        const col = await tx.boardColumn.findFirst({
          where: { id: parsed.columnId, projectId: project.id },
        });
        if (!col) {
          throw new BadRequestException({
            error: 'column_not_found',
            message: KANBAN_MESSAGES.columnNotFound,
          });
        }
        effectiveColumnId = col.id;
      }

      if (parsed.assigneeIdProvided) {
        await this.validateAssignee(tx, caller.organizationId, parsed.assigneeId);
      }

      // Hierarchy checks.
      let parentTypeForCheck: TaskType | null = null;
      if (effectiveParentId) {
        if (effectiveParentId === existing.id) {
          throw new BadRequestException({
            error: 'circular_reference',
            message: KANBAN_MESSAGES.circularReference,
          });
        }
        const parent = await tx.task.findUnique({ where: { id: effectiveParentId } });
        if (!parent) {
          throw new BadRequestException({
            error: 'parent_not_found',
            message: KANBAN_MESSAGES.parentNotFound,
          });
        }
        if (parent.projectId !== project.id) {
          throw new BadRequestException({
            error: 'parent_wrong_project',
            message: KANBAN_MESSAGES.parentWrongProject,
          });
        }
        parentTypeForCheck = parent.type as TaskType;
      }
      const hierarchyError = checkTaskHierarchy(effectiveType, parentTypeForCheck);
      if (hierarchyError) {
        throw new BadRequestException({
          error: this.hierarchyErrorCode(hierarchyError),
          message: hierarchyError,
        });
      }

      // If the task's type is changing and it has children, the children's hierarchy
      // rules must still hold with the new parent type.
      if (parsed.typeProvided && effectiveType !== existing.type) {
        const children = await tx.task.findMany({
          where: { parentId: existing.id },
          select: { type: true },
        });
        for (const child of children) {
          const err = checkTaskHierarchy(child.type as TaskType, effectiveType);
          if (err) {
            throw new BadRequestException({
              error: this.hierarchyErrorCode(err),
              message: err,
            });
          }
        }
      }

      await tx.task.update({
        where: { id: existing.id },
        data: {
          ...(parsed.typeProvided ? { type: effectiveType } : {}),
          ...(parsed.titleProvided ? { title: parsed.title! } : {}),
          ...(parsed.descriptionProvided ? { description: parsed.description ?? null } : {}),
          ...(parsed.priorityProvided ? { priority: parsed.priority ?? null } : {}),
          ...(parsed.columnIdProvided ? { columnId: effectiveColumnId } : {}),
          ...(parsed.storyPointsProvided ? { storyPoints: parsed.storyPoints ?? null } : {}),
          ...(parsed.assigneeIdProvided ? { assigneeId: parsed.assigneeId ?? null } : {}),
          ...(parsed.parentIdProvided ? { parentId: effectiveParentId } : {}),
          ...(parsed.dueDateProvided
            ? { dueDate: parsed.dueDate ? new Date(parsed.dueDate + 'T00:00:00Z') : null }
            : {}),
        },
      });

      // Spec 14 — one `field_changed` row per actually-changed field, all sharing the
      // same createdAt so the client can present them as a single logical update
      // (FR-24). Description writes null oldValue/newValue per FR-27.
      const now = new Date();
      const newDueDate =
        parsed.dueDateProvided
          ? (parsed.dueDate ? parsed.dueDate : null)
          : (existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null);
      const oldDueDate = existing.dueDate ? existing.dueDate.toISOString().slice(0, 10) : null;

      const diffs: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
      if (parsed.typeProvided && effectiveType !== existing.type) {
        diffs.push({ field: 'type', oldValue: existing.type, newValue: effectiveType ?? null });
      }
      if (parsed.titleProvided && parsed.title! !== existing.title) {
        diffs.push({ field: 'title', oldValue: existing.title, newValue: parsed.title! });
      }
      if (parsed.descriptionProvided) {
        const newDesc = parsed.description ?? null;
        if (newDesc !== existing.description) {
          diffs.push({ field: 'description', oldValue: null, newValue: null });
        }
      }
      if (parsed.priorityProvided) {
        const newPri = parsed.priority ?? null;
        if (newPri !== existing.priority) {
          diffs.push({ field: 'priority', oldValue: existing.priority, newValue: newPri });
        }
      }
      if (parsed.columnIdProvided && effectiveColumnId !== existing.columnId) {
        diffs.push({
          field: 'columnId',
          oldValue: existing.columnId,
          newValue: effectiveColumnId,
        });
      }
      if (parsed.storyPointsProvided) {
        const newSp = parsed.storyPoints ?? null;
        if (newSp !== existing.storyPoints) {
          diffs.push({
            field: 'storyPoints',
            oldValue: existing.storyPoints == null ? null : String(existing.storyPoints),
            newValue: newSp == null ? null : String(newSp),
          });
        }
      }
      if (parsed.assigneeIdProvided) {
        const newAssignee = parsed.assigneeId ?? null;
        if (newAssignee !== existing.assigneeId) {
          diffs.push({
            field: 'assigneeId',
            oldValue: existing.assigneeId,
            newValue: newAssignee,
          });
        }
      }
      if (parsed.parentIdProvided && effectiveParentId !== existing.parentId) {
        diffs.push({
          field: 'parentId',
          oldValue: existing.parentId,
          newValue: effectiveParentId,
        });
      }
      if (parsed.dueDateProvided && newDueDate !== oldDueDate) {
        diffs.push({ field: 'dueDate', oldValue: oldDueDate, newValue: newDueDate });
      }

      // Spec 14 follow-up — snapshot the display value for FK-shaped fields at write
      // time, so a later delete/rename of a referenced column, member, or parent task
      // does not turn the feed into raw UUIDs. Bulk-resolve the ids up-front.
      const columnIdSet = new Set<string>();
      const memberIdSet = new Set<string>();
      const parentIdSet = new Set<string>();
      for (const d of diffs) {
        if (d.field === 'columnId') {
          if (d.oldValue) columnIdSet.add(d.oldValue);
          if (d.newValue) columnIdSet.add(d.newValue);
        } else if (d.field === 'assigneeId') {
          if (d.oldValue) memberIdSet.add(d.oldValue);
          if (d.newValue) memberIdSet.add(d.newValue);
        } else if (d.field === 'parentId') {
          if (d.oldValue) parentIdSet.add(d.oldValue);
          if (d.newValue) parentIdSet.add(d.newValue);
        }
      }
      const columnNames = new Map<string, string>();
      if (columnIdSet.size > 0) {
        const rows = await tx.boardColumn.findMany({
          where: { id: { in: [...columnIdSet] } },
          select: { id: true, name: true },
        });
        for (const r of rows) columnNames.set(r.id, r.name);
      }
      const memberNames = new Map<string, string>();
      if (memberIdSet.size > 0) {
        const rows = await tx.membership.findMany({
          where: { id: { in: [...memberIdSet] } },
          include: { account: { select: { firstName: true, lastName: true } } },
        });
        for (const r of rows) {
          memberNames.set(r.id, `${r.account.firstName} ${r.account.lastName}`.trim());
        }
      }
      const parentKeys = new Map<string, string>();
      if (parentIdSet.size > 0) {
        const rows = await tx.task.findMany({
          where: { id: { in: [...parentIdSet] } },
          select: { id: true, taskNumber: true },
        });
        for (const r of rows) parentKeys.set(r.id, `${project.key}-${r.taskNumber}`);
      }
      const snapshot = (field: string, value: string | null): string | null => {
        if (value == null) return null;
        if (field === 'columnId') return columnNames.get(value) ?? null;
        if (field === 'assigneeId') return memberNames.get(value) ?? null;
        if (field === 'parentId') return parentKeys.get(value) ?? null;
        return null;
      };

      for (const d of diffs) {
        await this.collab.writeActivity(tx, {
          taskId: existing.id,
          actorId: caller.id,
          action: 'field_changed',
          field: d.field,
          oldValue: d.oldValue,
          newValue: d.newValue,
          oldLabel: snapshot(d.field, d.oldValue),
          newLabel: snapshot(d.field, d.newValue),
          createdAt: now,
        });
      }

      // Auto-watch on assignee change to a non-null value (FR-17). Emits watcher_added
      // only if the assignee was not already watching.
      if (
        parsed.assigneeIdProvided &&
        parsed.assigneeId &&
        parsed.assigneeId !== existing.assigneeId
      ) {
        await this.collab.autoWatch(tx, {
          taskId: existing.id,
          membershipId: parsed.assigneeId,
          actorId: caller.id,
          newLabel: memberNames.get(parsed.assigneeId) ?? null,
        });
      }

      return this.toDetail(tx, existing.id, project.key!);
    });
  }

  async moveTask(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    input: MoveTaskInput,
  ): Promise<{ id: string; columnId: string; columnName: string; position: number }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-tasks', KANBAN_MESSAGES.tasksPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);
    this.access.requireProjectActive(project);

    const columnIdProvided = typeof input.columnId === 'string' && input.columnId.length > 0;
    const positionProvided = typeof input.position === 'number' && Number.isFinite(input.position);
    if (!columnIdProvided && !positionProvided) {
      throw new BadRequestException({
        error: 'move_fields_required',
        message: 'columnId or position is required',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, projectId: project.id },
      });
      if (!task) {
        throw new NotFoundException({
          error: 'task_not_found',
          message: KANBAN_MESSAGES.taskNotFound,
        });
      }

      const previousColumnId = task.columnId;
      let columnId = task.columnId;
      if (columnIdProvided) {
        const col = await tx.boardColumn.findFirst({
          where: { id: input.columnId as string, projectId: project.id },
        });
        if (!col) {
          throw new BadRequestException({
            error: 'column_not_found',
            message: KANBAN_MESSAGES.columnNotFound,
          });
        }
        columnId = col.id;
      }
      const position = positionProvided ? (input.position as number) : task.position;

      await tx.task.update({
        where: { id: task.id },
        data: { columnId, position },
      });

      // Spec 14 FR-25 — column changes log a field_changed row; position-only moves
      // (same column, drag reorder) do NOT emit activity, to keep the feed free of
      // reorder noise.
      const columnRow = await tx.boardColumn.findUnique({ where: { id: columnId } });
      if (columnId !== previousColumnId) {
        const prev = await tx.boardColumn.findUnique({
          where: { id: previousColumnId },
          select: { name: true },
        });
        await this.collab.writeActivity(tx, {
          taskId: task.id,
          actorId: caller.id,
          action: 'field_changed',
          field: 'columnId',
          oldValue: previousColumnId,
          newValue: columnId,
          oldLabel: prev?.name ?? null,
          newLabel: columnRow?.name ?? null,
        });
      }

      return {
        id: task.id,
        columnId,
        columnName: columnRow?.name ?? '',
        position,
      };
    });
  }

  async deleteTask(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ success: true }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-tasks', KANBAN_MESSAGES.tasksPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);
    this.access.requireProjectActive(project);

    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId: project.id },
    });
    if (!task) {
      throw new NotFoundException({
        error: 'task_not_found',
        message: KANBAN_MESSAGES.taskNotFound,
      });
    }

    await this.prisma.task.delete({ where: { id: task.id } });
    return { success: true as const };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private parseCsv(value: string | undefined): string[] {
    if (!value) return [];
    return value.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
  }

  private async resolveColumn(
    tx: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    projectId: string,
    columnId: string | null | undefined,
  ) {
    if (columnId) {
      const col = await (tx as PrismaService).boardColumn.findFirst({
        where: { id: columnId, projectId },
      });
      if (!col) {
        throw new BadRequestException({
          error: 'column_not_found',
          message: KANBAN_MESSAGES.columnNotFound,
        });
      }
      return col;
    }
    // Default → first column by position. Defaults are lazy-created here too so a
    // brand-new project (never GET-ed) still accepts a create.
    const first = await (tx as PrismaService).boardColumn.findFirst({
      where: { projectId },
      orderBy: { position: 'asc' },
    });
    if (first) return first;
    // Lazy-create defaults if the caller went straight to POST without hitting GET.
    await (tx as PrismaService).boardColumn.createMany({
      data: [
        { projectId, name: 'To Do', position: 0, category: 'todo' },
        { projectId, name: 'In Progress', position: 1, category: 'in_progress' },
        { projectId, name: 'Done', position: 2, category: 'done' },
      ],
    });
    return (tx as PrismaService).boardColumn.findFirstOrThrow({
      where: { projectId },
      orderBy: { position: 'asc' },
    });
  }

  private async validateAssignee(
    tx: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    organizationId: string,
    assigneeId: string | null | undefined,
  ): Promise<void> {
    if (!assigneeId) return;
    const m = await (tx as PrismaService).membership.findFirst({
      where: { id: assigneeId, organizationId, status: 'active' },
    });
    if (!m) {
      throw new BadRequestException({
        error: 'assignee_invalid',
        message: KANBAN_MESSAGES.assigneeInvalid,
      });
    }
  }

  private async resolveParentType(
    tx: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    projectId: string,
    parentId: string | null | undefined,
  ): Promise<TaskType | null> {
    if (!parentId) return null;
    const parent = await (tx as PrismaService).task.findUnique({
      where: { id: parentId },
      select: { projectId: true, type: true },
    });
    if (!parent) {
      throw new BadRequestException({
        error: 'parent_not_found',
        message: KANBAN_MESSAGES.parentNotFound,
      });
    }
    if (parent.projectId !== projectId) {
      throw new BadRequestException({
        error: 'parent_wrong_project',
        message: KANBAN_MESSAGES.parentWrongProject,
      });
    }
    return parent.type as TaskType;
  }

  private parseTaskFields(
    input: CreateTaskInput,
    opts: { requireType: boolean; requireTitle: boolean },
  ) {
    const typeProvided = input.type !== undefined;
    const titleProvided = input.title !== undefined;
    const descriptionProvided = input.description !== undefined;
    const priorityProvided = input.priority !== undefined;
    const columnIdProvided = input.columnId !== undefined;
    const storyPointsProvided = input.storyPoints !== undefined;
    const assigneeIdProvided = input.assigneeId !== undefined;
    const parentIdProvided = input.parentId !== undefined;
    const dueDateProvided = input.dueDate !== undefined;

    let type: TaskType | undefined;
    if (opts.requireType || typeProvided) {
      const r = validateTaskType(input.type);
      if (!r.valid) {
        throw new BadRequestException({
          error: input.type == null || input.type === '' ? 'type_required' : 'type_invalid',
          message: r.error,
        });
      }
      type = r.value as TaskType;
    }

    let title: string | undefined;
    if (opts.requireTitle || titleProvided) {
      const r = validateTaskTitle(typeof input.title === 'string' ? input.title : '');
      if (!r.valid) {
        throw new BadRequestException({
          error:
            r.error === KANBAN_MESSAGES.taskTitleTooLong ? 'title_too_long' : 'title_required',
          message: r.error,
        });
      }
      title = r.value;
    }

    let description: string | null | undefined;
    if (descriptionProvided) {
      const r = validateTaskDescription(input.description as string | null);
      if (!r.valid) {
        throw new BadRequestException({ error: 'description_too_long', message: r.error });
      }
      description = r.value;
    }

    let priority: TaskPriority | null | undefined;
    if (priorityProvided) {
      const r = validateTaskPriority(input.priority);
      if (!r.valid) {
        throw new BadRequestException({ error: 'priority_invalid', message: r.error });
      }
      priority = r.value;
    }

    let storyPoints: number | null | undefined;
    if (storyPointsProvided) {
      const r = validateStoryPoints(input.storyPoints as number | string | null);
      if (!r.valid) {
        throw new BadRequestException({ error: 'story_points_invalid', message: r.error });
      }
      storyPoints = r.value;
    }

    let dueDate: string | null | undefined;
    if (dueDateProvided) {
      const r = validateDueDate(input.dueDate as string | null);
      if (!r.valid) {
        throw new BadRequestException({ error: 'due_date_invalid', message: r.error });
      }
      dueDate = r.value;
    }

    const columnId =
      columnIdProvided && typeof input.columnId === 'string' && input.columnId.length > 0
        ? input.columnId
        : null;
    const assigneeId =
      assigneeIdProvided && typeof input.assigneeId === 'string' && input.assigneeId.length > 0
        ? input.assigneeId
        : assigneeIdProvided
          ? null
          : undefined;
    const parentId =
      parentIdProvided && typeof input.parentId === 'string' && input.parentId.length > 0
        ? input.parentId
        : parentIdProvided
          ? null
          : undefined;

    return {
      type,
      title,
      description,
      priority,
      columnId,
      storyPoints,
      assigneeId,
      parentId,
      dueDate,
      typeProvided,
      titleProvided,
      descriptionProvided,
      priorityProvided,
      columnIdProvided,
      storyPointsProvided,
      assigneeIdProvided,
      parentIdProvided,
      dueDateProvided,
    };
  }

  private hierarchyErrorCode(message: string): string {
    switch (message) {
      case KANBAN_MESSAGES.epicCannotHaveParent:
        return 'epic_cannot_have_parent';
      case KANBAN_MESSAGES.subtaskRequiresParent:
        return 'subtask_requires_parent';
      case KANBAN_MESSAGES.subtaskParentInvalid:
        return 'subtask_parent_invalid';
      case KANBAN_MESSAGES.taskParentMustBeEpic:
        return 'task_parent_must_be_epic';
      default:
        return 'hierarchy_invalid';
    }
  }

  private toSummary(
    t: {
      id: string;
      taskNumber: number;
      type: string;
      title: string;
      priority: string | null;
      columnId: string;
      storyPoints: number | null;
      dueDate: Date | null;
      parentId: string | null;
      createdAt: Date;
      column: { name: string };
      assignee:
        | ({ id: string; account: { firstName: string; lastName: string } } | null)
        | null;
      parent: { taskNumber: number } | null;
      labels?: Array<{ label: { id: string; name: string; color: string } }>;
      _count: { children: number };
    },
    projectKey: string,
  ): TaskSummary {
    return {
      id: t.id,
      key: formatTaskKey(projectKey, t.taskNumber),
      taskNumber: t.taskNumber,
      type: t.type,
      title: t.title,
      priority: t.priority,
      columnId: t.columnId,
      columnName: t.column.name,
      storyPoints: t.storyPoints,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      assignee: t.assignee
        ? {
            membershipId: t.assignee.id,
            firstName: t.assignee.account.firstName,
            lastName: t.assignee.account.lastName,
          }
        : null,
      parentId: t.parentId,
      parentKey: t.parent ? formatTaskKey(projectKey, t.parent.taskNumber) : null,
      childCount: t._count.children,
      labels: (t.labels ?? []).map((a) => ({
        id: a.label.id,
        name: a.label.name,
        color: a.label.color,
      })),
      createdAt: t.createdAt.toISOString(),
    };
  }

  private async toDetail(
    tx: PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0],
    taskId: string,
    projectKey: string,
  ): Promise<TaskDetail> {
    const t = await (tx as PrismaService).task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        column: { select: { name: true } },
        assignee: { include: { account: { select: { firstName: true, lastName: true } } } },
        reporter: { include: { account: { select: { firstName: true, lastName: true } } } },
        parent: { select: { id: true, taskNumber: true, title: true } },
        children: {
          include: {
            column: { select: { name: true, category: true } },
            assignee: {
              include: { account: { select: { firstName: true, lastName: true } } },
            },
          },
          orderBy: { taskNumber: 'asc' },
        },
        labels: { include: { label: true } },
        _count: { select: { children: true } },
      },
    });
    return {
      id: t.id,
      key: formatTaskKey(projectKey, t.taskNumber),
      taskNumber: t.taskNumber,
      type: t.type,
      title: t.title,
      description: t.description,
      priority: t.priority,
      columnId: t.columnId,
      columnName: t.column.name,
      position: t.position,
      storyPoints: t.storyPoints,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      assignee: t.assignee
        ? {
            membershipId: t.assignee.id,
            firstName: t.assignee.account.firstName,
            lastName: t.assignee.account.lastName,
          }
        : null,
      reporter: {
        membershipId: t.reporter.id,
        firstName: t.reporter.account.firstName,
        lastName: t.reporter.account.lastName,
      },
      parentId: t.parentId,
      parent: t.parent
        ? { id: t.parent.id, key: formatTaskKey(projectKey, t.parent.taskNumber), title: t.parent.title }
        : null,
      children: t.children.map((c) => ({
        id: c.id,
        key: formatTaskKey(projectKey, c.taskNumber),
        type: c.type,
        title: c.title,
        priority: c.priority,
        columnName: c.column.name,
        columnCategory: c.column.category,
        assignee: c.assignee
          ? {
              membershipId: c.assignee.id,
              firstName: c.assignee.account.firstName,
              lastName: c.assignee.account.lastName,
            }
          : null,
      })),
      childCount: t._count.children,
      labels: t.labels.map((a) => ({
        id: a.label.id,
        name: a.label.name,
        color: a.label.color,
      })),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    };
  }

  private applySort(tasks: TaskSummary[], sort: TaskListSort): void {
    switch (sort) {
      case 'created_desc':
        tasks.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return;
      case 'created_asc':
        tasks.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
        return;
      case 'priority_desc':
        tasks.sort(
          (a, b) =>
            (PRIORITY_RANK[b.priority ?? ''] ?? 0) - (PRIORITY_RANK[a.priority ?? ''] ?? 0) ||
            b.createdAt.localeCompare(a.createdAt),
        );
        return;
      case 'priority_asc':
        tasks.sort(
          (a, b) =>
            (PRIORITY_RANK[a.priority ?? ''] ?? 999) - (PRIORITY_RANK[b.priority ?? ''] ?? 999) ||
            a.createdAt.localeCompare(b.createdAt),
        );
        return;
      case 'due_date_asc':
        tasks.sort(
          (a, b) => this.nullsLast(a.dueDate, b.dueDate, true) || a.createdAt.localeCompare(b.createdAt),
        );
        return;
      case 'due_date_desc':
        tasks.sort(
          (a, b) => this.nullsLast(a.dueDate, b.dueDate, false) || b.createdAt.localeCompare(a.createdAt),
        );
        return;
      case 'story_points_desc':
        tasks.sort(
          (a, b) => (b.storyPoints ?? -1) - (a.storyPoints ?? -1) || b.createdAt.localeCompare(a.createdAt),
        );
        return;
      case 'title_asc':
        tasks.sort((a, b) => a.title.localeCompare(b.title));
        return;
    }
  }

  private nullsLast(a: string | null, b: string | null, asc: boolean): number {
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return asc ? a.localeCompare(b) : b.localeCompare(a);
  }
}

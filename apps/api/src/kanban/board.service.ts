import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  KANBAN_MESSAGES,
  formatTaskKey,
  validateColumnName,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { KanbanAccessService, type CallerMembership, type ProjectContext } from './kanban.shared';

/** Default columns laid down on first `GET /board` — spec 13 FR-3. */
const DEFAULT_COLUMNS: readonly { name: string; category: string; position: number }[] = [
  { name: 'To Do', category: 'todo', position: 0 },
  { name: 'In Progress', category: 'in_progress', position: 1 },
  { name: 'Done', category: 'done', position: 2 },
];

/** Column payload returned by board endpoints. */
export interface ColumnPayload {
  id: string;
  name: string;
  position: number;
  category: string;
  taskCount?: number;
}

/** Task card payload returned by `GET /board`. */
export interface BoardTaskPayload {
  id: string;
  key: string;
  taskNumber: number;
  type: string;
  title: string;
  priority: string | null;
  columnId: string;
  position: number;
  storyPoints: number | null;
  assignee: AssigneeSummary | null;
  dueDate: string | null;
  parentId: string | null;
  parentKey: string | null;
  childCount: number;
  createdAt: string;
}

export interface AssigneeSummary {
  membershipId: string;
  firstName: string;
  lastName: string;
}

export interface BoardResponse {
  project: {
    id: string;
    name: string;
    key: string;
    status: string;
  };
  columns: ColumnPayload[];
  tasks: BoardTaskPayload[];
}

export interface CreateColumnInput {
  name?: unknown;
  position?: unknown;
}

export interface UpdateColumnInput {
  name?: unknown;
}

export interface ReorderColumnsInput {
  columnIds?: unknown;
}

/**
 * Spec 13 — the /board endpoints. The service is thin on purpose: each method resolves
 * caller + project via `KanbanAccessService`, then does one focused DB operation.
 * Column name uniqueness is enforced by a functional unique index on
 * `(projectId, LOWER(name))` — the pre-check gives the clean 409 on the common path,
 * the DB catches races.
 */
@Injectable()
export class BoardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KanbanAccessService,
  ) {}

  /**
   * `GET .../board`. view-board + project-membership for user. Lazy-creates the three
   * default columns on the first call, then returns columns + tasks in one round-trip.
   * Archived projects still load (read-only for admin/manager) — the read itself does
   * not require project-active.
   */
  async getBoard(session: SessionPayload, projectId: string): Promise<BoardResponse> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectKey(project);

    await this.ensureDefaultColumns(project.id);

    const [columns, tasks] = await Promise.all([
      this.prisma.boardColumn.findMany({
        where: { projectId: project.id },
        orderBy: { position: 'asc' },
        include: { _count: { select: { tasks: true } } },
      }),
      this.loadBoardTasks(project.id, project.key!),
    ]);

    return {
      project: {
        id: project.id,
        name: project.name,
        key: project.key!,
        status: project.status,
      },
      columns: columns.map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position,
        category: c.category,
        taskCount: c._count.tasks,
      })),
      tasks,
    };
  }

  /**
   * Lazy-create the three default columns for a project. Idempotent — a unique index on
   * `(projectId, position)` and a case-insensitive unique on `(projectId, LOWER(name))`
   * are the DB safety nets. A second concurrent GET may collide with the first; we
   * silently ignore that and re-read.
   */
  private async ensureDefaultColumns(projectId: string): Promise<void> {
    const existing = await this.prisma.boardColumn.count({ where: { projectId } });
    if (existing > 0) return;
    try {
      await this.prisma.boardColumn.createMany({
        data: DEFAULT_COLUMNS.map((c) => ({
          projectId,
          name: c.name,
          position: c.position,
          category: c.category,
        })),
      });
    } catch {
      // Race with another concurrent first-access — the other call created them.
    }
  }

  private async loadBoardTasks(projectId: string, projectKey: string): Promise<BoardTaskPayload[]> {
    const tasks = await this.prisma.task.findMany({
      where: { projectId },
      orderBy: [{ columnId: 'asc' }, { position: 'asc' }],
      include: {
        assignee: { include: { account: { select: { firstName: true, lastName: true } } } },
        parent: { select: { taskNumber: true } },
        _count: { select: { children: true } },
      },
    });
    return tasks.map((t) => ({
      id: t.id,
      key: formatTaskKey(projectKey, t.taskNumber),
      taskNumber: t.taskNumber,
      type: t.type,
      title: t.title,
      priority: t.priority,
      columnId: t.columnId,
      position: t.position,
      storyPoints: t.storyPoints,
      assignee: t.assignee
        ? {
            membershipId: t.assignee.id,
            firstName: t.assignee.account.firstName,
            lastName: t.assignee.account.lastName,
          }
        : null,
      dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : null,
      parentId: t.parentId,
      parentKey: t.parent ? formatTaskKey(projectKey, t.parent.taskNumber) : null,
      childCount: t._count.children,
      createdAt: t.createdAt.toISOString(),
    }));
  }

  /**
   * `POST .../board/columns`. manage-board-columns. If `position` is omitted the column
   * appends to the end. If provided, existing columns at ≥ position are shifted right —
   * done in a transaction so the `(projectId, position)` uniqueness never breaks between
   * the shift and the insert.
   */
  async createColumn(
    session: SessionPayload,
    projectId: string,
    input: CreateColumnInput,
  ): Promise<ColumnPayload> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-board-columns', KANBAN_MESSAGES.columnsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    const nameResult = validateColumnName(typeof input.name === 'string' ? input.name : '');
    if (!nameResult.valid) {
      throw new BadRequestException({ errors: { name: nameResult.error } });
    }
    const name = nameResult.value;

    // Case-insensitive name pre-check for the clean 409.
    await this.assertColumnNameAvailable(project.id, name, null);

    // Ensure defaults exist so the "add before any is initialized" path still lands cleanly.
    await this.ensureDefaultColumns(project.id);

    return this.prisma.$transaction(async (tx) => {
      const columns = await tx.boardColumn.findMany({
        where: { projectId: project.id },
        orderBy: { position: 'asc' },
      });
      const nextPosition = columns.length;
      const requestedPosition =
        typeof input.position === 'number' && Number.isInteger(input.position)
          ? Math.max(0, Math.min(input.position, nextPosition))
          : nextPosition;

      if (requestedPosition < nextPosition) {
        // Two-phase shift: move colliders to temp positions above the whole range,
        // then down to the correct final positions. The `(projectId, position)` unique
        // constraint would otherwise reject a naive `position += 1` update.
        const affected = columns.filter((c) => c.position >= requestedPosition);
        const TEMP = 1_000_000;
        for (const c of affected) {
          await tx.boardColumn.update({
            where: { id: c.id },
            data: { position: c.position + TEMP },
          });
        }
        for (const c of affected) {
          await tx.boardColumn.update({
            where: { id: c.id },
            data: { position: c.position + 1 },
          });
        }
      }

      const created = await tx.boardColumn.create({
        data: {
          projectId: project.id,
          name,
          position: requestedPosition,
          category: 'custom',
        },
      });
      return {
        id: created.id,
        name: created.name,
        position: created.position,
        category: created.category,
      };
    });
  }

  /** `PUT .../board/columns/:id`. Rename only (position is set via reorder). */
  async renameColumn(
    session: SessionPayload,
    projectId: string,
    columnId: string,
    input: UpdateColumnInput,
  ): Promise<ColumnPayload> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-board-columns', KANBAN_MESSAGES.columnsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    const column = await this.prisma.boardColumn.findFirst({
      where: { id: columnId, projectId: project.id },
    });
    if (!column) {
      throw new NotFoundException({ error: 'column_not_found', message: KANBAN_MESSAGES.columnNotFound });
    }

    const nameResult = validateColumnName(typeof input.name === 'string' ? input.name : '');
    if (!nameResult.valid) {
      throw new BadRequestException({ errors: { name: nameResult.error } });
    }
    const name = nameResult.value;
    await this.assertColumnNameAvailable(project.id, name, column.id);

    const updated = await this.prisma.boardColumn.update({
      where: { id: column.id },
      data: { name },
    });
    return {
      id: updated.id,
      name: updated.name,
      position: updated.position,
      category: updated.category,
    };
  }

  /**
   * `PUT .../board/columns/reorder`. The client sends the FULL ordered id list;
   * anything else is 400 column_ids_mismatch (missing ids, extras, dupes). Positions
   * are rewritten 0..N-1 inside a transaction, again via a two-phase temp-shift so the
   * `(projectId, position)` unique constraint holds throughout.
   */
  async reorderColumns(
    session: SessionPayload,
    projectId: string,
    input: ReorderColumnsInput,
  ): Promise<{ success: true }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-board-columns', KANBAN_MESSAGES.columnsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    if (!Array.isArray(input.columnIds) || !input.columnIds.every((v) => typeof v === 'string')) {
      throw new BadRequestException({
        error: 'column_ids_mismatch',
        message: KANBAN_MESSAGES.columnIdsMismatch,
      });
    }
    const ids = input.columnIds as string[];
    if (new Set(ids).size !== ids.length) {
      throw new BadRequestException({
        error: 'column_ids_mismatch',
        message: KANBAN_MESSAGES.columnIdsMismatch,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const columns = await tx.boardColumn.findMany({
        where: { projectId: project.id },
        select: { id: true },
      });
      const known = new Set(columns.map((c) => c.id));
      if (ids.length !== known.size || !ids.every((id) => known.has(id))) {
        throw new BadRequestException({
          error: 'column_ids_mismatch',
          message: KANBAN_MESSAGES.columnIdsMismatch,
        });
      }

      const TEMP = 1_000_000;
      for (let i = 0; i < ids.length; i++) {
        await tx.boardColumn.update({
          where: { id: ids[i] },
          data: { position: TEMP + i },
        });
      }
      for (let i = 0; i < ids.length; i++) {
        await tx.boardColumn.update({
          where: { id: ids[i] },
          data: { position: i },
        });
      }
      return { success: true as const };
    });
  }

  /**
   * `DELETE .../board/columns/:id`. Refuses if the column holds any tasks (spec 13 FR-5)
   * or if it's the last column on the board. Positions of following columns are shifted
   * down to keep the sequence contiguous.
   */
  async deleteColumn(
    session: SessionPayload,
    projectId: string,
    columnId: string,
  ): Promise<{ success: true }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-board-columns', KANBAN_MESSAGES.columnsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    return this.prisma.$transaction(async (tx) => {
      const column = await tx.boardColumn.findFirst({
        where: { id: columnId, projectId: project.id },
        include: { _count: { select: { tasks: true } } },
      });
      if (!column) {
        throw new NotFoundException({
          error: 'column_not_found',
          message: KANBAN_MESSAGES.columnNotFound,
        });
      }
      const total = await tx.boardColumn.count({ where: { projectId: project.id } });
      if (total <= 1) {
        throw new BadRequestException({
          error: 'column_delete_last',
          message: KANBAN_MESSAGES.columnDeleteLast,
        });
      }
      if (column._count.tasks > 0) {
        throw new BadRequestException({
          error: 'column_not_empty',
          message: KANBAN_MESSAGES.columnNotEmpty,
        });
      }

      await tx.boardColumn.delete({ where: { id: column.id } });

      // Shift down columns after the deleted position so the sequence stays 0..N-1.
      const after = await tx.boardColumn.findMany({
        where: { projectId: project.id, position: { gt: column.position } },
        orderBy: { position: 'asc' },
      });
      const TEMP = 1_000_000;
      for (const c of after) {
        await tx.boardColumn.update({ where: { id: c.id }, data: { position: c.position + TEMP } });
      }
      for (const c of after) {
        await tx.boardColumn.update({ where: { id: c.id }, data: { position: c.position - 1 } });
      }
      return { success: true as const };
    });
  }

  private async assertColumnNameAvailable(
    projectId: string,
    name: string,
    excludeColumnId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.boardColumn.findFirst({
      where: {
        projectId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeColumnId ? { id: { not: excludeColumnId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: 'column_name_duplicate',
        message: KANBAN_MESSAGES.columnNameDuplicate,
      });
    }
  }

  /**
   * Small helper for TasksService — the project row lock is what serializes concurrent
   * task creates so `nextTaskNumber` is allocated atomically. Not part of the public API.
   */
  static readonly _unused_stub = null;
}

import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  COLLAB_MESSAGES,
  KANBAN_MESSAGES,
  validateLabelColor,
  validateLabelName,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { CollaborationService } from './collaboration.service';
import { KanbanAccessService } from './kanban.shared';

export interface CreateLabelInput {
  name?: unknown;
  color?: unknown;
}

export interface UpdateLabelInput {
  name?: unknown;
  color?: unknown;
}

export interface LabelSummary {
  id: string;
  projectId: string;
  name: string;
  color: string;
  createdAt: string;
}

/**
 * List-endpoint row: extends the base summary with `assignmentCount` — how many tasks
 * currently carry this label. The web needs this before the DELETE call, so the delete
 * confirmation string (spec 14 §Error Messages) can quote the real number. The single
 * mutation endpoints (POST/PUT) still return `LabelSummary` — a fresh row has no
 * assignments and there's no point re-counting after a name/color edit.
 */
export interface LabelListRow extends LabelSummary {
  assignmentCount: number;
}

/**
 * Spec 14 — labels service. Definition endpoints (`manage-labels`) and per-task
 * assignment endpoints (`manage-tasks`) live together — they share the "label belongs
 * to project" IDOR check and both write to the collaboration activity feed.
 *
 * Uniqueness of label name is case-insensitive per project. The service pre-checks so
 * the caller gets the spec's 409 message; a functional unique index on `LOWER(name)` is
 * the DB race backstop.
 */
@Injectable()
export class LabelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KanbanAccessService,
    private readonly collab: CollaborationService,
  ) {}

  // ─── Definition endpoints (Board Settings) ──────────────────────────

  async createLabel(
    session: SessionPayload,
    projectId: string,
    input: CreateLabelInput,
  ): Promise<LabelSummary> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-labels', COLLAB_MESSAGES.labelsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    const nameR = validateLabelName(typeof input.name === 'string' ? input.name : '');
    if (!nameR.valid) {
      throw new BadRequestException({
        error: nameR.error === COLLAB_MESSAGES.labelNameTooLong ? 'label_name_too_long' : 'label_name_required',
        message: nameR.error,
      });
    }
    const colorR = validateLabelColor(typeof input.color === 'string' ? input.color : '');
    if (!colorR.valid) {
      throw new BadRequestException({ error: 'label_color_invalid', message: colorR.error });
    }

    await this.assertNameAvailable(project.id, nameR.value, null);

    const created = await this.prisma.taskLabel.create({
      data: { projectId: project.id, name: nameR.value, color: colorR.value },
    });
    return this.toSummary(created);
  }

  async updateLabel(
    session: SessionPayload,
    projectId: string,
    labelId: string,
    input: UpdateLabelInput,
  ): Promise<LabelSummary> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-labels', COLLAB_MESSAGES.labelsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    const label = await this.prisma.taskLabel.findFirst({
      where: { id: labelId, projectId: project.id },
    });
    if (!label) {
      throw new NotFoundException({ error: 'label_not_found', message: COLLAB_MESSAGES.labelNotFound });
    }

    const nameProvided = input.name !== undefined;
    const colorProvided = input.color !== undefined;

    let newName = label.name;
    if (nameProvided) {
      const r = validateLabelName(typeof input.name === 'string' ? input.name : '');
      if (!r.valid) {
        throw new BadRequestException({
          error: r.error === COLLAB_MESSAGES.labelNameTooLong ? 'label_name_too_long' : 'label_name_required',
          message: r.error,
        });
      }
      newName = r.value;
    }

    let newColor = label.color;
    if (colorProvided) {
      const r = validateLabelColor(typeof input.color === 'string' ? input.color : '');
      if (!r.valid) {
        throw new BadRequestException({ error: 'label_color_invalid', message: r.error });
      }
      newColor = r.value;
    }

    if (nameProvided) {
      await this.assertNameAvailable(project.id, newName, label.id);
    }

    const updated = await this.prisma.taskLabel.update({
      where: { id: label.id },
      data: {
        ...(nameProvided ? { name: newName } : {}),
        ...(colorProvided ? { color: newColor } : {}),
      },
    });
    return this.toSummary(updated);
  }

  async deleteLabel(
    session: SessionPayload,
    projectId: string,
    labelId: string,
  ): Promise<{ success: true; unassignedFromTaskCount: number }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-labels', COLLAB_MESSAGES.labelsPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    this.access.requireProjectActive(project);

    return this.prisma.$transaction(async (tx) => {
      const label = await tx.taskLabel.findFirst({
        where: { id: labelId, projectId: project.id },
      });
      if (!label) {
        throw new NotFoundException({
          error: 'label_not_found',
          message: COLLAB_MESSAGES.labelNotFound,
        });
      }
      const unassignedFromTaskCount = await tx.taskLabelAssignment.count({
        where: { labelId: label.id },
      });
      // Cascade deletes TaskLabelAssignment rows via FK. Per spec 14 §Security 12, the
      // corresponding activity history (label_added / label_removed rows) is preserved;
      // cascade delete does not emit new label_removed entries.
      await tx.taskLabel.delete({ where: { id: label.id } });
      return { success: true as const, unassignedFromTaskCount };
    });
  }

  async listLabels(
    session: SessionPayload,
    projectId: string,
  ): Promise<{ labels: LabelListRow[] }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);

    const labels = await this.prisma.taskLabel.findMany({
      where: { projectId: project.id },
      orderBy: [{ name: 'asc' }],
      include: { _count: { select: { assignments: true } } },
    });
    return {
      labels: labels.map((l) => ({
        ...this.toSummary(l),
        assignmentCount: l._count.assignments,
      })),
    };
  }

  // ─── Assignment endpoints (task detail) ─────────────────────────────

  async assignLabel(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    input: { labelId?: unknown },
  ): Promise<{ taskId: string; labelId: string }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-tasks', KANBAN_MESSAGES.tasksPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);

    const labelId = typeof input.labelId === 'string' ? input.labelId : '';
    if (!labelId) {
      throw new BadRequestException({
        error: 'label_id_required',
        message: 'labelId is required',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, projectId: project.id },
        select: { id: true, projectId: true },
      });
      if (!task) {
        throw new NotFoundException({
          error: 'task_not_found',
          message: KANBAN_MESSAGES.taskNotFound,
        });
      }
      // Label must exist — scoped to caller's org via the project relation.
      const label = await tx.taskLabel.findFirst({
        where: { id: labelId, project: { organizationId: caller.organizationId } },
        select: { id: true, projectId: true, name: true },
      });
      if (!label) {
        throw new NotFoundException({
          error: 'label_not_found',
          message: COLLAB_MESSAGES.labelNotFound,
        });
      }
      // Same-project constraint (spec 14 FR-6 / IDOR).
      if (label.projectId !== task.projectId) {
        throw new BadRequestException({
          error: 'label_wrong_project',
          message: COLLAB_MESSAGES.labelWrongProject,
        });
      }

      // Idempotent — composite PK on (taskId,labelId) rejects the second insert,
      // and we skip the activity entry if the row already existed.
      const existing = await tx.taskLabelAssignment.findUnique({
        where: { taskId_labelId: { taskId: task.id, labelId: label.id } },
      });
      if (!existing) {
        await tx.taskLabelAssignment.create({
          data: { taskId: task.id, labelId: label.id },
        });
        await this.collab.writeActivity(tx, {
          taskId: task.id,
          actorId: caller.id,
          action: 'label_added',
          newValue: label.id,
          newLabel: label.name,
        });
      }
      return { taskId: task.id, labelId: label.id };
    });
  }

  async removeLabel(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    labelId: string,
  ): Promise<{ success: true }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'manage-tasks', KANBAN_MESSAGES.tasksPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);

    return this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, projectId: project.id },
        select: { id: true },
      });
      if (!task) {
        throw new NotFoundException({
          error: 'task_not_found',
          message: KANBAN_MESSAGES.taskNotFound,
        });
      }
      const existing = await tx.taskLabelAssignment.findUnique({
        where: { taskId_labelId: { taskId: task.id, labelId } },
        include: { label: { select: { name: true } } },
      });
      if (existing) {
        await tx.taskLabelAssignment.delete({
          where: { taskId_labelId: { taskId: task.id, labelId } },
        });
        await this.collab.writeActivity(tx, {
          taskId: task.id,
          actorId: caller.id,
          action: 'label_removed',
          oldValue: labelId,
          oldLabel: existing.label?.name ?? null,
        });
      }
      return { success: true as const };
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────

  private async assertNameAvailable(
    projectId: string,
    name: string,
    excludeLabelId: string | null,
  ): Promise<void> {
    const existing = await this.prisma.taskLabel.findFirst({
      where: {
        projectId,
        name: { equals: name, mode: 'insensitive' },
        ...(excludeLabelId ? { id: { not: excludeLabelId } } : {}),
      },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException({
        error: 'label_name_duplicate',
        message: COLLAB_MESSAGES.labelNameDuplicate,
      });
    }
  }

  private toSummary(l: {
    id: string;
    projectId: string;
    name: string;
    color: string;
    createdAt: Date;
  }): LabelSummary {
    return {
      id: l.id,
      projectId: l.projectId,
      name: l.name,
      color: l.color,
      createdAt: l.createdAt.toISOString(),
    };
  }
}

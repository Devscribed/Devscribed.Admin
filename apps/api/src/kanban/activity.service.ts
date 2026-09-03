import { Injectable, NotFoundException } from '@nestjs/common';
import { KANBAN_MESSAGES } from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { KanbanAccessService } from './kanban.shared';

export interface ActivityActor {
  membershipId: string;
  firstName: string;
  lastName: string;
}

export interface ActivityRow {
  id: string;
  action: string;
  actor: ActivityActor;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  /** Snapshot of oldValue at write time — see TaskActivity.oldLabel. */
  oldLabel: string | null;
  newLabel: string | null;
  createdAt: string;
}

/**
 * Spec 14 — read-only activity feed. Unpaginated (FR-26); the full history of the task
 * comes back in one call, ordered oldest-first. Actor is resolved to display fields
 * server-side so the UI can render without a second lookup.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KanbanAccessService,
  ) {}

  async listActivity(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ activity: ActivityRow[] }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    await this.requireTask(project.id, taskId);

    const rows = await this.prisma.taskActivity.findMany({
      where: { taskId },
      include: {
        actor: { include: { account: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return {
      activity: rows.map((r) => ({
        id: r.id,
        action: r.action,
        actor: {
          membershipId: r.actor.id,
          firstName: r.actor.account.firstName,
          lastName: r.actor.account.lastName,
        },
        field: r.field,
        oldValue: r.oldValue,
        newValue: r.newValue,
        oldLabel: r.oldLabel,
        newLabel: r.newLabel,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  private async requireTask(projectId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId },
      select: { id: true },
    });
    if (!task) {
      throw new NotFoundException({
        error: 'task_not_found',
        message: KANBAN_MESSAGES.taskNotFound,
      });
    }
  }
}

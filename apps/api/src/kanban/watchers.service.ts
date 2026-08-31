import { Injectable, NotFoundException } from '@nestjs/common';
import { KANBAN_MESSAGES } from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { CollaborationService } from './collaboration.service';
import { KanbanAccessService } from './kanban.shared';

export interface WatcherEntry {
  membershipId: string;
  firstName: string;
  lastName: string;
}

/**
 * Spec 14 — watchers. Idempotent watch/unwatch on the caller's own membership only
 * (spec 14 Validation Rule 6 — no cross-member toggle via this API). Manual removal
 * takes precedence: auto-watch triggers do not re-add a member who has un-watched a
 * task, unless a new subscribable event fires (comment, re-assignment). That behaviour
 * is enforced by the auto-watch call sites, not by this service.
 */
@Injectable()
export class WatchersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KanbanAccessService,
    private readonly collab: CollaborationService,
  ) {}

  async listWatchers(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ watchers: WatcherEntry[]; isWatching: boolean }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    await this.requireTask(project.id, taskId);

    const rows = await this.prisma.taskWatcher.findMany({
      where: { taskId },
      include: {
        membership: {
          include: { account: { select: { firstName: true, lastName: true } } },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
    const watchers = rows.map((r) => ({
      membershipId: r.membership.id,
      firstName: r.membership.account.firstName,
      lastName: r.membership.account.lastName,
    }));
    const isWatching = watchers.some((w) => w.membershipId === caller.id);
    return { watchers, isWatching };
  }

  async watch(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ taskId: string; membershipId: string }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);
    const task = await this.requireTask(project.id, taskId);

    await this.prisma.$transaction(async (tx) => {
      const { added } = await this.collab.ensureWatcher(tx, task.id, caller.id);
      if (added) {
        const name = await this.resolveMemberName(tx, caller.id);
        await this.collab.writeActivity(tx, {
          taskId: task.id,
          actorId: caller.id,
          action: 'watcher_added',
          newValue: caller.id,
          newLabel: name,
        });
      }
    });
    return { taskId: task.id, membershipId: caller.id };
  }

  async unwatch(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ success: true }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);
    const task = await this.requireTask(project.id, taskId);

    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.taskWatcher.findUnique({
        where: { taskId_membershipId: { taskId: task.id, membershipId: caller.id } },
      });
      if (existing) {
        await tx.taskWatcher.delete({
          where: { taskId_membershipId: { taskId: task.id, membershipId: caller.id } },
        });
        const name = await this.resolveMemberName(tx, caller.id);
        await this.collab.writeActivity(tx, {
          taskId: task.id,
          actorId: caller.id,
          action: 'watcher_removed',
          oldValue: caller.id,
          oldLabel: name,
        });
      }
    });
    return { success: true as const };
  }

  private async resolveMemberName(
    tx: { membership: PrismaService['membership'] },
    membershipId: string,
  ): Promise<string | null> {
    const m = await tx.membership.findUnique({
      where: { id: membershipId },
      include: { account: { select: { firstName: true, lastName: true } } },
    });
    if (!m) return null;
    return `${m.account.firstName} ${m.account.lastName}`.trim();
  }

  private async requireTask(projectId: string, taskId: string): Promise<{ id: string }> {
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
    return task;
  }
}

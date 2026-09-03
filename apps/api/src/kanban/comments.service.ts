import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  COLLAB_MESSAGES,
  KANBAN_MESSAGES,
  validateCommentContent,
} from '@devscribed/validation';
import type { SessionPayload } from '../auth/session.service';
import { PrismaService } from '../prisma.service';
import { CollaborationService } from './collaboration.service';
import { KanbanAccessService } from './kanban.shared';

export interface CommentAuthor {
  membershipId: string;
  firstName: string;
  lastName: string;
}

export interface CommentSummary {
  id: string;
  taskId: string;
  author: CommentAuthor;
  content: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Spec 14 — comments service. Content is markdown, 1–10,000 codepoints. Author-only
 * edit; author-or-admin/manager delete. Creating a comment auto-watches the author
 * (FR-15/FR-17) and appends `comment_added` to the activity feed. Deleting a comment
 * hard-deletes the row but leaves the `comment_added` activity entry in place and
 * appends a `comment_deleted` entry (FR-13).
 */
@Injectable()
export class CommentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KanbanAccessService,
    private readonly collab: CollaborationService,
  ) {}

  async listComments(
    session: SessionPayload,
    projectId: string,
    taskId: string,
  ): Promise<{ comments: CommentSummary[] }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    await this.requireTask(project.id, taskId);

    const rows = await this.prisma.taskComment.findMany({
      where: { taskId },
      include: {
        author: { include: { account: { select: { firstName: true, lastName: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { comments: rows.map((r) => this.toSummary(r)) };
  }

  async createComment(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    input: { content?: unknown },
  ): Promise<CommentSummary> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);
    const task = await this.requireTask(project.id, taskId);

    const r = validateCommentContent(typeof input.content === 'string' ? input.content : '');
    if (!r.valid) {
      throw new BadRequestException({
        error: r.error === COLLAB_MESSAGES.commentContentTooLong ? 'content_too_long' : 'content_required',
        message: r.error,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.taskComment.create({
        data: { taskId: task.id, authorId: caller.id, content: r.value },
        include: {
          author: { include: { account: { select: { firstName: true, lastName: true } } } },
        },
      });
      await this.collab.writeActivity(tx, {
        taskId: task.id,
        actorId: caller.id,
        action: 'comment_added',
      });
      // Auto-watch the commenter (FR-15/FR-17). Emits watcher_added only if new.
      await this.collab.autoWatch(tx, {
        taskId: task.id,
        membershipId: caller.id,
        actorId: caller.id,
      });
      return this.toSummary(created);
    });
  }

  async updateComment(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    commentId: string,
    input: { content?: unknown },
  ): Promise<CommentSummary> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);
    await this.requireTask(project.id, taskId);

    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId },
    });
    if (!comment) {
      throw new NotFoundException({
        error: 'comment_not_found',
        message: COLLAB_MESSAGES.commentNotFound,
      });
    }
    // Edit is author-only. Admin/manager cannot edit others' comments (spec 14 FR-11).
    if (comment.authorId !== caller.id) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: COLLAB_MESSAGES.commentEditForbidden,
      });
    }

    const r = validateCommentContent(typeof input.content === 'string' ? input.content : '');
    if (!r.valid) {
      throw new BadRequestException({
        error: r.error === COLLAB_MESSAGES.commentContentTooLong ? 'content_too_long' : 'content_required',
        message: r.error,
      });
    }

    const updated = await this.prisma.taskComment.update({
      where: { id: comment.id },
      data: { content: r.value },
      include: {
        author: { include: { account: { select: { firstName: true, lastName: true } } } },
      },
    });
    return this.toSummary(updated);
  }

  async deleteComment(
    session: SessionPayload,
    projectId: string,
    taskId: string,
    commentId: string,
  ): Promise<{ success: true }> {
    const caller = await this.access.requireCaller(session);
    this.access.requireCapability(caller, 'view-board', KANBAN_MESSAGES.boardPermissionDenied);
    const project = await this.access.requireProject(caller, projectId);
    await this.access.requireProjectAccess(caller, project, KANBAN_MESSAGES.boardPermissionDenied);
    this.access.requireProjectActive(project);
    await this.requireTask(project.id, taskId);

    const comment = await this.prisma.taskComment.findFirst({
      where: { id: commentId, taskId },
    });
    if (!comment) {
      throw new NotFoundException({
        error: 'comment_not_found',
        message: COLLAB_MESSAGES.commentNotFound,
      });
    }
    const isOwner = comment.authorId === caller.id;
    const isPrivileged = caller.role === 'admin' || caller.role === 'manager';
    if (!isOwner && !isPrivileged) {
      throw new ForbiddenException({
        error: 'forbidden',
        message: COLLAB_MESSAGES.commentDeleteForbidden,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.taskComment.delete({ where: { id: comment.id } });
      // Preserves comment_added history (FR-13); appends a comment_deleted entry.
      await this.collab.writeActivity(tx, {
        taskId,
        actorId: caller.id,
        action: 'comment_deleted',
      });
      return { success: true as const };
    });
  }

  // ─── helpers ────────────────────────────────────────────────────────

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

  private toSummary(row: {
    id: string;
    taskId: string;
    content: string;
    createdAt: Date;
    updatedAt: Date;
    author: { id: string; account: { firstName: string; lastName: string } };
  }): CommentSummary {
    return {
      id: row.id,
      taskId: row.taskId,
      author: {
        membershipId: row.author.id,
        firstName: row.author.account.firstName,
        lastName: row.author.account.lastName,
      },
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

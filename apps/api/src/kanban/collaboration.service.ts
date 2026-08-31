import { Injectable } from '@nestjs/common';
import type { TaskActivityAction } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';

/**
 * Prisma transaction client type, aliased from the `$transaction` callback signature so
 * this file does not have to import from `@prisma/client` directly (Prisma re-exports it
 * as `Prisma.TransactionClient`, but the tasks module already uses this shape).
 */
type Tx = PrismaService | Parameters<Parameters<PrismaService['$transaction']>[0]>[0];

/**
 * Spec 14 — small helpers shared by every collaboration controller AND by TasksService
 * (spec 13) so its create/update/move handlers can emit activity + auto-watch entries.
 *
 * Kept intentionally auth-free: the caller has already run capability + project-scope
 * checks. This class only writes rows, never checks who may.
 */
@Injectable()
export class CollaborationService {
  /**
   * Append one row to `TaskActivity`. The append-only feed has no update or delete
   * path; callers may only add. `field`/`oldValue`/`newValue` are only meaningful when
   * `action === 'field_changed'`, but `newValue` also carries the label id (or member
   * id) on `label_added` / `watcher_added` rows, and `oldValue` mirrors that on the
   * `*_removed` rows (spec 14 §API Contracts).
   */
  async writeActivity(
    tx: Tx,
    args: {
      taskId: string;
      actorId: string;
      action: TaskActivityAction;
      field?: string | null;
      oldValue?: string | null;
      newValue?: string | null;
      /**
       * Human-readable snapshot of `oldValue`/`newValue` at write time — the column
       * name, label name, member "First Last", parent-task key. Preserves the value
       * shown in the feed even after the referenced row is deleted or renamed.
       */
      oldLabel?: string | null;
      newLabel?: string | null;
      createdAt?: Date;
    },
  ): Promise<void> {
    await (tx as PrismaService).taskActivity.create({
      data: {
        taskId: args.taskId,
        actorId: args.actorId,
        action: args.action,
        field: args.field ?? null,
        oldValue: args.oldValue ?? null,
        newValue: args.newValue ?? null,
        oldLabel: args.oldLabel ?? null,
        newLabel: args.newLabel ?? null,
        ...(args.createdAt ? { createdAt: args.createdAt } : {}),
      },
    });
  }

  /**
   * Idempotent watcher insert. Returns `{ added: true }` when the row was newly created,
   * `{ added: false }` when it already existed. The composite PK (`taskId`,`membershipId`)
   * makes the insert-on-conflict racy-safe at the DB level; we still do a pre-check so
   * the return value tells the caller whether to emit a `watcher_added` activity row.
   */
  async ensureWatcher(
    tx: Tx,
    taskId: string,
    membershipId: string,
  ): Promise<{ added: boolean }> {
    const existing = await (tx as PrismaService).taskWatcher.findUnique({
      where: { taskId_membershipId: { taskId, membershipId } },
    });
    if (existing) return { added: false };
    try {
      await (tx as PrismaService).taskWatcher.create({
        data: { taskId, membershipId },
      });
      return { added: true };
    } catch {
      // A concurrent create won — treat as an idempotent no-op.
      return { added: false };
    }
  }

  /**
   * Auto-watch + activity in one call — the common auto-watch path from spec 14 FR-17
   * (reporter on create, assignee on set, commenter on comment). Emits `watcher_added`
   * only when the row was newly added; a no-op when the member was already watching.
   * `actorId` is the person who caused the watch (== membershipId for the reporter and
   * the commenter; == the caller for auto-watch-on-assignment).
   */
  async autoWatch(
    tx: Tx,
    args: {
      taskId: string;
      membershipId: string;
      actorId: string;
      /** Human-readable name of the added watcher for the activity snapshot. */
      newLabel?: string | null;
      createdAt?: Date;
    },
  ): Promise<void> {
    const { added } = await this.ensureWatcher(tx, args.taskId, args.membershipId);
    if (!added) return;
    // Resolve the member's display name if the caller didn't pre-compute it — keeps
    // the activity feed intelligible after the member is later removed/renamed.
    let newLabel = args.newLabel ?? null;
    if (newLabel == null) {
      const m = await (tx as PrismaService).membership.findUnique({
        where: { id: args.membershipId },
        include: { account: { select: { firstName: true, lastName: true } } },
      });
      if (m) newLabel = `${m.account.firstName} ${m.account.lastName}`.trim();
    }
    await this.writeActivity(tx, {
      taskId: args.taskId,
      actorId: args.actorId,
      action: 'watcher_added',
      newValue: args.membershipId,
      newLabel,
      createdAt: args.createdAt,
    });
  }
}

import { Module } from '@nestjs/common';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';
import { KanbanAccessService } from './kanban.shared';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/**
 * Spec 13 — Kanban Board & Tasks. Two thin controllers (board, tasks) share the
 * `KanbanAccessService` for caller/permission/project resolution. Prisma comes in via
 * `CoreModule` (registered @Global in app.module.ts), so this module lists no imports.
 */
@Module({
  controllers: [BoardController, TasksController],
  providers: [BoardService, TasksService, KanbanAccessService],
})
export class KanbanModule {}

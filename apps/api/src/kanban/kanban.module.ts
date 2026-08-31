import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { BoardController } from './board.controller';
import { BoardService } from './board.service';
import { CollaborationService } from './collaboration.service';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { KanbanAccessService } from './kanban.shared';
import { LabelsController } from './labels.controller';
import { LabelsService } from './labels.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { WatchersController } from './watchers.controller';
import { WatchersService } from './watchers.service';

/**
 * Spec 13 — Kanban Board & Tasks (board, tasks) + Spec 14 — Task Collaboration
 * (labels, comments, watchers, activity). All controllers share `KanbanAccessService`
 * for caller/permission/project resolution and `CollaborationService` for the shared
 * activity-log + auto-watch primitives. Prisma comes in via `CoreModule` (registered
 * `@Global` in app.module.ts), so this module lists no imports.
 */
@Module({
  controllers: [
    BoardController,
    TasksController,
    LabelsController,
    CommentsController,
    WatchersController,
    ActivityController,
  ],
  providers: [
    BoardService,
    TasksService,
    LabelsService,
    CommentsService,
    WatchersService,
    ActivityService,
    KanbanAccessService,
    CollaborationService,
  ],
})
export class KanbanModule {}

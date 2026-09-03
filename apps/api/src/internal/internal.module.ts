import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents/documents.module';
import { EnvelopeSweepService } from './envelope-sweep.service';
import { InternalController } from './internal.controller';
import { InternalTaskGuard } from './internal-task.guard';

/**
 * Kept apart from `DocumentsModule` for the same reason `SigningModule` is: a different
 * authorization model. Nothing here reads a cookie, and the guard that protects it must
 * never be the one protecting an org-scoped route.
 */
@Module({
  imports: [DocumentsModule],
  controllers: [InternalController],
  providers: [EnvelopeSweepService, InternalTaskGuard],
})
export class InternalModule {}

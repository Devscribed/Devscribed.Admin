import { Module } from '@nestjs/common';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentTemplatesService } from './document-templates.service';

/**
 * The first real feature module in this codebase — a deliberate structural precedent,
 * not an accident of this spec. `app.module.ts` is one flat module holding every
 * controller, which the documents area would push past readability on its own; specs 02
 * and 03 add six more controllers to this module rather than to that one.
 *
 * `PrismaService` and `SessionService` come from the global `CoreModule`. They are not
 * re-provided here on purpose: a guard resolves from the module its controller lives in,
 * and a local copy of `PrismaService` would mean a second connection pool.
 */
@Module({
  controllers: [DocumentTemplatesController],
  providers: [DocumentTemplatesService],
})
export class DocumentsModule {}

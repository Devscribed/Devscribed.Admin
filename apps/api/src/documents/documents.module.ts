import { Module } from '@nestjs/common';
import { DocumentTemplatesController } from './document-templates.controller';
import { DocumentTemplatesService } from './document-templates.service';
import { EnvelopeCompletionService } from './envelope-completion';
import { EnvelopeEventsService } from './envelope-events.service';
import { EnvelopesController } from './envelopes.controller';
import { EnvelopesService } from './envelopes.service';

/**
 * The first real feature module in this codebase — a deliberate structural precedent,
 * not an accident of this spec. `app.module.ts` is one flat module holding every
 * controller, which the documents area would push past readability on its own; specs 02
 * and 03 add their controllers to this module rather than to that one.
 *
 * `PrismaService` and `SessionService` come from the global `CoreModule`. They are not
 * re-provided here on purpose: a guard resolves from the module its controller lives in,
 * and a local copy of `PrismaService` would mean a second connection pool.
 *
 * `EnvelopeEventsService` is exported because the hash chain has exactly one writer and
 * the two session-less modules — signing and internal tasks — must use it rather than a
 * second copy. `EnvelopeCompletionService` is not exported and needs no controller: it
 * registers itself as the `pdf-render` handler on init and is driven entirely by the
 * queue.
 */
@Module({
  controllers: [DocumentTemplatesController, EnvelopesController],
  providers: [
    DocumentTemplatesService,
    EnvelopesService,
    EnvelopeEventsService,
    EnvelopeCompletionService,
  ],
  exports: [EnvelopeEventsService, EnvelopesService, EnvelopeCompletionService],
})
export class DocumentsModule {}

import { Global, Module } from '@nestjs/common';
import { SessionService } from './auth/session.service';
import { mailProvider } from './mail/mail.provider';
import { MailService } from './mail/mail.service';
import { pdfRendererProvider } from './pdf/pdf.provider';
import { PdfRenderer } from './pdf/pdf-renderer';
import { PrismaService } from './prisma.service';
import { JobQueue } from './queue/job-queue';
import { jobQueueProvider } from './queue/queue.provider';
import { SignatureProvider } from './signature/signature-provider';
import { signatureProviderProvider } from './signature/signature.provider';
import { FileStorage } from './storage/file-storage';
import { LocalFilesController } from './storage/local-files.controller';
import { fileStorageProvider } from './storage/storage.provider';

/**
 * The providers every feature module needs.
 *
 * Nest resolves a guard from the module its controller lives in, so once the documents
 * area introduced a second module, `SessionGuard` there could not see the root module's
 * `PrismaService` — and re-providing it would have opened a second connection pool
 * against Postgres, which matters on Neon where the pool is deliberately narrow.
 * Marking these global keeps exactly one instance of each for the whole application,
 * which is what the code assumed all along.
 *
 * Documents spec 02 adds four ports here — `FileStorage`, `PdfRenderer`, `JobQueue`,
 * `SignatureProvider` — and moves `MailService` in beside them. All five are needed by
 * both the envelope module and the root module, and all five must be singletons for the
 * same reason `PrismaService` is: a second `InlineJobQueue` would hold a second handler
 * registry, and a second mail sink would make `/api/test/mail` read a different mailbox
 * from the one the application wrote to. `overrideProvider(MailService)` in the existing
 * integration tests keeps working — Nest's testing module overrides a token wherever it
 * is declared, global or not.
 *
 * Which driver each port resolves to is decided in the port's own `*.provider.ts`, next
 * to the drivers it chooses between. This module only registers them.
 */
@Global()
@Module({
  // The local storage driver serves its own download URLs. The route 404s under any
  // other driver, the same way `/api/test/mail` 404s under any real transport.
  controllers: [LocalFilesController],
  providers: [
    PrismaService,
    SessionService,
    mailProvider,
    fileStorageProvider,
    pdfRendererProvider,
    jobQueueProvider,
    signatureProviderProvider,
  ],
  exports: [
    PrismaService,
    SessionService,
    MailService,
    FileStorage,
    PdfRenderer,
    JobQueue,
    SignatureProvider,
  ],
})
export class CoreModule {}

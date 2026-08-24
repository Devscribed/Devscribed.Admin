import { Global, Module } from '@nestjs/common';
import { SessionService } from './auth/session.service';
import { PrismaService } from './prisma.service';

/**
 * The two providers every feature module needs.
 *
 * Nest resolves a guard from the module its controller lives in, so once the documents
 * area introduced a second module, `SessionGuard` there could not see the root module's
 * `PrismaService` — and re-providing it would have opened a second connection pool
 * against Postgres, which matters on Neon where the pool is deliberately narrow.
 * Marking these global keeps exactly one instance of each for the whole application,
 * which is what the code assumed all along.
 */
@Global()
@Module({
  providers: [PrismaService, SessionService],
  exports: [PrismaService, SessionService],
})
export class CoreModule {}

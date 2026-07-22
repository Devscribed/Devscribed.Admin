import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaLibSQL } from '@prisma/adapter-libsql';
import { PrismaClient } from '@prisma/client';
import { isAbsolute, join } from 'path';

/**
 * Prisma resolves a relative sqlite path against the schema's directory, but libSQL
 * resolves it against the working directory — so the CLI and the running app would
 * otherwise disagree about which `file:./dev.db` they mean. Re-anchoring to prisma/
 * keeps `db push` and the server on one file. Remote libsql:// URLs pass straight through.
 */
export function resolveDatabaseUrl(raw: string): string {
  if (!raw.startsWith('file:')) return raw;

  const filePath = raw.slice('file:'.length);
  if (isAbsolute(filePath)) return raw;

  // Same result from src/ under ts-jest and from dist/ after a build.
  return `file:${join(__dirname, '..', 'prisma', filePath)}`;
}

/**
 * Every environment talks to the database through the libSQL driver adapter — one client
 * handles both a local `file:` database and a remote Turso one, so the connection path the
 * tests exercise is the same one that runs in production.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaLibSQL({
        url: resolveDatabaseUrl(process.env.DATABASE_URL as string),
        // Only remote Turso needs credentials; a file: URL ignores this.
        authToken: process.env.TURSO_AUTH_TOKEN,
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

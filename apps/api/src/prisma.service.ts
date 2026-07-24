import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

/**
 * Every environment talks to Postgres through the same node-postgres driver adapter:
 * a local Docker instance in dev and tests, Neon's pooled endpoint in production. Neon
 * speaks the ordinary wire protocol, so there is no environment-specific branch here —
 * the connection path the tests exercise is the one that runs in production.
 *
 * On serverless the pool must stay narrow, but that belongs in DATABASE_URL
 * (`connection_limit=1&pgbouncer=true`) rather than in code, so a long-lived process can
 * widen it without touching this file.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}

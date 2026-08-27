import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { createEnvelope, publishTemplate, signup } from './envelope-fixtures';

/**
 * TEST-SUPPORT FIXTURE — the fence, not the feature.
 *
 * `POST /api/test/envelopes/expire` exists because nothing in the product ages an envelope
 * and nothing should, so spec 02's lazy-expiry case has no precondition without it. The
 * suite used to do it by writing to the database from the test process, which meant the
 * case only ran where the database was reachable — i.e. never against a deployment, which
 * is the environment it most needed to run against.
 *
 * (The membership move and the role switch that used to sit beside it are gone: spec 04's
 * invitation flow and spec 05's `PUT .../members/:memberId` retired both, exactly as their
 * own comments promised.)
 *
 * Moving it onto HTTP is what makes it work there, and it is also what makes it dangerous,
 * so the assertions that matter here are the negative ones. It writes, and on the dev stand
 * it sits on a public host, so it is fenced twice:
 *
 *   1. `NODE_ENV=production` demands a bearer token, and no token configured means shut.
 *   2. Even with the token, the caller must present a session that is an active **admin**
 *      of the organization being written to.
 *
 * Gate 2 is the one worth being loud about. Without it a single leaked token would let its
 * holder reach into every organization in the environment; with it, the most it buys is a
 * change inside one they already run. Every refusal is a 404, never a 401 or a 403 — a
 * route that is supposed to be invisible must not confirm its own existence.
 */
describe('Test-support fixtures', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const SECRET = 'fixture-secret-for-this-suite-only';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Envelopes hold a `Restrict` reference to the template version they were built from,
    // so the order here is not cosmetic: templates cannot go until the envelopes standing
    // on them have.
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  /**
   * Runs one call as a deployment would see it: production, with the token configured.
   * Always restores both, including when the assertion inside throws — a leaked
   * `production` would silently disarm every other suite in the run, and a leaked secret
   * would arm routes the rest of them assume are open.
   */
  const asDeployment = async (fn: () => Promise<void>): Promise<void> => {
    const previousEnv = process.env.NODE_ENV;
    const previousSecret = process.env.TEST_FIXTURE_SECRET;
    process.env.NODE_ENV = 'production';
    process.env.TEST_FIXTURE_SECRET = SECRET;
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousSecret === undefined) delete process.env.TEST_FIXTURE_SECRET;
      else process.env.TEST_FIXTURE_SECRET = previousSecret;
    }
  };

  /** Production with no token configured — what `prod.tfvars` produces. */
  const asProductionWithNoToken = async (fn: () => Promise<void>): Promise<void> => {
    const previousEnv = process.env.NODE_ENV;
    const previousSecret = process.env.TEST_FIXTURE_SECRET;
    process.env.NODE_ENV = 'production';
    delete process.env.TEST_FIXTURE_SECRET;
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = previousEnv;
      if (previousSecret !== undefined) process.env.TEST_FIXTURE_SECRET = previousSecret;
    }
  };

  describe('POST /api/test/envelopes/expire', () => {
    /**
     * A real draft, through the product's own endpoints. A hand-written row would need a
     * template version anyway — `Envelope.templateVersionId` is `Restrict` — so building it
     * the honest way costs one extra call and asserts against the shape the product makes.
     */
    const seedEnvelope = async (who: Awaited<ReturnType<typeof signup>>): Promise<string> => {
      const template = await publishTemplate(app, who);
      const envelope = await createEnvelope(app, who, template.id);
      await prisma.envelope.update({
        where: { id: envelope.id },
        data: { status: 'sent', expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
      });
      return envelope.id;
    };

    it('moves the expiry into the past', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      const envelopeId = await seedEnvelope(host);

      await request(app.getHttpServer())
        .post('/api/test/envelopes/expire')
        .send({ orgId: host.organizationId, envelopeId })
        .expect(200);

      const envelope = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } });
      expect(envelope.expiresAt!.getTime()).toBeLessThan(Date.now());
      // Only the one column. The point of the test this serves is that the read path is
      // right *before* anything has swept, so a fixture that also moved the status would
      // be answering the question for it.
      expect(envelope.status).toBe('sent');
    });

    it('404s on a deployment for an envelope outside the caller organization', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      const outsider = await signup(app, 'outsider@elsewhere.com', 'Elsewhere Ltd');
      const envelopeId = await seedEnvelope(host);

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/envelopes/expire')
          .set('Cookie', outsider.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ envelopeId })
          .expect(404);
      });

      const envelope = await prisma.envelope.findUniqueOrThrow({ where: { id: envelopeId } });
      expect(envelope.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('404s in production with no token configured', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      const envelopeId = await seedEnvelope(host);

      await asProductionWithNoToken(async () => {
        await request(app.getHttpServer())
          .post('/api/test/envelopes/expire')
          .set('Cookie', host.cookies)
          .send({ orgId: host.organizationId, envelopeId })
          .expect(404);
      });
    });
  });
});

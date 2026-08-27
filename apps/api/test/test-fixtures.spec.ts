import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { createEnvelope, publishTemplate, signup } from './envelope-fixtures';

/**
 * TEST-SUPPORT FIXTURES — the fence, not the feature.
 *
 * `POST /api/test/memberships` and `POST /api/test/envelopes/expire` exist so the E2E suite
 * can build preconditions the product cannot yet build for itself: there is no invite flow,
 * so a second person cannot be put into an organization, and nothing can age an envelope.
 * The suite used to do both by writing to the database from the test process, which meant
 * those cases only ran where the database was reachable — i.e. never against a deployment,
 * which is the environment they most needed to run against.
 *
 * Moving them onto HTTP is what makes them work there, and it is also what makes them
 * dangerous, so the assertions that matter here are the negative ones. Both routes write,
 * and on the dev stand they sit on a public host, so each is fenced twice:
 *
 *   1. `NODE_ENV=production` demands a bearer token, and no token configured means shut.
 *   2. Even with the token, the caller must present a session that is an active **admin**
 *      of the organization being written to.
 *
 * Gate 2 is the one worth being loud about. Without it a single leaked token would make its
 * holder an admin of every organization in the environment; with it, the most it buys is a
 * change inside an organization they already run. Every refusal is a 404, never a 401 or a
 * 403 — a route that is supposed to be invisible must not confirm its own existence.
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

  describe('POST /api/test/memberships', () => {
    it('moves an account into the caller organization and reports the membership', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      const guest = await signup(app, 'guest@other.com', 'Holding org');

      const response = await request(app.getHttpServer())
        .post('/api/test/memberships')
        .send({ orgId: host.organizationId, email: 'guest@other.com' })
        .expect(200);

      expect(response.body).toMatchObject({ email: 'guest@other.com', name: 'Pat Owner' });

      const membership = await prisma.membership.findFirstOrThrow({
        where: { accountId: guest.accountId },
      });
      expect(membership.organizationId).toBe(host.organizationId);
      expect(membership.status).toBe('active');
      // Untouched, because the caller named none: which role a test is about belongs in
      // the test, not half-buried in the fixture that seeded it.
      expect(membership.role).toBe('admin');
    });

    it('sets the role too when the caller names one', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');

      await request(app.getHttpServer())
        .post('/api/test/memberships')
        .send({ orgId: host.organizationId, email: 'guest@other.com', role: 'manager' })
        .expect(200);

      const membership = await prisma.membership.findFirstOrThrow({
        where: { account: { email: 'guest@other.com' } },
      });
      expect(membership.role).toBe('manager');
    });

    it('404s for an address with no account', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');

      await request(app.getHttpServer())
        .post('/api/test/memberships')
        .send({ orgId: host.organizationId, email: 'nobody@acme.com' })
        .expect(404);
    });

    it('404s in production with no token configured', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');

      await asProductionWithNoToken(async () => {
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', host.cookies)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(404);
      });
    });

    it('404s on a deployment without the token, and on a wrong one', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', host.cookies)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(404);

        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', host.cookies)
          .set('Authorization', `Bearer ${SECRET}-wrong`)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(404);
      });
    });

    /**
     * The one that matters most: holding the token is not authority over an organization.
     */
    it('404s on a deployment with the token but no session', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(404);
      });

      const membership = await prisma.membership.findFirstOrThrow({
        where: { account: { email: 'guest@other.com' } },
      });
      expect(membership.organizationId).not.toBe(host.organizationId);
    });

    it('404s on a deployment when the session is not an admin of the target org', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      const outsider = await signup(app, 'outsider@elsewhere.com', 'Elsewhere Ltd');
      await signup(app, 'guest@other.com', 'Holding org');

      await asDeployment(async () => {
        // A valid session, a valid token, and an organization that is not theirs. The
        // `orgId` in the body is never a selector — the session is.
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', outsider.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(404);
      });
    });

    it('404s on a deployment when the caller is only a member of their own org', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');
      await prisma.membership.updateMany({
        where: { account: { email: 'host@acme.com' } },
        data: { role: 'user' },
      });

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', host.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(404);
      });
    });

    it('moves the membership on a deployment when both gates are satisfied', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', host.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(200);
      });

      const membership = await prisma.membership.findFirstOrThrow({
        where: { account: { email: 'guest@other.com' } },
      });
      expect(membership.organizationId).toBe(host.organizationId);
    });
  });

  describe('POST /api/test/role', () => {
    it('404s on a deployment with the token but no session', async () => {
      await signup(app, 'host@acme.com', 'Acme Inc');

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/role')
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ email: 'host@acme.com', role: 'viewer' })
          .expect(404);
      });

      const membership = await prisma.membership.findFirstOrThrow();
      expect(membership.role).toBe('admin');
    });

    it('404s on a deployment for somebody outside the caller organization', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'stranger@elsewhere.com', 'Elsewhere Ltd');

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/role')
          .set('Cookie', host.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ email: 'stranger@elsewhere.com', role: 'admin' })
          .expect(404);
      });

      const stranger = await prisma.membership.findFirstOrThrow({
        where: { account: { email: 'stranger@elsewhere.com' } },
      });
      expect(stranger.role).toBe('admin');
    });

    it('sets the role on a deployment for somebody inside it', async () => {
      const host = await signup(app, 'host@acme.com', 'Acme Inc');
      await signup(app, 'guest@other.com', 'Holding org');

      await asDeployment(async () => {
        await request(app.getHttpServer())
          .post('/api/test/memberships')
          .set('Cookie', host.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ orgId: host.organizationId, email: 'guest@other.com' })
          .expect(200);

        await request(app.getHttpServer())
          .post('/api/test/role')
          .set('Cookie', host.cookies)
          .set('Authorization', `Bearer ${SECRET}`)
          .send({ email: 'guest@other.com', role: 'manager' })
          .expect(200);
      });

      const membership = await prisma.membership.findFirstOrThrow({
        where: { account: { email: 'guest@other.com' } },
      });
      expect(membership.role).toBe('manager');
    });
  });

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

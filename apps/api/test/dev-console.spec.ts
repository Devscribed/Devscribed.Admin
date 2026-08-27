import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';
import { signup } from './envelope-fixtures';

/**
 * LOCAL DEVELOPMENT AFFORDANCE — not part of the product.
 *
 * Covers the two read endpoints the `/dev` console runs on: the mail outbox
 * (`GET /api/test/mail`) and the membership picker (`GET /api/test/memberships`). Both are
 * scaffolding — a real mail transport retires the first, user-management spec 04 retires
 * the second — and this suite goes with them.
 *
 * The load-bearing assertions are the production ones. Everything here hands out live
 * signing tokens or reads an organization's roster with no session at all, so the only
 * property that actually matters is that none of it answers when NODE_ENV is production.
 * Each endpoint is asserted separately rather than in one loop, so a fence that is removed
 * from a single route fails on its own line.
 */
describe('Development console endpoints', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    // The sink is the non-production default; the outbox routes are fenced on exactly this.
    mail = app.get(MailService) as InMemoryMailService;
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  /**
   * Flips NODE_ENV for the duration of one call and always puts it back, including when
   * the assertion inside throws — a leaked 'production' would silently disarm every other
   * suite in the run.
   */
  const asProduction = async (fn: () => Promise<void>): Promise<void> => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await fn();
    } finally {
      process.env.NODE_ENV = previous;
    }
  };

  const seedMail = async () => {
    await mail.sendPasswordReset({
      to: 'owner@acme.test',
      firstName: 'Pat',
      token: 'reset-token',
      resetUrl: 'http://localhost:3000/reset-password?token=reset-token',
    });
    await mail.sendSigningInvitation({
      to: 'signer@example.test',
      recipientName: 'Sam Signer',
      envelopeTitle: 'Contractor agreement',
      organizationName: 'Acme Inc',
      organizationId: 'org-1',
      senderName: 'Pat Owner',
      signingUrl: 'http://localhost:3000/sign/signing-token',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
    await mail.sendEnvelopeDeclined({
      to: 'owner@acme.test',
      recipientName: 'Pat Owner',
      envelopeTitle: 'Contractor agreement',
      organizationName: 'Acme Inc',
      organizationId: 'org-1',
      declinedByName: 'Sam Signer',
      declineReason: 'Wrong tax id',
      declinedAt: new Date('2030-01-02T00:00:00.000Z'),
    });
  };

  describe('GET /api/test/mail', () => {
    it('returns the whole sink newest first, with recipient, type, subject and link', async () => {
      await seedMail();

      const response = await request(app.getHttpServer()).get('/api/test/mail').expect(200);

      expect(response.body).toHaveLength(3);
      expect(response.body.map((m: { type: string }) => m.type)).toEqual([
        'envelope_declined',
        'signing_invitation',
        'password_reset',
      ]);

      const invitation = response.body[1];
      expect(invitation.to).toBe('signer@example.test');
      expect(invitation.subject).toBe('A document is waiting for your signature');
      expect(invitation.link).toBe('http://localhost:3000/sign/signing-token');
      expect(Date.parse(invitation.sentAt)).not.toBeNaN();

      // The reset link is the other half of what the outbox is for.
      expect(response.body[2].link).toBe(
        'http://localhost:3000/reset-password?token=reset-token',
      );
      // A message carrying no URL says so rather than omitting the field.
      expect(response.body[0].link).toBeNull();
    });

    it('answers with an empty list rather than 404 when nothing has been sent', async () => {
      await request(app.getHttpServer()).get('/api/test/mail').expect(200).expect([]);
    });

    it('filters by email and by type, and narrows to nothing for an unknown type', async () => {
      await seedMail();

      const byEmail = await request(app.getHttpServer())
        .get('/api/test/mail?email=OWNER@ACME.TEST')
        .expect(200);
      expect(byEmail.body.map((m: { type: string }) => m.type)).toEqual([
        'envelope_declined',
        'password_reset',
      ]);

      const byType = await request(app.getHttpServer())
        .get('/api/test/mail?type=signing_invitation')
        .expect(200);
      expect(byType.body).toHaveLength(1);
      expect(byType.body[0].to).toBe('signer@example.test');

      const both = await request(app.getHttpServer())
        .get('/api/test/mail?email=owner@acme.test&type=signing_invitation')
        .expect(200);
      expect(both.body).toEqual([]);

      await request(app.getHttpServer()).get('/api/test/mail?type=not_a_type').expect(200, []);
    });

    it('404s when NODE_ENV is production', async () => {
      await seedMail();

      await asProduction(async () => {
        await request(app.getHttpServer()).get('/api/test/mail').expect(404);
      });

      // And is live again afterwards, so the fence is the env var and nothing else.
      await request(app.getHttpServer()).get('/api/test/mail').expect(200);
    });

    it('404s on the pre-existing latest route when NODE_ENV is production', async () => {
      await seedMail();

      await asProduction(async () => {
        await request(app.getHttpServer())
          .get('/api/test/mail/latest?email=owner@acme.test')
          .expect(404);
      });
    });
  });

  describe('GET /api/test/memberships', () => {
    it('lists the organizations when no orgId is given', async () => {
      const owner = await signup(app, 'owner@acme.test', 'Acme Inc');

      const response = await request(app.getHttpServer())
        .get('/api/test/memberships')
        .expect(200);

      expect(response.body.organizations).toHaveLength(1);
      expect(response.body.organizations[0]).toMatchObject({
        id: owner.organizationId,
        name: 'Acme Inc',
        memberCount: 1,
      });
    });

    it('lists every membership of an organization with role and status', async () => {
      const owner = await signup(app, 'owner@acme.test', 'Acme Inc');
      // No invite flow exists yet, so the second member is created where the invite would
      // have created one — the same exception `POST /api/test/role` documents.
      const account = await prisma.account.create({
        data: {
          email: 'ann@acme.test',
          firstName: 'Ann',
          lastName: 'Member',
          passwordHash: 'x',
          timezone: 'UTC',
        },
      });
      await prisma.membership.create({
        data: {
          accountId: account.id,
          organizationId: owner.organizationId,
          role: 'viewer',
          status: 'active',
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/api/test/memberships?orgId=${owner.organizationId}`)
        .expect(200);

      expect(response.body.orgId).toBe(owner.organizationId);
      expect(response.body.members).toHaveLength(2);
      expect(response.body.members).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ email: 'owner@acme.test', role: 'admin', status: 'active' }),
          expect.objectContaining({
            email: 'ann@acme.test',
            name: 'Ann Member',
            role: 'viewer',
            status: 'active',
          }),
        ]),
      );
    });

    it('answers with an empty roster for an organization that does not exist', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/test/memberships?orgId=00000000-0000-0000-0000-000000000000')
        .expect(200);

      expect(response.body.members).toEqual([]);
    });

    it('reflects a role set through POST /api/test/role, which is what the panel does', async () => {
      const owner = await signup(app, 'owner@acme.test', 'Acme Inc');

      await request(app.getHttpServer())
        .post('/api/test/role')
        .send({ email: 'owner@acme.test', role: 'manager' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .get(`/api/test/memberships?orgId=${owner.organizationId}`)
        .expect(200);

      expect(response.body.members[0].role).toBe('manager');
    });

    it('404s when NODE_ENV is production', async () => {
      const owner = await signup(app, 'owner@acme.test', 'Acme Inc');

      await asProduction(async () => {
        await request(app.getHttpServer()).get('/api/test/memberships').expect(404);
        await request(app.getHttpServer())
          .get(`/api/test/memberships?orgId=${owner.organizationId}`)
          .expect(404);
      });

      await request(app.getHttpServer()).get('/api/test/memberships').expect(200);
    });
  });

  describe('POST /api/test/role', () => {
    it('404s when NODE_ENV is production', async () => {
      await signup(app, 'owner@acme.test', 'Acme Inc');

      await asProduction(async () => {
        await request(app.getHttpServer())
          .post('/api/test/role')
          .send({ email: 'owner@acme.test', role: 'manager' })
          .expect(404);
      });

      // The membership is untouched: the fence refuses before it reaches the database.
      const memberships = await prisma.membership.findMany();
      expect(memberships[0].role).toBe('admin');
    });
  });
});

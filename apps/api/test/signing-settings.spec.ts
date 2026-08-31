import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { SIGNING_PROVIDER_MESSAGES, TEMPLATE_MESSAGES } from '@devscribed/validation';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PdfRenderer } from '../src/pdf/pdf-renderer';
import { PrismaService } from '../src/prisma.service';
import { JobQueue } from '../src/queue/job-queue';
import { SignWellHttpClient } from '../src/signature/signwell/signwell-http-client';
import {
  Signed,
  envelopesApi,
  publishTemplate,
  sendableEnvelope,
  setRole,
  signup,
} from './envelope-fixtures';
import { TestSignWellClient } from './signwell-fixtures';

/**
 * specs/documents/04-signature-providers.md — the signing-settings surface.
 *
 * The provider is an organization setting: admin-only to change, read by the send path at
 * send time, and never a property of an envelope that has already gone out.
 */

class StubPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('Signing settings', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let signwell: TestSignWellClient;

  const getSettings = (who: Signed, orgId = who.organizationId) =>
    request(app.getHttpServer())
      .get(`/api/organizations/${orgId}/settings/signing`)
      .set('Cookie', who.cookies);

  const putSettings = (who: Signed, body: object, orgId = who.organizationId) =>
    request(app.getHttpServer())
      .put(`/api/organizations/${orgId}/settings/signing`)
      .set('Cookie', who.cookies)
      .send(body);

  const send = (who: Signed, id: string) =>
    request(app.getHttpServer())
      .post(envelopesApi(who, `/${id}/send`))
      .set('Cookie', who.cookies);

  beforeAll(async () => {
    signwell = new TestSignWellClient();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(PdfRenderer)
      .useClass(StubPdfRenderer)
      .overrideProvider(SignWellHttpClient)
      .useValue(signwell)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.use(json({ limit: '4mb' }));
    await app.init();

    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    queue = app.get(JobQueue);
  });

  afterAll(async () => {
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
    signwell.reset();
  });

  describe('TC-04-INT-16: The provider setting is admin-only and org-scoped', () => {
    it('answers 200 for an admin, 403 for every other role, and 404 across organizations', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');

      const saved = await putSettings(admin, { provider: 'signwell', confirmed: true }).expect(200);
      expect(saved.body.current).toBe('signwell');

      for (const role of ['manager', 'user', 'viewer']) {
        // The member has to be inside the admin's organization, so that the capability
        // and not the org scope is what refuses them.
        const member = await signup(app, `${role}@acme.com`, 'Sacrificial Ltd');
        await prisma.membership.updateMany({
          where: { accountId: member.accountId },
          data: { organizationId: admin.organizationId, role },
        });
        const login = await request(app.getHttpServer())
          .post('/api/login')
          .send({ email: `${role}@acme.com`, password: 'Passw0rd' })
          .expect(200);
        const who: Signed = {
          ...member,
          cookies: login.headers['set-cookie'] as unknown as string[],
          organizationId: admin.organizationId,
        };

        const refused = await putSettings(who, { provider: 'internal', confirmed: true });
        expect(refused.status).toBe(403);
        expect(refused.body.message).toBe(TEMPLATE_MESSAGES.generic.forbidden);
      }

      // A rejected call changes nothing.
      expect(
        (await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } }))
          .signatureProviderKey,
      ).toBe('signwell');

      // Scope mismatch is 404, not 403 — an organization the caller has no part in is
      // indistinguishable from one that does not exist.
      const other = await signup(app, 'owner@other.com', 'Other Ltd');
      await getSettings(other, admin.organizationId).expect(404);
      await putSettings(
        other,
        { provider: 'internal', confirmed: true },
        admin.organizationId,
      ).expect(404);
      expect(
        (await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } }))
          .signatureProviderKey,
      ).toBe('signwell');
    });

    it('lets a manager read the setting', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      await setRole(prisma, 'admin@acme.com', 'manager');

      const body = (await getSettings(admin).expect(200)).body;
      expect(body.current).toBe('internal');
      expect(body.providers.map((option: { key: string }) => option.key)).toEqual([
        'internal',
        'signwell',
      ]);
    });
  });

  describe('TC-04-INT-17: Changing the provider does not touch in-flight envelopes', () => {
    it('leaves the sent envelope on internal and sends the draft on signwell', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);

      const inFlight = await sendableEnvelope(app, admin, template.id);
      await send(admin, inFlight.id).expect(200);
      await queue.whenIdle();
      const before = await prisma.envelope.findUniqueOrThrow({ where: { id: inFlight.id } });
      expect(before.providerKey).toBe('internal');
      const internalToken = mail
        .lastFor('company@acme.com', 'signing_invitation')!
        .signingUrl.split('/sign/')[1];

      const draft = await sendableEnvelope(app, admin, template.id, {
        emails: ['company@acme.com', 'second@example.com'],
      });

      // Requirement 33 — the confirmation names the envelopes that **stay on the old
      // provider**, and the draft is not one of them: edge case 14 sends it on the new
      // one, which is exactly what step 2 below proves. One sent envelope, one draft, and
      // the modal says one.
      const settingsBefore = await getSettings(admin).expect(200);
      expect(settingsBefore.body.inFlightCount).toBe(1);

      await putSettings(admin, { provider: 'signwell', confirmed: true }).expect(200);

      await send(admin, draft.id).expect(200);
      await queue.whenIdle();

      // Invariant 7 — not one column of an already-sent envelope is touched.
      const after = await prisma.envelope.findUniqueOrThrow({ where: { id: inFlight.id } });
      expect(after).toEqual(before);
      expect(after.providerKey).toBe('internal');

      // And once it has gone out it counts, because now it would stay where it is.
      const settingsAfter = await getSettings(admin).expect(200);
      expect(settingsAfter.body.inFlightCount).toBe(2);

      const underSignWell = await prisma.envelope.findUniqueOrThrow({ where: { id: draft.id } });
      expect(underSignWell.providerKey).toBe('signwell');
      expect(underSignWell.providerRef).toBeTruthy();
      expect(underSignWell.providerRef).not.toBe(after.providerRef);

      // The pre-existing envelope still signs through our own page.
      const surface = await request(app.getHttpServer())
        .get(`/api/sign/${internalToken}`)
        .expect(200);
      expect(surface.body.surface).toBe('ours');
      expect(surface.body.embeddedSigningUrl).toBeUndefined();
    });
  });

  describe('TC-04-INT-18: An unconfigured provider cannot be selected', () => {
    it('reports what is missing and refuses the change', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const apiKey = process.env.SIGNWELL_API_KEY;
      delete process.env.SIGNWELL_API_KEY;

      try {
        const read = await getSettings(admin).expect(200);
        const option = read.body.providers.find(
          (candidate: { key: string }) => candidate.key === 'signwell',
        );
        expect(option.configured).toBe(false);
        expect(option.missing).toEqual(['API key']);

        const refused = await putSettings(admin, {
          provider: 'signwell',
          confirmed: true,
        }).expect(400);
        expect(refused.body.errors.provider).toBe('SignWell is not configured. Missing: API key.');
      } finally {
        process.env.SIGNWELL_API_KEY = apiKey;
      }

      expect(
        (await prisma.organization.findUniqueOrThrow({ where: { id: admin.organizationId } }))
          .signatureProviderKey,
      ).toBe('internal');
    });
  });

  describe('TC-04-INT-19: A change without confirmation is refused', () => {
    it('answers 409 and writes nothing', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');

      const refused = await putSettings(admin, { provider: 'signwell' }).expect(409);
      expect(refused.body.message).toBe(SIGNING_PROVIDER_MESSAGES.provider.notConfirmed);

      const organization = await prisma.organization.findUniqueOrThrow({
        where: { id: admin.organizationId },
      });
      expect(organization.signatureProviderKey).toBe('internal');
      expect(organization.signatureProviderSetAt).toBeNull();
    });
  });
});

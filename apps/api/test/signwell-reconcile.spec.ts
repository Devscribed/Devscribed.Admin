import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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
  signup,
} from './envelope-fixtures';
import {
  TestSignWellClient,
  materializedFor,
  signWellDocument,
  signedDelivery,
  useSignWell,
} from './signwell-fixtures';

/**
 * specs/documents/04-signature-providers.md, requirements 22 and 30 — convergence, and
 * the three ways it is reached.
 *
 * A dropped webhook costs timeliness and never correctness: the same convergence runs
 * lazily on a stale read and hourly on the sweep. What these cases pin is that the lazy
 * path exists, that it is bounded by a staleness window rather than firing on every read,
 * and that no path can move a terminal envelope.
 */

class StubPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('SignWell reconciliation', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let signwell: TestSignWellClient;

  const deliver = (body: unknown) =>
    request(app.getHttpServer()).post('/api/webhooks/signwell').send(body as object);

  const read = (who: Signed, id: string) =>
    request(app.getHttpServer())
      .get(envelopesApi(who, `/${id}`))
      .set('Cookie', who.cookies);

  const sentEnvelope = async () => {
    const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
    await useSignWell(app, admin.organizationId);
    const template = await publishTemplate(app, admin);
    const envelope = await sendableEnvelope(app, admin, template.id);
    await request(app.getHttpServer())
      .post(envelopesApi(admin, `/${envelope.id}/send`))
      .set('Cookie', admin.cookies)
      .expect(200);
    await queue.whenIdle();
    const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
    return { admin, envelope, providerRef: stored.providerRef };
  };

  const remoteSays = (
    providerRef: string,
    overrides: Parameters<typeof signWellDocument>[2],
  ) => {
    const body = signwell.createBodies[0];
    signwell.documents.set(
      providerRef,
      signWellDocument(providerRef, body, { fields: materializedFor(body), ...overrides }),
    );
  };

  const syncedAt = (envelopeId: string, at: Date) =>
    prisma.envelope.update({ where: { id: envelopeId }, data: { providerSyncedAt: at } });

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
    await prisma.providerWebhookEvent.deleteMany();
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await app.close();
  });

  beforeEach(async () => {
    await prisma.providerWebhookEvent.deleteMany();
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
    signwell.reset();
  });

  describe('TC-04-INT-06: A late notification cannot revive a terminal envelope', () => {
    it('acknowledges the delivery, records ignored_terminal, and writes no event', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();

      await request(app.getHttpServer())
        .post(envelopesApi(admin, `/${envelope.id}/void`))
        .set('Cookie', admin.cookies)
        .send({ reason: 'Signed on paper instead' })
        .expect(200);
      await queue.whenIdle();

      const voided = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(voided.status).toBe('voided');
      const eventsBefore = await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id } });

      // Their queue drains a `document_signed` for a document we have already deleted.
      remoteSays(providerRef, { recipientStatuses: { '1': 'signed' } });
      await deliver(
        signedDelivery('document_signed', providerRef, {
          relatedSignerEmail: 'company@acme.com',
        }),
      ).expect(200);
      await queue.whenIdle();

      const after = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(after.status).toBe('voided');
      expect(await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id } })).toBe(
        eventsBefore,
      );

      const row = await prisma.providerWebhookEvent.findFirstOrThrow({ where: { providerRef } });
      expect(row.outcome).toBe('ignored_terminal');
    });
  });

  describe('TC-04-INT-11: A missed webhook is converged lazily on read', () => {
    it('reads the provider, writes the signed event, and answers the converged status', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteSays(providerRef, { recipientStatuses: { '1': 'signed' } });
      await syncedAt(envelope.id, new Date(Date.now() - 2 * 60 * 60 * 1000));

      const detail = await read(admin, envelope.id).expect(200);

      // The response already says it — the convergence is not deferred behind the read.
      expect(detail.body.status).toBe('partially_signed');
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'signed' } }),
      ).toBe(1);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.providerSyncedAt!.getTime()).toBeGreaterThan(Date.now() - 30_000);
    });

    /**
     * Convergence opens the next signer's turn, and the invitation is **ours** under
     * SignWell (requirement 12). The claim that the transport took it is written after the
     * transport took it, and never before.
     */
    it("opens the next signer's turn and records email_accepted once SES took the message", async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteSays(providerRef, { recipientStatuses: { '1': 'signed', '2': 'sent' } });
      await syncedAt(envelope.id, new Date(Date.now() - 2 * 60 * 60 * 1000));

      await read(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const second = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 2 },
      });
      expect(second.status).toBe('notified');
      expect(
        await prisma.signingToken.count({
          where: { envelopeSignerId: second.id, isInvalidated: false },
        }),
      ).toBe(1);

      // Our own page, never a provider link.
      const invitation = mail.lastFor('alex@example.com', 'signing_invitation');
      expect(invitation).toBeDefined();
      expect(invitation!.signingUrl).toContain('/sign/');
      expect(invitation!.signingUrl).not.toContain('signwell.com');

      expect(
        await prisma.envelopeEvent.count({
          where: { envelopeId: envelope.id, envelopeSignerId: second.id, type: 'email_accepted' },
        }),
      ).toBe(1);
    });

    /**
     * The partial-failure rule: nothing may claim something that did not happen. A
     * transport rejection still leaves the turn open — the provider has captured signer
     * 1's signature and that is a fact — but the trail must not say the invitation was
     * accepted, because the envelope screen renders exactly that as the signer's email
     * status.
     */
    it('claims no acceptance when the transport rejects the invitation', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteSays(providerRef, { recipientStatuses: { '1': 'signed', '2': 'sent' } });
      await syncedAt(envelope.id, new Date(Date.now() - 2 * 60 * 60 * 1000));

      mail.failNextSend();
      await read(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const second = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 2 },
      });

      // The convergence itself stands: signer 1 signed, and signer 2 has a link to use.
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'signed' } }),
      ).toBe(1);
      expect(second.status).toBe('notified');
      expect(
        await prisma.signingToken.count({
          where: { envelopeSignerId: second.id, isInvalidated: false },
        }),
      ).toBe(1);

      // What did not happen is not recorded.
      expect(mail.lastFor('alex@example.com', 'signing_invitation')).toBeUndefined();
      expect(
        await prisma.envelopeEvent.count({
          where: { envelopeId: envelope.id, type: 'email_accepted', envelopeSignerId: second.id },
        }),
      ).toBe(0);

      // And the screen says nothing about signer 2's mailbox rather than "Accepted".
      const detail = await read(admin, envelope.id).expect(200);
      const shown = detail.body.signers.find((s: { id: string }) => s.id === second.id);
      expect(shown.lastEmailStatus).toBeNull();
    });
  });

  describe('TC-04-INT-12: A fresh envelope is not re-fetched on every read', () => {
    it('spends nothing on three reads inside the staleness window', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteSays(providerRef, { recipientStatuses: { '1': 'signed' } });
      await syncedAt(envelope.id, new Date(Date.now() - 5_000));

      signwell.calls.length = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        const detail = await read(admin, envelope.id).expect(200);
        expect(detail.body.status).toBe('sent');
      }

      // The 20-per-minute test budget is not spent on reads.
      expect(signwell.calls).toEqual([]);
    });
  });
});

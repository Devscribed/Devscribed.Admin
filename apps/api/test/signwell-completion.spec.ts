import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EnvelopeSweepService } from '../src/internal/envelope-sweep.service';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PdfRenderer } from '../src/pdf/pdf-renderer';
import { PrismaService } from '../src/prisma.service';
import { JobQueue } from '../src/queue/job-queue';
import { FileStorage } from '../src/storage/file-storage';
import { ProviderReconcilerService } from '../src/documents/provider-reconciler.service';
import {
  HttpSignWellClient,
  SignWellHttpClient,
} from '../src/signature/signwell/signwell-http-client';
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
import { documentCanceled } from './signwell-webhook-fixtures';

/**
 * specs/documents/04-signature-providers.md, requirements 27, 28 and 40–42 — completion
 * from the provider's PDF, and voiding as delete-then-settle: `DELETE`, then the local
 * void, with no re-read, because the document is gone and a read could only produce the
 * `404` requirements 41 and 42 already account for.
 *
 * Invariant 10 is the spine of this file: an envelope is not `completed` until *their*
 * bytes are in *our* storage. Everything else here is a consequence — a failed download is
 * a retry rather than a state, a 404 from `completed_pdf` carries no information, and our
 * own `DELETE` coming back as a notification is settled rather than converged.
 */

class StubPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('SignWell completion', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let storage: FileStorage;
  let signwell: TestSignWellClient;

  const deliver = (body: unknown) =>
    request(app.getHttpServer()).post('/api/webhooks/signwell').send(body as object);

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

  /** Both signers signed and the document is Completed, as their API would report it. */
  const remoteCompleted = (providerRef: string) =>
    remoteSays(providerRef, {
      status: 'Completed',
      recipientStatuses: { '1': 'signed', '2': 'signed' },
      completedAt: new Date().toISOString(),
    });

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
    storage = app.get(FileStorage);
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

  describe('TC-04-INT-09: Completion stores the provider PDF before marking complete', () => {
    it('stores their bytes at the content-addressed key and issues no certificate of ours', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteCompleted(providerRef);

      await deliver(signedDelivery('document_completed', providerRef)).expect(200);
      await queue.whenIdle();

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('completed');
      expect(stored.pdfStatus).toBe('ready');

      const bytes = Buffer.from(
        `%PDF-1.4 signwell completed with audit page ${providerRef}`,
        'utf8',
      );
      const hash = createHash('sha256').update(bytes).digest('hex');
      expect(stored.signedPdfKey).toBe(
        `signed/${admin.organizationId}/${envelope.id}/${hash}.pdf`,
      );
      expect(stored.signedPdfHash).toBe(hash);
      expect(await storage.exists(stored.signedPdfKey!)).toBe(true);

      // Requirement 28 — under a provider that supplies its own completed document our
      // Certificate of Completion is not generated at all.
      expect(signwell.countOf('completedPdf')).toBe(1);
      const detail = await request(app.getHttpServer())
        .get(envelopesApi(admin, `/${envelope.id}`))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(detail.body.certificateUrl).toBeUndefined();
    });

    it('asks for the audit page, because their PDF is the record of execution', async () => {
      const urls: string[] = [];
      const client = new HttpSignWellClient(
        async (raw) => {
          urls.push(raw.url);
          return { status: 200, headers: {}, body: Buffer.from('%PDF-1.4 audited') };
        },
        { baseUrl: 'https://www.signwell.com/api/v1', apiKey: 'k' },
      );

      await client.completedPdf('sw-audit');

      expect(urls).toEqual([
        'https://www.signwell.com/api/v1/documents/sw-audit/completed_pdf?url_only=false&audit_page=true',
      ]);
    });
  });

  describe('TC-04-INT-10: A failed PDF download does not mark the envelope complete', () => {
    it('leaves it pending with a provider error, and the sweep finishes it', async () => {
      const { envelope, providerRef } = await sentEnvelope();
      remoteCompleted(providerRef);
      signwell.onPdf = async () => {
        throw new Error('status_500');
      };

      await deliver(signedDelivery('document_completed', providerRef)).expect(200);
      await queue.whenIdle();

      const failed = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(failed.status).not.toBe('completed');
      expect(failed.pdfStatus).toBe('pending');
      expect(failed.providerError).toBeTruthy();
      expect(failed.signedPdfKey).toBeNull();

      signwell.onPdf = undefined;
      await app.get(EnvelopeSweepService).run();
      await queue.whenIdle();

      const repaired = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(repaired.status).toBe('completed');
      expect(repaired.signedPdfKey).toBeTruthy();
      expect(repaired.providerError).toBeNull();
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'completed' } }),
      ).toBe(1);
    });
  });

  describe('TC-04-INT-10a: A 404 from completed_pdf is retried, not treated as terminal', () => {
    it('never infers a deletion from it and completes on the sweep', async () => {
      const { envelope, providerRef } = await sentEnvelope();
      remoteCompleted(providerRef);
      // Their `record_not_found`, which an incomplete document and an unknown id share.
      signwell.onPdf = async (_id, attempt) =>
        attempt === 1
          ? null
          : Buffer.from(`%PDF-1.4 signwell completed with audit page ${providerRef}`, 'utf8');

      await app.get(ProviderReconcilerService).converge(envelope.id);
      await queue.whenIdle();

      const pending = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(pending.status).not.toBe('completed');
      expect(pending.pdfStatus).toBe('pending');
      // Not marked deleted, not errored terminally.
      expect(pending.status).not.toBe('voided');

      await app.get(EnvelopeSweepService).run();
      await queue.whenIdle();

      const completed = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(completed.status).toBe('completed');
      expect(completed.signedPdfKey).toBeTruthy();
    });
  });

  describe('TC-04-INT-10b: Voiding deletes remotely and survives a 404', () => {
    it('deletes on their side and settles on the follow-up 404', async () => {
      const first = await sentEnvelope();

      await request(app.getHttpServer())
        .post(envelopesApi(first.admin, `/${first.envelope.id}/void`))
        .set('Cookie', first.admin.cookies)
        .send({ reason: 'Replaced by a newer agreement' })
        .expect(200);
      await queue.whenIdle();

      expect(signwell.calls).toContain('deleteDocument');
      const voided = await prisma.envelope.findUniqueOrThrow({
        where: { id: first.envelope.id },
      });
      expect(voided.status).toBe('voided');
      expect(voided.providerError).toBeNull();

      // The follow-up read 404s, because we are the ones who deleted it. That is the
      // settled state, not a fault: no error recorded, and no further call made.
      signwell.onGet = async () => null;
      const callsBefore = signwell.calls.length;
      const outcome = await app.get(ProviderReconcilerService).converge(first.envelope.id);
      expect(outcome).toBe('ignored_terminal');
      expect(signwell.calls.length).toBe(callsBefore);
      expect(
        (await prisma.envelope.findUniqueOrThrow({ where: { id: first.envelope.id } }))
          .providerError,
      ).toBeNull();

      // Signatures captured before the void stay in the trail.
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: first.envelope.id, type: 'sent' } }),
      ).toBe(1);

    });

    it('still voids when the DELETE itself answers 404', async () => {
      const second = await sentEnvelope();
      signwell.onDelete = async () => 'not_found';

      await request(app.getHttpServer())
        .post(envelopesApi(second.admin, `/${second.envelope.id}/void`))
        .set('Cookie', second.admin.cookies)
        .send({ reason: 'Already gone on their side' })
        .expect(200);
      await queue.whenIdle();

      const stubborn = await prisma.envelope.findUniqueOrThrow({
        where: { id: second.envelope.id },
      });
      expect(stubborn.status).toBe('voided');
      expect(stubborn.providerError).toBe('provider_document_already_gone');
    });
  });

  describe('TC-04-INT-10c: Our own cancellation notification is not converged', () => {
    it('acknowledges it, calls nothing, and records no provider error', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();

      await request(app.getHttpServer())
        .post(envelopesApi(admin, `/${envelope.id}/void`))
        .set('Cookie', admin.cookies)
        .send({ reason: 'Sent to the wrong counterparty' })
        .expect(200);
      await queue.whenIdle();

      // Their `document_canceled` arrives for the document we just deleted. The captured
      // delivery names its own id, so the envelope is pointed at it.
      await prisma.envelope.update({
        where: { id: envelope.id },
        data: { providerRef: documentCanceled.data.object.id },
      });
      expect(providerRef).not.toBe(documentCanceled.data.object.id);

      signwell.onGet = async () => null;
      signwell.calls.length = 0;

      await deliver(documentCanceled).expect(200);
      await queue.whenIdle();

      // The terminal check comes before the call, so `fetchState` never runs.
      expect(signwell.countOf('getDocument')).toBe(0);

      const row = await prisma.providerWebhookEvent.findFirstOrThrow({
        where: { providerRef: documentCanceled.data.object.id },
      });
      expect(row.outcome).toBe('ignored_terminal');

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('voided');
      // A 404 we caused is not a provider fault.
      expect(stored.providerError).toBeNull();
      expect(
        await prisma.envelopeEvent.count({
          where: { envelopeId: envelope.id, type: 'completed' },
        }),
      ).toBe(0);
    });
  });

  describe('TC-04-INT-13: Concurrent notifications produce one convergence', () => {
    it('completes exactly once and leaves the stored object alone', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteCompleted(providerRef);

      // Two deliveries of the same event, distinguishable only by their timestamp, so both
      // survive the composite dedupe key and both reach the reconciler.
      const now = Math.floor(Date.now() / 1000);
      await Promise.all([
        deliver(signedDelivery('document_completed', providerRef, { time: now })).expect(200),
        deliver(signedDelivery('document_completed', providerRef, { time: now + 1 })).expect(200),
      ]);
      await queue.whenIdle();

      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'completed' } }),
      ).toBe(1);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('completed');
      expect(await storage.exists(stored.signedPdfKey!)).toBe(true);

      const verified = await request(app.getHttpServer())
        .get(envelopesApi(admin, `/${envelope.id}/audit/verify`))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(verified.body).toEqual({ valid: true, firstInvalidEventId: null });
    });
  });
});

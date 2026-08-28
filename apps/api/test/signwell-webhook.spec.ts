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
import {
  WEBHOOK_RATE_LIMIT,
  WebhookRateLimiter,
} from '../src/webhooks/webhook-rate-limit.guard';
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
 * specs/documents/04-signature-providers.md, requirements 20 and 22–25 — the webhook
 * receiver.
 *
 * The doorbell is a doorbell. Its body is never believed: a verified delivery makes us
 * re-read the document from the API and converge our rows to what *that* says, which is
 * what makes replay, reordering and duplicate delivery harmless by construction.
 */

class StubPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('SignWell webhook', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let signwell: TestSignWellClient;
  let limiter: WebhookRateLimiter;

  const deliver = (body: unknown) =>
    request(app.getHttpServer()).post('/api/webhooks/signwell').send(body as object);

  /** A sent SignWell envelope, and the document id the stub holds for it. */
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

  /** Rewrites what the stub will hand back on the next read of `providerRef`. */
  const remoteSays = (
    providerRef: string,
    overrides: Parameters<typeof signWellDocument>[2],
  ) => {
    const body = signwell.createBodies[0];
    signwell.documents.set(
      providerRef,
      signWellDocument(providerRef, body, {
        fields: materializedFor(body),
        ...overrides,
      }),
    );
  };

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
    limiter = app.get(WebhookRateLimiter);
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
    limiter.reset();
  });

  describe('TC-04-INT-04: State is taken from the API, never from the webhook body', () => {
    it('ignores the body claim and converges to what the API reports', async () => {
      const { envelope, providerRef } = await sentEnvelope();

      // The body says Completed. The API says Sent. The API wins.
      const response = await deliver(
        signedDelivery('document_completed', providerRef, { status: 'Completed' }),
      ).expect(200);
      expect(response.body).toEqual({ received: true });
      await queue.whenIdle();

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('sent');
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'completed' } }),
      ).toBe(0);

      const row = await prisma.providerWebhookEvent.findFirstOrThrow({
        where: { providerRef },
      });
      expect(row.outcome).toBe('converged');
      expect(row.envelopeId).toBe(envelope.id);
      // Requirement 35 — the stored copy is the redacted one. The keys survive so the row
      // stays legible for forensics; not one signing URL and not one field value does.
      const payload = JSON.stringify(row.payload);
      expect(payload).not.toContain('signwell.com');
      expect(payload).not.toContain('live-credential');
      expect(payload).not.toContain('"ink"');
      expect(payload).toContain('"embedded_signing_url":"[redacted]"');
    });
  });

  describe('TC-04-INT-05: Redelivery is idempotent', () => {
    it('writes one row, one event, and leaves the chain verifiable', async () => {
      const { admin, envelope, providerRef } = await sentEnvelope();
      remoteSays(providerRef, { recipientStatuses: { '1': 'signed' } });

      const delivery = signedDelivery('document_signed', providerRef, {
        relatedSignerEmail: 'company@acme.com',
      });

      for (let attempt = 0; attempt < 3; attempt++) {
        await deliver(delivery).expect(200);
        await queue.whenIdle();
      }

      expect(await prisma.providerWebhookEvent.count({ where: { providerRef } })).toBe(1);
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'signed' } }),
      ).toBe(1);

      const verified = await request(app.getHttpServer())
        .get(envelopesApi(admin, `/${envelope.id}/audit/verify`))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(verified.body).toEqual({ valid: true, firstInvalidEventId: null });
    });
  });

  describe('TC-04-INT-07: An unknown reference leaks nothing', () => {
    it('answers a byte-identical body whether the document is ours or not', async () => {
      const { providerRef } = await sentEnvelope();

      const unknown = await deliver(
        signedDelivery('document_signed', 'sw-a-document-we-do-not-hold'),
      ).expect(200);
      const known = await deliver(signedDelivery('document_signed', providerRef)).expect(200);
      await queue.whenIdle();

      expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(known.body));
      expect(unknown.text).toBe(known.text);

      const stranger = await prisma.providerWebhookEvent.findFirstOrThrow({
        where: { providerRef: 'sw-a-document-we-do-not-hold' },
      });
      expect(stranger.outcome).toBe('unknown_ref');
      expect(stranger.envelopeId).toBeNull();
    });
  });

  describe('TC-04-INT-08: A bad hash is rejected without a record', () => {
    it('answers 401 with an empty body and records nothing', async () => {
      const { envelope, providerRef } = await sentEnvelope();
      const before = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });

      const forged = signedDelivery('document_completed', providerRef) as {
        event: { hash: string };
      };
      forged.event.hash = 'f'.repeat(64);

      const refused = await deliver(forged).expect(401);
      expect(refused.text).toBe('');
      await queue.whenIdle();

      expect(await prisma.providerWebhookEvent.count()).toBe(0);
      expect(await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } })).toEqual(
        before,
      );
    });

    /**
     * The other empty refusal on this route, from the same line of the API contract:
     * "`429` empty body — rate limit". Empty has to mean empty for the same reason it
     * does one status code up — `{"statusCode":429,"message":""}` is still a shape a
     * caller can compare against the `200 {"received":true}` a verified delivery gets.
     *
     * The window is filled through the limiter rather than by posting 600 requests, so
     * the case costs microseconds and asserts the response shape, which is the part that
     * can regress.
     */
    it('answers a rate-limited delivery with an empty 429', async () => {
      const { providerRef } = await sentEnvelope();
      const rowsBefore = await prisma.providerWebhookEvent.count();

      // The key is the source address, and `clientIp` reads `X-Forwarded-For` first — so
      // the case names its own source rather than guessing what the loopback looks like.
      const source = '203.0.113.7';
      for (let hit = 0; hit < WEBHOOK_RATE_LIMIT; hit++) limiter.allow(source);

      const refused = await request(app.getHttpServer())
        .post('/api/webhooks/signwell')
        .set('X-Forwarded-For', source)
        .send(signedDelivery('document_viewed', providerRef) as object)
        .expect(429);
      expect(refused.text).toBe('');
      expect(refused.body).toEqual({});
      await queue.whenIdle();

      // Refused before anything was read: no forensics row, and nothing enqueued.
      expect(await prisma.providerWebhookEvent.count()).toBe(rowsBefore);
    });
  });
});

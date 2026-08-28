import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { hashSigningToken } from '../src/signature/signing-token';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PdfRenderer } from '../src/pdf/pdf-renderer';
import { PrismaService } from '../src/prisma.service';
import { JobQueue } from '../src/queue/job-queue';
import { SignWellHttpClient } from '../src/signature/signwell/signwell-http-client';
import {
  envelopesApi,
  publishTemplate,
  sendableEnvelope,
  signup,
  tokenFromUrl,
} from './envelope-fixtures';
import {
  TestSignWellClient,
  materializedFor,
  signWellDocument,
  useSignWell,
} from './signwell-fixtures';

/**
 * specs/documents/04-signature-providers.md, requirements 16 and 18 — what
 * `GET /api/sign/{token}` gains under a provider that hosts the signing surface.
 *
 * The embedded URL is a live credential: it is fetched per request, handed to the browser,
 * and never written down. And it is only fetched when it can be used — a signer whose turn
 * has not started is answered from our own rows and costs no call at all.
 */

class StubPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('Embedded signing surface', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let signwell: TestSignWellClient;

  const surfaceFor = (token: string) =>
    request(app.getHttpServer()).get(`/api/sign/${token}`);

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

  describe('TC-04-INT-14: The signing URL is fetched per request and never stored', () => {
    it('answers with the URL of that call and writes none of them down', async () => {
      const { envelope, providerRef } = await sentEnvelope();
      const token = tokenFromUrl(
        mail.lastFor('company@acme.com', 'signing_invitation')!.signingUrl,
      );

      let issued = 0;
      signwell.onGet = async () => {
        issued += 1;
        const document = signWellDocument(providerRef, signwell.createBodies[0], {
          fields: materializedFor(signwell.createBodies[0]),
        });
        return {
          ...document,
          recipients: (document.recipients ?? []).map((recipient) => ({
            ...recipient,
            embedded_signing_url: `https://www.signwell.com/docs/credential-${issued}/`,
          })),
        };
      };

      const first = await surfaceFor(token).expect(200);
      const second = await surfaceFor(token).expect(200);

      expect(first.body.surface).toBe('embedded');
      expect(first.body.embeddedSigningUrl).toBe('https://www.signwell.com/docs/credential-1/');
      expect(second.body.embeddedSigningUrl).toBe('https://www.signwell.com/docs/credential-2/');
      expect(first.body.testMode).toBe(true);

      // No column holds it — not on the envelope, not on the signer, not on the token.
      const stored = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: { include: { tokens: true } } },
      });
      const persisted = JSON.stringify(stored);
      expect(persisted).not.toContain('credential-1');
      expect(persisted).not.toContain('credential-2');
      expect(persisted).not.toContain('signwell.com/docs');

      // Spec 02 requirement 17 is unaffected: one `viewed` event across both reads.
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'viewed' } }),
      ).toBe(1);
    });
  });

  describe('TC-04-INT-15: A signer whose turn has not started costs no API call', () => {
    it('answers spec 02 not-your-turn without touching the provider', async () => {
      const { envelope } = await sentEnvelope();
      const second = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 2 },
      });

      // Minted directly, exactly as spec 02's TC-02-INT-13 does: under normal operation
      // signer 2 has no token until signer 1 signs, and the check defends against a
      // leaked or guessed one.
      const raw = 'out-of-turn-raw-token-value';
      await prisma.signingToken.create({
        data: {
          envelopeSignerId: second.id,
          tokenHash: hashSigningToken(raw),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      signwell.calls.length = 0;
      signwell.onGet = async () => {
        throw new Error('the provider must not be called for a signer whose turn has not started');
      };

      const refused = await surfaceFor(raw).expect(403);
      expect(refused.body.error).toBe('not_your_turn');

      // Edge case 18 — the answer comes from our own rows, and the budget is untouched.
      expect(signwell.calls).toEqual([]);
    });
  });
});

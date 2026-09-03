import { INestApplication } from '@nestjs/common';
import { createHash } from 'node:crypto';
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
import { hashSigningToken } from '../src/signature/signing-token';
import {
  SIGNING_RATE_LIMIT,
  SigningRateLimiter,
} from '../src/signing/signing-rate-limit.guard';
import {
  DRAWN_SIGNATURE,
  Signed,
  createEnvelope,
  drawnSignaturePayload,
  envelopesApi,
  fillEnvelope,
  makeNoisyPng,
  makePng,
  pngDataUri,
  publishTemplate,
  sendableEnvelope,
  signup,
  tokenFromUrl,
} from './envelope-fixtures';

/**
 * The public, session-less half of specs/documents/02-envelopes-and-signing.md, plus the
 * internal sweep. Every `describe` carries its TC id.
 */
class StubPdfRenderer extends PdfRenderer {
  /**
   * The last document handed to the renderer. The PDF itself is a stub, so this is the
   * only place a case can see what the completed document actually says.
   */
  static lastHtml = '';

  async render(html: string): Promise<Buffer> {
    StubPdfRenderer.lastHtml = html;
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

const INTERNAL_SECRET = 'test-internal-task-secret';

describe('Signing', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let limiter: SigningRateLimiter;

  const post = (who: Signed, path: string, body: object = {}) =>
    request(app.getHttpServer()).post(envelopesApi(who, path)).set('Cookie', who.cookies).send(body);

  const openLink = (token: string) => request(app.getHttpServer()).get(`/api/sign/${token}`);

  const signAs = (token: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(`/api/sign/${token}/sign`)
      .send({ consentAccepted: true, signature: drawnSignaturePayload, ...body });

  const invitationTokenFor = (email: string) =>
    tokenFromUrl(mail.lastFor(email, 'signing_invitation')!.signingUrl);

  /** A published template, a filled envelope, sent — where most cases here begin. */
  const sentEnvelope = async (emails?: string[]) => {
    const admin = await signup(app, `admin${Date.now()}@acme.com`, 'Acme Inc');
    const template = await publishTemplate(app, admin);
    const envelope = await sendableEnvelope(
      app,
      admin,
      template.id,
      emails ? { emails } : {},
    );
    await post(admin, `/${envelope.id}/send`).expect(200);
    return { admin, template, envelope };
  };

  beforeAll(async () => {
    process.env.INTERNAL_TASK_SECRET = INTERNAL_SECRET;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(PdfRenderer)
      .useClass(StubPdfRenderer)
      .compile();

    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.use(json({ limit: '4mb' }));
    await app.init();

    prisma = app.get(PrismaService);
    mail = app.get(MailService);
    queue = app.get(JobQueue);
    limiter = app.get(SigningRateLimiter);
  });

  afterAll(async () => {
    delete process.env.INTERNAL_TASK_SECRET;
    // Envelopes outlive this suite unless they are cleared here: `templateVersionId` is
    // a Restrict foreign key, so a leftover document would make the spec-01 suite's
    // `documentTemplate.deleteMany()` fail depending on which file Jest runs first.
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
    // The window is per IP and per token prefix, so cases rarely collide — but a case
    // that deliberately makes many calls would poison the next one.
    limiter.reset();
  });

  describe('TC-02-INT-08: Second signer has no token until the first signs', () => {
    it('mints the second token only when the first signature lands', async () => {
      const { envelope } = await sentEnvelope();

      expect(await prisma.signingToken.count({ where: { signer: { envelopeId: envelope.id } } })).toBe(1);
      expect(mail.sent.filter((m) => m.to === 'alex@example.com')).toHaveLength(0);

      await signAs(invitationTokenFor('company@acme.com')).expect(200);

      const tokens = await prisma.signingToken.findMany({
        where: { signer: { envelopeId: envelope.id } },
      });
      expect(tokens).toHaveLength(2);
      expect(tokens.filter((t) => t.usedAt !== null)).toHaveLength(1);
      expect(
        mail.sent.filter((m) => m.to === 'alex@example.com' && m.type === 'signing_invitation'),
      ).toHaveLength(1);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('partially_signed');
    });
  });

  describe('TC-02-INT-09: Signing idempotency under concurrency', () => {
    it('applies exactly one signature for two simultaneous submissions', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      // Genuinely simultaneous: the row lock inside the signing transaction is the only
      // thing standing between this and a double transition, and a sequential pair would
      // not touch it.
      const [a, b] = await Promise.all([signAs(token), signAs(token)]);

      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.state).toBe('already_signed');
      expect(b.body.state).toBe('already_signed');

      const signers = await prisma.envelopeSigner.findMany({ where: { envelopeId: envelope.id } });
      expect(signers.filter((s) => s.status === 'signed')).toHaveLength(1);
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'signed' } }),
      ).toBe(1);

      const second = signers.find((s) => s.order === 2)!;
      expect(await prisma.signingToken.count({ where: { envelopeSignerId: second.id } })).toBe(1);
    });
  });

  describe('TC-02-INT-10: Signer cannot overwrite a sender field', () => {
    it('drops the sender-owned value and keeps the signer-owned one', async () => {
      const { envelope } = await sentEnvelope();
      await signAs(invitationTokenFor('company@acme.com')).expect(200);

      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_tax_id: '000000000', contractor_bank: 'IBAN BY13 REAL' },
      }).expect(200);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      const values = stored.fieldValues as Record<string, string>;
      expect(values.contractor_tax_id).toBe('191234567');
      expect(values.contractor_bank).toBe('IBAN BY13 REAL');
    });
  });

  describe('TC-02-INT-11: Consent is mandatory', () => {
    it('refuses without consent and records nothing', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      const response = await request(app.getHttpServer())
        .post(`/api/sign/${token}/sign`)
        .send({ consentAccepted: false, signature: drawnSignaturePayload })
        .expect(400);
      expect(response.body.error).toBe('consent_required');

      const signer = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 1 },
      });
      expect(signer.status).not.toBe('signed');
      expect(signer.consentAcceptedAt).toBeNull();
      expect(signer.signatureImage).toBeNull();
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'signed' } }),
      ).toBe(0);
    });
  });

  describe('TC-02-INT-12: Empty and oversized signatures', () => {
    it('refuses blank ink, an oversized image, and a whitespace typed name', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      const blank = await signAs(token, {
        signature: { type: 'drawn', value: pngDataUri(makePng(4, 4, 0)) },
      }).expect(400);
      expect(blank.body.error).toBe('empty_signature');

      // Comfortably past the 512 KB cap, measured on the decoded PNG bytes.
      const oversized = makeNoisyPng(420, 420);
      expect(oversized.length).toBeGreaterThan(512 * 1024);
      const huge = await signAs(token, {
        signature: { type: 'drawn', value: pngDataUri(oversized) },
      }).expect(400);
      expect(huge.body.error).toBe('signature_too_large');

      const typed = await signAs(token, { signature: { type: 'typed', value: '   ' } }).expect(400);
      expect(typed.body.error).toBe('invalid_typed_signature');

      const signer = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 1 },
      });
      expect(signer.signatureImage).toBeNull();
      expect(signer.status).not.toBe('signed');
    });

    it('accepts a typed signature and stores the name beside its rendering', async () => {
      await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      await signAs(token, { signature: { type: 'typed', value: 'Ivan Demchenko' } }).expect(200);

      const signer = await prisma.envelopeSigner.findFirstOrThrow({ where: { order: 1 } });
      expect(signer.signatureType).toBe('typed');
      expect(signer.signatureTypedName).toBe('Ivan Demchenko');
      expect(signer.signatureImage).toMatch(/^data:image\//);
    });
  });

  describe('TC-02-INT-13: Out-of-turn token rejected', () => {
    it('refuses a token minted for the second signer', async () => {
      const { envelope } = await sentEnvelope();
      const second = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 2 },
      });

      // Minted directly, exactly as the case describes — under normal operation such a
      // token does not exist, and the check defends against a leaked or guessed one.
      const raw = 'out-of-turn-raw-token-value';
      await prisma.signingToken.create({
        data: {
          envelopeSignerId: second.id,
          tokenHash: hashSigningToken(raw),
          expiresAt: new Date(Date.now() + 86_400_000),
        },
      });

      const opened = await openLink(raw).expect(403);
      expect(opened.body.error).toBe('not_your_turn');

      const signed = await signAs(raw).expect(403);
      expect(signed.body.error).toBe('not_your_turn');

      expect(
        await prisma.envelopeEvent.count({
          where: { envelopeId: envelope.id, type: { in: ['signed', 'viewed'] } },
        }),
      ).toBe(0);
    });
  });

  describe('TC-02-INT-14: Decline invalidates every token', () => {
    it('moves the envelope to declined and tells the sender', async () => {
      const { admin, envelope } = await sentEnvelope();
      const firstToken = invitationTokenFor('company@acme.com');
      await signAs(firstToken).expect(200);
      const secondToken = invitationTokenFor('alex@example.com');

      const declined = await request(app.getHttpServer())
        .post(`/api/sign/${secondToken}/decline`)
        .send({ reason: 'Terms are not acceptable' })
        .expect(200);
      expect(declined.body.state).toBe('declined');

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('declined');

      const tokens = await prisma.signingToken.findMany({
        where: { signer: { envelopeId: envelope.id } },
      });
      expect(tokens.every((t) => t.isInvalidated)).toBe(true);

      // Both links report the declined state rather than the generic invalid page: the
      // signer following their link deserves to know what happened.
      for (const token of [firstToken, secondToken]) {
        const view = await openLink(token).expect(200);
        expect(view.body.state).toBe('declined');
      }

      const notice = mail.lastFor(admin.email, 'envelope_declined');
      expect(notice?.declineReason).toBe('Terms are not acceptable');
      expect(notice?.declinedByName).toBe('Alex Kaminski');
    });
  });

  describe('TC-02-INT-17: Lazy expiry is authoritative', () => {
    it('is right before the sweep runs, and the sweep only materializes it', async () => {
      const { admin, envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      // The case's own precondition: moved directly in the database, status still `sent`.
      await prisma.envelope.update({
        where: { id: envelope.id },
        data: { expiresAt: new Date(Date.now() - 60_000) },
      });
      expect(
        (await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } })).status,
      ).toBe('sent');

      const detail = await request(app.getHttpServer())
        .get(envelopesApi(admin, `/${envelope.id}`))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(detail.body.status).toBe('expired');

      const opened = await openLink(token).expect(410);
      expect(opened.body.error).toBe('expired');
      const refused = await signAs(token).expect(410);
      expect(refused.body.error).toBe('expired');

      const sweep = await request(app.getHttpServer())
        .post('/api/internal/envelopes/sweep')
        .set('Authorization', `Bearer ${INTERNAL_SECRET}`)
        .expect(200);
      expect(sweep.body.expired).toBe(1);

      const materialized = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(materialized.status).toBe('expired');
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'expired' } }),
      ).toBe(1);

      // Re-running must not duplicate the event.
      const again = await request(app.getHttpServer())
        .post('/api/internal/envelopes/sweep')
        .set('Authorization', `Bearer ${INTERNAL_SECRET}`)
        .expect(200);
      expect(again.body.expired).toBe(0);
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'expired' } }),
      ).toBe(1);
    });

    it('refuses the sweep without the internal secret', async () => {
      await request(app.getHttpServer()).post('/api/internal/envelopes/sweep').expect(401);
      await request(app.getHttpServer())
        .post('/api/internal/envelopes/sweep')
        .set('Authorization', 'Bearer wrong')
        .expect(401);
    });
  });

  describe('TC-02-INT-21: Document integrity check', () => {
    it('refuses to sign a document whose frozen HTML no longer matches its hash', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      await prisma.envelope.update({
        where: { id: envelope.id },
        data: { renderedHtml: '<p>Tampered contract</p>' },
      });

      const response = await signAs(token).expect(500);
      expect(response.body.error).toBe('document_integrity_failure');

      const signer = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 1 },
      });
      expect(signer.status).not.toBe('signed');
      expect(signer.signatureImage).toBeNull();
      expect(
        await prisma.envelopeEvent.count({
          where: { envelopeId: envelope.id, type: 'tamper_detected' },
        }),
      ).toBe(1);
    });
  });

  describe('TC-02-INT-24: Unknown token leaks nothing', () => {
    it('answers identically for an unknown token and an invalidated one', async () => {
      const { admin, envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      // Superseded by a resend — a real token for a real envelope, now dead.
      const signer = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 1 },
      });
      await post(admin, `/${envelope.id}/signers/${signer.id}/resend`).expect(200);

      const unknown = await openLink('completely-made-up-token').expect(404);
      const invalidated = await openLink(token).expect(404);

      expect(invalidated.body).toEqual(unknown.body);
      expect(unknown.body).toEqual({
        error: 'invalid_link',
        message: 'This signing link is not valid.',
      });
      // Nothing about the envelope, the organization, or the signer may appear.
      const serialized = JSON.stringify(invalidated.body) + JSON.stringify(invalidated.headers);
      expect(serialized).not.toContain('Acme');
      expect(serialized).not.toContain('Kaminski');
      expect(serialized).not.toContain(envelope.id);
    });
  });

  describe('TC-02-INT-25: Rate limiting on the public surface', () => {
    it('allows ten requests a minute and refuses the rest', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');
      const ip = '203.0.113.7';

      const statuses: number[] = [];
      // Really fifteen calls, one after another — the limiter is a real sliding window
      // and simulating it would test the simulation.
      for (let i = 0; i < 15; i++) {
        const response = await request(app.getHttpServer())
          .get(`/api/sign/${token}`)
          .set('X-Forwarded-For', ip);
        statuses.push(response.status);
        if (response.status === 429) {
          expect(response.body.error).toBe('rate_limited');
          expect(response.body.retryAfterSeconds).toBeGreaterThan(0);
        }
      }

      expect(statuses.slice(0, SIGNING_RATE_LIMIT)).toEqual(
        new Array(SIGNING_RATE_LIMIT).fill(200),
      );
      expect(statuses.slice(SIGNING_RATE_LIMIT)).toEqual(
        new Array(15 - SIGNING_RATE_LIMIT).fill(429),
      );

      // A different client is unaffected — the limit is per IP, not global.
      await request(app.getHttpServer())
        .get(`/api/sign/${token}`)
        .set('X-Forwarded-For', '198.51.100.9')
        .expect(200);

      // And the window resets: the limiter's clock is the only thing holding the door.
      limiter.reset();
      await request(app.getHttpServer())
        .get(`/api/sign/${token}`)
        .set('X-Forwarded-For', ip)
        .expect(200);

      expect(envelope.id).toBeTruthy();
    });
  });

  describe('TC-02-INT-28: Shared signer email', () => {
    it('issues two distinct tokens and completes normally', async () => {
      const { envelope } = await sentEnvelope(['same@example.com', 'same@example.com']);

      const firstToken = invitationTokenFor('same@example.com');
      await signAs(firstToken).expect(200);
      const secondToken = invitationTokenFor('same@example.com');
      expect(secondToken).not.toBe(firstToken);

      expect(
        mail.sent.filter(
          (m) => m.type === 'signing_invitation' && m.to === 'same@example.com',
        ),
      ).toHaveLength(2);

      await signAs(secondToken, { fieldValues: { contractor_bank: 'IBAN BY13' } }).expect(200);
      await queue.whenIdle();

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('completed');
      const signers = await prisma.envelopeSigner.findMany({ where: { envelopeId: envelope.id } });
      expect(signers.every((s) => s.status === 'signed')).toBe(true);
      expect(new Set(signers.map((s) => s.signatureImage)).size).toBeGreaterThan(0);
    });
  });

  describe('The signing surface itself', () => {
    it('sets no cookie on any route', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      const opened = await openLink(token).expect(200);
      expect(opened.headers['set-cookie']).toBeUndefined();

      const signed = await signAs(token).expect(200);
      expect(signed.headers['set-cookie']).toBeUndefined();
      expect(envelope.id).toBeTruthy();
    });

    it('serves the frozen document and only the signer-owned fields', async () => {
      await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      const opened = await openLink(token).expect(200);
      expect(opened.body.state).toBe('ready_to_sign');
      expect(opened.body.envelope.renderedHtml).toContain('Alex Kaminski');
      expect(opened.body.envelope.documentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(opened.body.signer.roleLabel).toBe('Company');
      // The company role owns no fields in this template; the contractor's are not theirs.
      expect(opened.body.fields).toEqual([]);
      expect(opened.body.consentText).toBe(
        'I agree to sign this document electronically and that my electronic signature is legally binding.',
      );

      await signAs(token).expect(200);
      const contractor = await openLink(invitationTokenFor('alex@example.com')).expect(200);
      expect(contractor.body.fields.map((f: { key: string }) => f.key)).toEqual([
        'contractor_bank',
      ]);
    });

    it('never shows a signer a raw placeholder, before or after the value is entered', async () => {
      const { envelope } = await sentEnvelope();
      const first = invitationTokenFor('company@acme.com');

      // The frozen document keeps the contractor's placeholder — it is what was hashed
      // and signed — but no counterparty is ever shown template syntax.
      const frozen = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(frozen.renderedHtml).toContain('{{contractor_bank}}');
      const opened = await openLink(first).expect(200);
      expect(opened.body.envelope.renderedHtml).not.toContain('{{');

      await signAs(first).expect(200);
      const second = invitationTokenFor('alex@example.com');
      await signAs(second, { fieldValues: { contractor_bank: 'IBAN BY13 ACME' } }).expect(200);
      await queue.whenIdle();

      // The same link, reopened after signing, shows what was actually agreed.
      const after = await openLink(second).expect(200);
      expect(after.body.envelope.renderedHtml).toContain('IBAN BY13 ACME');
      expect(after.body.envelope.renderedHtml).not.toContain('{{');
      // Presentation only: the stored document and the hash it reports are untouched.
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.renderedHtml).toBe(frozen.renderedHtml);
      expect(after.body.envelope.documentHash).toBe(stored.documentHash);
    });

    /* ---------------------------------------------------------------- *
     * The signature on the line.
     *
     * Sequential signing exists so that the second party receives a document already
     * signed by the first, and a completed contract must carry its signatures in its own
     * signature block — the Certificate of Completion beneath it is attribution, not the
     * signature. Both are filled from the frozen HTML on the way out, never written back.
     * ---------------------------------------------------------------- */
    it('shows the second signer the first signature, and leaves their own block empty', async () => {
      await sentEnvelope();
      await signAs(invitationTokenFor('company@acme.com')).expect(200);

      const contractor = await openLink(invitationTokenFor('alex@example.com')).expect(200);
      const html: string = contractor.body.envelope.renderedHtml;

      // Signer 1's signature is on signer 1's line — inside the block, not only in a
      // certificate the signing page never shows.
      expect(html).toContain(
        `<div class="signature-line"><span class="signature-mark" data-signature-for="company">` +
          `<img src="${DRAWN_SIGNATURE}"`,
      );
      // Signer 2 has not signed, so their slot is still the empty anchor.
      expect(html).toContain(
        '<div class="signature-block" data-signer-role="contractor">' +
          '<div class="signature-line"><span class="signature-mark" ' +
          'data-signature-for="contractor"></span></div>',
      );
      expect(html.match(/<img src="data:image\//g) ?? []).toHaveLength(1);
    });

    it('carries both signatures in their blocks in the completed document', async () => {
      const { envelope } = await sentEnvelope();
      const frozen = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });

      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        // Typed, so the case also proves a typed signature is drawn on the line the same
        // way the certificate renders it, rather than left blank.
        signature: { type: 'typed', value: 'Alex Kaminski' },
        fieldValues: { contractor_bank: 'IBAN BY13 ACME' },
      }).expect(200);
      await queue.whenIdle();

      const finalized = StubPdfRenderer.lastHtml;
      const document = finalized.slice(0, finalized.indexOf('<section class="certificate">'));

      expect(document).toContain(
        `<span class="signature-mark" data-signature-for="company">` +
          `<img src="${DRAWN_SIGNATURE}"`,
      );
      const typed = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 2 },
      });
      expect(document).toContain(
        `<span class="signature-mark" data-signature-for="contractor">` +
          `<img src="${typed.signatureImage}"`,
      );
      // The certificate is unchanged: it still carries both images as attribution.
      const certificate = finalized.slice(finalized.indexOf('<section class="certificate">'));
      expect(certificate).toContain(DRAWN_SIGNATURE);
      expect(certificate).toContain(typed.signatureImage);

      // Neither pass wrote back: the stored bytes still hash to the stored hash and still
      // carry the *unfilled* anchor and the untouched signer placeholder.
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.renderedHtml).toBe(frozen.renderedHtml);
      expect(stored.renderedHtml).toContain(
        '<span class="signature-mark" data-signature-for="company"></span>',
      );
      expect(stored.renderedHtml).toContain('{{contractor_bank}}');
      expect(createHash('sha256').update(stored.renderedHtml ?? '', 'utf8').digest('hex')).toBe(
        stored.documentHash,
      );
    });

    it('never lets a signature-shaped string that is not an image reach the document', async () => {
      const { envelope } = await sentEnvelope();
      await signAs(invitationTokenFor('company@acme.com')).expect(200);

      // The stored column is bypassed deliberately: the API refuses this payload, so the
      // only way to ask "and if a bad value were in the column?" is to put one there.
      await prisma.envelopeSigner.updateMany({
        where: { envelopeId: envelope.id, order: 1 },
        data: { signatureImage: '"><script>alert(1)</script><img src=x onerror=alert(1)>' },
      });

      const contractor = await openLink(invitationTokenFor('alex@example.com')).expect(200);
      const html: string = contractor.body.envelope.renderedHtml;

      expect(html).not.toContain('<script>');
      expect(html).not.toContain('onerror');
      // Nothing we cannot vouch for is drawn, so the line is simply left blank.
      expect(html).toContain(
        '<span class="signature-mark" data-signature-for="company"></span>',
      );
    });

    it('leaves the certificate cell empty for a stored image it cannot vouch for', async () => {
      const { envelope } = await sentEnvelope();
      await signAs(invitationTokenFor('company@acme.com')).expect(200);

      // Same deliberate bypass as the document case above: the API refuses this payload on
      // the wire, so the only way to ask what the *certificate* does with a bad stored
      // value is to put one in the column. The certificate and the document must agree
      // about what a signature is — before this, the certificate escaped the string and
      // handed it to `<img src>` anyway.
      await prisma.envelopeSigner.updateMany({
        where: { envelopeId: envelope.id, order: 1 },
        data: { signatureImage: 'javascript:alert(1)' },
      });

      await signAs(invitationTokenFor('alex@example.com'), {
        signature: { type: 'typed', value: 'Alex Kaminski' },
        fieldValues: { contractor_bank: 'IBAN BY13 ACME' },
      }).expect(200);
      await queue.whenIdle();

      const finalized = StubPdfRenderer.lastHtml;
      const certificate = finalized.slice(finalized.indexOf('<section class="certificate">'));

      expect(certificate).not.toContain('javascript:');
      // An empty cell, not a broken image: the row still records who signed and when, and
      // says nothing it cannot support about the mark itself.
      expect(certificate).toContain('<tr><th>Signature (drawn)</th><td></td></tr>');
      // Signer 2's typed signature is untouched — the guard rejects one value, not the
      // whole certificate.
      const typed = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 2 },
      });
      expect(certificate).toContain(typed.signatureImage);
    });

    it('makes the finalized document inert wherever it is opened', async () => {
      await sentEnvelope();
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13 ACME' },
      }).expect(200);
      await queue.whenIdle();

      // The frozen document's own CSP is now a `<meta>` inside an embedded fragment and
      // governs nothing. This wrapper is what becomes the PDF and what the completion mail
      // links to, and it carries author-controlled template HTML plus signer-supplied
      // images, so the policy has to be restated at the top of it.
      const finalized = StubPdfRenderer.lastHtml;
      const head = finalized.slice(0, finalized.indexOf('</head>'));
      expect(head).toContain('http-equiv="Content-Security-Policy"');
      expect(head).toContain("default-src 'none'");
      expect(head).toContain('img-src data:');
      expect(head).toContain("base-uri 'none'");
      expect(head).toContain("form-action 'none'");
      // The signature images still render, which is the whole point of allowing `data:`.
      expect(finalized).toContain('<img src="data:image/');
    });

    it('records viewed once per signer however many times the link is opened', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');

      await openLink(token).expect(200);
      await openLink(token).expect(200);
      await request(app.getHttpServer()).post(`/api/sign/${token}/view`).expect(204);

      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'viewed' } }),
      ).toBe(1);
      const signer = await prisma.envelopeSigner.findFirstOrThrow({
        where: { envelopeId: envelope.id, order: 1 },
      });
      expect(signer.status).toBe('viewed');
    });

    it('refuses a signature that leaves a required signer field empty', async () => {
      await sentEnvelope();
      await signAs(invitationTokenFor('company@acme.com')).expect(200);

      const response = await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: '' },
      }).expect(400);
      expect(response.body.errors.contractor_bank).toBe('Bank details is required');
    });

    it('turns a used link into a read-only view with a download once the PDF is ready', async () => {
      const { envelope } = await sentEnvelope();
      const firstToken = invitationTokenFor('company@acme.com');
      await signAs(firstToken).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13' },
      }).expect(200);
      await queue.whenIdle();

      const view = await openLink(firstToken).expect(200);
      expect(view.body.state).toBe('already_signed');
      expect(view.body.downloadAvailable).toBe(true);

      const download = await request(app.getHttpServer())
        .get(`/api/sign/${firstToken}/document`)
        .expect(200);
      expect(download.body.url).toContain('/api/local-files');
      expect(
        await prisma.envelopeEvent.count({
          where: { envelopeId: envelope.id, type: 'downloaded' },
        }),
      ).toBe(1);
    });

    it('records a request for a new link without issuing one', async () => {
      const { envelope } = await sentEnvelope();
      const token = invitationTokenFor('company@acme.com');
      const before = await prisma.signingToken.count({
        where: { signer: { envelopeId: envelope.id } },
      });

      await request(app.getHttpServer())
        .post(`/api/sign/${token}/request-new-link`)
        .expect(204);

      expect(
        await prisma.signingToken.count({ where: { signer: { envelopeId: envelope.id } } }),
      ).toBe(before);
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'reminded' } }),
      ).toBe(1);
    });
  });

  describe('The sweep', () => {
    it('sends one reminder past the halfway point and never a second', async () => {
      const { envelope } = await sentEnvelope();

      // Halfway is the only thing that matters here, so the window is moved rather than
      // the clock: sent in the past, expiring in the near future.
      await prisma.envelope.update({
        where: { id: envelope.id },
        data: {
          sentAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
          expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        },
      });

      const first = await request(app.getHttpServer())
        .post('/api/internal/envelopes/sweep')
        .set('Authorization', `Bearer ${INTERNAL_SECRET}`)
        .expect(200);
      expect(first.body.remindersSent).toBe(1);
      expect(mail.sent.filter((m) => m.type === 'signing_reminder')).toHaveLength(1);

      const second = await request(app.getHttpServer())
        .post('/api/internal/envelopes/sweep')
        .set('Authorization', `Bearer ${INTERNAL_SECRET}`)
        .expect(200);
      expect(second.body.remindersSent).toBe(0);
    });
  });

  describe('Draft envelopes are not signable at all', () => {
    it('has no token before the envelope is sent', async () => {
      const admin = await signup(app, 'draft@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id);
      await fillEnvelope(app, admin, envelope).expect(200);

      expect(await prisma.signingToken.count()).toBe(0);
      expect(mail.sent).toHaveLength(0);
    });
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { EnvelopeCompletionService } from '../src/documents/envelope-completion';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PdfRenderer } from '../src/pdf/pdf-renderer';
import { PrismaService } from '../src/prisma.service';
import { JobQueue } from '../src/queue/job-queue';
import {
  Signed,
  createEnvelope,
  drawnSignaturePayload,
  envelopesApi,
  fillEnvelope,
  publishTemplate,
  sendableEnvelope,
  setRole,
  signup,
  tokenFromUrl,
} from './envelope-fixtures';

/**
 * The org-scoped half of specs/documents/02-envelopes-and-signing.md. Every `describe`
 * carries its TC id so the spec and the suite read side by side; the public signing
 * surface is covered by `signing.spec.ts`.
 */

/**
 * A stub in place of the Chromium driver. `drivers.spec.ts` already proves the real one
 * works; what these cases need is a renderer whose *failure* is a switch, because
 * requirement 31 is entirely about what survives one.
 */
class StubPdfRenderer extends PdfRenderer {
  fail = false;
  rendered: string[] = [];

  async render(html: string): Promise<Buffer> {
    if (this.fail) throw new Error('renderer unavailable');
    this.rendered.push(html);
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('Envelopes', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let pdf: StubPdfRenderer;
  let queue: JobQueue;

  const post = (who: Signed, path: string, body: object = {}) =>
    request(app.getHttpServer()).post(envelopesApi(who, path)).set('Cookie', who.cookies).send(body);

  const get = (who: Signed, path: string) =>
    request(app.getHttpServer()).get(envelopesApi(who, path)).set('Cookie', who.cookies);

  const signAs = (token: string, body: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post(`/api/sign/${token}/sign`)
      .send({ consentAccepted: true, signature: drawnSignaturePayload, ...body });

  const invitationTokenFor = (email: string) =>
    tokenFromUrl(mail.lastFor(email, 'signing_invitation')!.signingUrl);

  beforeAll(async () => {
    pdf = new StubPdfRenderer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(PdfRenderer)
      .useValue(pdf)
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
    // Envelopes outlive this suite unless they are cleared here: `templateVersionId` is
    // a Restrict foreign key, so a leftover document would make the spec-01 suite's
    // `documentTemplate.deleteMany()` fail depending on which file Jest runs first.
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await app.close();
  });

  beforeEach(async () => {
    // Envelopes first: `templateVersionId` is a Restrict foreign key, so a template
    // cannot be deleted while a document still points at it.
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
    pdf.fail = false;
    pdf.rendered.length = 0;
  });

  describe('TC-02-INT-01: Create an envelope from a published template', () => {
    it('pins the current version, starts in draft, and materializes both signers', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);

      const created = await createEnvelope(app, admin, template.id);

      expect(created.signers.map((s) => [s.roleKey, s.order])).toEqual([
        ['company', 1],
        ['contractor', 2],
      ]);
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: created.id } });
      expect(stored.status).toBe('draft');
      expect(stored.templateVersionId).toBe(template.versionId);

      const detail = await get(admin, `/${created.id}`).expect(200);
      expect(detail.body.status).toBe('draft');
      expect(detail.body.template.versionNumber).toBe(1);
      expect(detail.body.signers).toHaveLength(2);
      expect(detail.body.signers.every((s: { name: string }) => s.name === '')).toBe(true);
      // Requirement: `renderedHtml` exists only once the envelope has been sent.
      expect(detail.body.renderedHtml).toBeNull();
    });
  });

  describe('TC-02-INT-02: Version pinning survives a template republish', () => {
    it('renders v1 even after v2 is published', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);

      const base = `/api/organizations/${admin.organizationId}/document-templates`;
      await request(app.getHttpServer())
        .put(`${base}/${template.id}/draft`)
        .set('Cookie', admin.cookies)
        .send({
          rowVersion: 1,
          bodyHtml: '<p>COMPLETELY DIFFERENT v2 body {{full_name}}</p>',
          signerRoles: [
            { key: 'company', label: 'Company', order: 1 },
            { key: 'contractor', label: 'Contractor', order: 2 },
          ],
          fields: [
            {
              key: 'full_name',
              label: 'Full name',
              type: 'text',
              required: true,
              maxLength: 200,
              filledBy: 'sender',
              order: 1,
            },
          ],
        })
        .expect(200);
      await request(app.getHttpServer())
        .post(`${base}/${template.id}/publish`)
        .set('Cookie', admin.cookies)
        .expect(200);

      const detail = await get(admin, `/${envelope.id}`).expect(200);
      expect(detail.body.template.versionNumber).toBe(1);

      await post(admin, `/${envelope.id}/send`).expect(200);
      const sent = await get(admin, `/${envelope.id}`).expect(200);
      expect(sent.body.renderedHtml).toContain('AGREEMENT with Alex Kaminski');
      expect(sent.body.renderedHtml).not.toContain('COMPLETELY DIFFERENT');
    });
  });

  describe('TC-02-INT-03: Create from a draft or archived template is rejected', () => {
    it('refuses an unpublished template and an archived one', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const base = `/api/organizations/${admin.organizationId}/document-templates`;

      const neverPublished = await request(app.getHttpServer())
        .post(base)
        .set('Cookie', admin.cookies)
        .send({ name: 'Never published' })
        .expect(201);

      const first = await post(admin, '', { templateId: neverPublished.body.id }).expect(400);
      expect(first.body.error).toBe('template_not_published');

      const published = await publishTemplate(app, admin, 'To be archived');
      await request(app.getHttpServer())
        .post(`${base}/${published.id}/archive`)
        .set('Cookie', admin.cookies)
        .expect(200);

      const second = await post(admin, '', { templateId: published.id }).expect(400);
      expect(second.body.error).toBe('template_archived');
    });
  });

  describe('TC-02-INT-04: Send happy path', () => {
    it('freezes the document, issues one token, mails signer 1, and chains two events', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);

      const response = await post(admin, `/${envelope.id}/send`).expect(200);
      expect(response.body.status).toBe('sent');
      expect(response.body.documentHash).toMatch(/^[0-9a-f]{64}$/);
      expect(response.body.notifiedSignerId).toBe(envelope.signers[0].id);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('sent');
      expect(stored.renderedHtml).toContain('Alex Kaminski');
      expect(stored.documentHash).toBe(response.body.documentHash);
      expect(stored.expiresAt).not.toBeNull();

      const tokens = await prisma.signingToken.findMany({
        where: { signer: { envelopeId: envelope.id } },
      });
      expect(tokens).toHaveLength(1);
      expect(tokens[0].envelopeSignerId).toBe(envelope.signers[0].id);

      const invitations = mail.sent.filter((m) => m.type === 'signing_invitation');
      expect(invitations).toHaveLength(1);
      expect(invitations[0].to).toBe('company@acme.com');

      const audit = await get(admin, `/${envelope.id}/audit`).expect(200);
      expect(audit.body.events.map((e: { type: string }) => e.type)).toEqual([
        'created',
        'sent',
        'email_accepted',
      ]);
      expect(audit.body.chain).toEqual({ valid: true, firstInvalidEventId: null });
    });
  });

  describe('TC-02-INT-05: Send rejected for a missing required field', () => {
    it('names the missing keys and changes nothing', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id);
      await fillEnvelope(app, admin, envelope, {
        fieldValues: { full_name: 'Alex Kaminski', contractor_tax_id: '' },
      }).expect(200);

      const response = await post(admin, `/${envelope.id}/send`).expect(400);
      expect(response.body.error).toBe('missing_required_fields');
      expect(response.body.keys).toEqual(['contractor_tax_id']);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(await prisma.signingToken.count()).toBe(0);
      expect(mail.sent).toHaveLength(0);
    });

    it('refuses a send when a signer has no name or email', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id);
      await fillEnvelope(app, admin, envelope, {
        signers: envelope.signers.map((s) => ({ id: s.id, name: '', email: '', order: s.order })),
      }).expect(200);

      const response = await post(admin, `/${envelope.id}/send`).expect(400);
      expect(response.body.error).toBe('incomplete_signers');
    });
  });

  describe('TC-02-INT-06: Send rolls back when the mail transport fails', () => {
    it('leaves nothing partially applied', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);

      mail.failNextSend();
      const response = await post(admin, `/${envelope.id}/send`).expect(502);
      expect(response.body.error).toBe('mail_delivery_failed');

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(stored.renderedHtml).toBeNull();
      expect(stored.documentHash).toBeNull();
      expect(stored.sentAt).toBeNull();
      expect(await prisma.signingToken.count()).toBe(0);
      expect(await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id } })).toBe(0);
    });
  });

  describe('TC-02-INT-07: Double send', () => {
    it('refuses the second sequential send', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);

      await post(admin, `/${envelope.id}/send`).expect(200);
      const second = await post(admin, `/${envelope.id}/send`).expect(409);
      expect(second.body.error).toBe('not_draft');
    });

    it('resolves two concurrent sends to exactly one winner', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);

      // Fired together on purpose: the row lock in `send` is the only thing that decides
      // this, and a sequential pair would not exercise it at all.
      const [a, b] = await Promise.all([
        post(admin, `/${envelope.id}/send`),
        post(admin, `/${envelope.id}/send`),
      ]);

      const statuses = [a.status, b.status].sort();
      expect(statuses).toEqual([200, 409]);
      expect(await prisma.signingToken.count({ where: { signer: { envelopeId: envelope.id } } })).toBe(1);
      expect(mail.sent.filter((m) => m.type === 'signing_invitation')).toHaveLength(1);
    });
  });

  describe('TC-02-INT-15: Void after the first signature', () => {
    it('keeps the signature, kills the token, and shows the withdrawn state', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      const secondToken = invitationTokenFor('alex@example.com');

      const response = await post(admin, `/${envelope.id}/void`, {
        reason: 'Terms renegotiated',
      }).expect(200);
      expect(response.body.status).toBe('voided');
      expect(response.body.invalidatedTokens).toBe(1);

      const detail = await get(admin, `/${envelope.id}`).expect(200);
      expect(detail.body.status).toBe('voided');
      expect(detail.body.signers[0].status).toBe('signed');
      expect(detail.body.signers[0].signedAt).not.toBeNull();
      expect(detail.body.pdfStatus).toBe('not_required');

      const link = await request(app.getHttpServer()).get(`/api/sign/${secondToken}`).expect(409);
      expect(link.body.error).toBe('voided');
      expect(link.body.reason).toBe('Terms renegotiated');

      // Requirement 32 — every signer who had been notified is told.
      expect(mail.sent.filter((m) => m.type === 'envelope_voided').map((m) => m.to).sort()).toEqual([
        'alex@example.com',
        'company@acme.com',
      ]);
    });

    it('refuses a void with no reason', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      const response = await post(admin, `/${envelope.id}/void`, { reason: '  ' }).expect(400);
      expect(response.body.errors.reason).toBe('A reason is required');
    });
  });

  describe('TC-02-INT-16: Void from a terminal status is rejected', () => {
    it('refuses a completed, a declined, and a draft envelope', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);

      const completed = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${completed.id}/send`).expect(200);
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13' },
      }).expect(200);
      await queue.whenIdle();
      mail.clear();

      const declined = await sendableEnvelope(app, admin, template.id, {
        emails: ['company2@acme.com', 'alex2@example.com'],
      });
      await post(admin, `/${declined.id}/send`).expect(200);
      await request(app.getHttpServer())
        .post(`/api/sign/${invitationTokenFor('company2@acme.com')}/decline`)
        .send({ reason: 'No' })
        .expect(200);

      const draft = await sendableEnvelope(app, admin, template.id);

      for (const id of [completed.id, declined.id, draft.id]) {
        const response = await post(admin, `/${id}/void`, { reason: 'Because' }).expect(409);
        expect(response.body.error).toBe('invalid_status');
      }
    });
  });

  describe('TC-02-INT-18: Completion renders, stores, and notifies', () => {
    it('stores a hashed PDF, offers a download, and mails both parties', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      const last = await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13 ACME' },
      }).expect(200);
      expect(last.body.envelopeStatus).toBe('completed');

      await queue.whenIdle();

      const detail = await get(admin, `/${envelope.id}`).expect(200);
      expect(detail.body.status).toBe('completed');
      expect(detail.body.pdfStatus).toBe('ready');
      expect(detail.body.canDownload).toBe(true);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.signedPdfKey).toMatch(
        new RegExp(`^signed/${admin.organizationId}/${envelope.id}/[0-9a-f]{64}\\.pdf$`),
      );
      expect(stored.signedPdfHash).toMatch(/^[0-9a-f]{64}$/);

      const download = await get(admin, `/${envelope.id}/document`).expect(200);
      expect(download.body.url).toContain('/api/local-files');
      expect(download.body.sha256).toBe(stored.signedPdfHash);

      expect(
        mail.sent.filter((m) => m.type === 'envelope_completed').map((m) => m.to).sort(),
      ).toEqual(['alex@example.com', 'company@acme.com']);

      const audit = await get(admin, `/${envelope.id}/audit`).expect(200);
      const types = audit.body.events.map((e: { type: string }) => e.type);
      expect(types.filter((t: string) => t === 'signed')).toHaveLength(2);
      expect(types).toContain('completed');
      expect(types).toContain('downloaded');
      expect(audit.body.chain.valid).toBe(true);
    });
  });

  describe('TC-02-INT-19: Completion survives a render failure', () => {
    it('stays completed with pdfStatus failed, then recovers on retry', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      pdf.fail = true;
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13' },
      }).expect(200);
      await queue.whenIdle();

      const failed = await get(admin, `/${envelope.id}`).expect(200);
      expect(failed.body.status).toBe('completed');
      expect(failed.body.pdfStatus).toBe('failed');
      expect(
        await prisma.envelopeSigner.count({ where: { envelopeId: envelope.id, status: 'signed' } }),
      ).toBe(2);

      const audit = await get(admin, `/${envelope.id}/audit`).expect(200);
      expect(audit.body.events.map((e: { type: string }) => e.type)).toContain('pdf_failed');
      expect(audit.body.chain.valid).toBe(true);

      const download = await get(admin, `/${envelope.id}/document`).expect(409);
      expect(download.body.error).toBe('pdf_failed');

      pdf.fail = false;
      await post(admin, `/${envelope.id}/pdf/retry`).expect(200);
      await queue.whenIdle();

      const repaired = await get(admin, `/${envelope.id}`).expect(200);
      expect(repaired.body.status).toBe('completed');
      expect(repaired.body.pdfStatus).toBe('ready');
      await get(admin, `/${envelope.id}/document`).expect(200);
    });
  });

  describe('TC-02-INT-20: Signed PDF is write-once', () => {
    it('ignores a redelivered render job', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13' },
      }).expect(200);
      await queue.whenIdle();

      const before = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      const rendersBefore = pdf.rendered.length;
      const completedEventsBefore = await prisma.envelopeEvent.count({
        where: { envelopeId: envelope.id, type: 'completed' },
      });

      // Exactly what an SQS redelivery does: the same job, handed to the same handler.
      await app
        .get(EnvelopeCompletionService)
        .run({ name: 'pdf-render', envelopeId: envelope.id });

      const after = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(after.signedPdfKey).toBe(before.signedPdfKey);
      expect(after.signedPdfHash).toBe(before.signedPdfHash);
      expect(pdf.rendered.length).toBe(rendersBefore);
      expect(
        await prisma.envelopeEvent.count({ where: { envelopeId: envelope.id, type: 'completed' } }),
      ).toBe(completedEventsBefore);
    });
  });

  describe('TC-02-INT-22: Audit chain verification', () => {
    it('verifies, then names the edited event as the first divergence', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13' },
      }).expect(200);
      await queue.whenIdle();

      const before = await get(admin, `/${envelope.id}/audit/verify`).expect(200);
      expect(before.body).toEqual({ valid: true, firstInvalidEventId: null });

      const events = await prisma.envelopeEvent.findMany({
        where: { envelopeId: envelope.id },
        orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      });
      const target = events[2];
      await prisma.envelopeEvent.update({
        where: { id: target.id },
        data: { ipAddress: '10.0.0.1', type: 'reminded' },
      });

      const after = await get(admin, `/${envelope.id}/audit/verify`).expect(200);
      expect(after.body.valid).toBe(false);
      expect(after.body.firstInvalidEventId).toBe(target.id);
    });
  });

  describe('TC-02-INT-23: Audit contains no field values', () => {
    it('never records a field value in metadata', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13 SECRETACCOUNT' },
      }).expect(200);
      await queue.whenIdle();
      await get(admin, `/${envelope.id}/document`).expect(200);

      const events = await prisma.envelopeEvent.findMany({ where: { envelopeId: envelope.id } });
      expect(events.length).toBeGreaterThan(4);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      const values = Object.values(stored.fieldValues as Record<string, unknown>)
        .filter((v) => typeof v === 'string' && v.length > 0)
        .map(String);
      expect(values).toContain('191234567');

      const trail = JSON.stringify(events.map((e) => e.metadata));
      for (const value of values) expect(trail).not.toContain(value);
      // And the whole serialized trail, not only the metadata column.
      expect(JSON.stringify(events)).not.toContain('SECRETACCOUNT');
      expect(JSON.stringify(events)).not.toContain('191234567');
    });
  });

  describe('TC-02-INT-26: Resend', () => {
    it('re-issues, rate-limits, and refuses a signer whose turn has not started', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      const oldToken = invitationTokenFor('company@acme.com');
      const [first, second] = envelope.signers;

      const resent = await post(admin, `/${envelope.id}/signers/${first.id}/resend`).expect(200);
      expect(resent.body.sentAt).toBeTruthy();
      expect(mail.sent.filter((m) => m.type === 'signing_invitation')).toHaveLength(2);

      const newToken = invitationTokenFor('company@acme.com');
      expect(newToken).not.toBe(oldToken);

      const stale = await request(app.getHttpServer()).get(`/api/sign/${oldToken}`).expect(404);
      expect(stale.body.error).toBe('invalid_link');
      await request(app.getHttpServer()).get(`/api/sign/${newToken}`).expect(200);

      const again = await post(admin, `/${envelope.id}/signers/${first.id}/resend`).expect(429);
      expect(again.body.error).toBe('rate_limited');
      expect(again.body.retryAfterSeconds).toBeGreaterThan(0);

      const wrongTurn = await post(admin, `/${envelope.id}/signers/${second.id}/resend`).expect(409);
      expect(wrongTurn.body.error).toBe('not_current_signer');
    });
  });

  describe('TC-02-INT-27: Capability and organization scoping', () => {
    it('refuses every user and viewer call, and 404s a cross-organization read', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      // The role is demoted on the caller's own membership, which is the same fixture
      // spec 01's suite uses: no invite flow exists yet, and the session's organization
      // is unchanged, so this isolates the capability check from org scoping.
      for (const role of ['user', 'viewer', 'member']) {
        await setRole(prisma, admin.email, role);
        await get(admin, '').expect(403);
        await get(admin, `/${envelope.id}`).expect(403);
        await post(admin, '', { templateId: template.id }).expect(403);
        await post(admin, `/${envelope.id}/send`).expect(403);
        await post(admin, `/${envelope.id}/void`, { reason: 'no' }).expect(403);
        await get(admin, `/${envelope.id}/document`).expect(403);
        await get(admin, `/${envelope.id}/audit`).expect(403);
      }
      await setRole(prisma, admin.email, 'admin');

      const stranger = await signup(app, 'boss@other.com', 'Other Inc');
      await request(app.getHttpServer())
        .get(`/api/organizations/${stranger.organizationId}/envelopes/${envelope.id}`)
        .set('Cookie', stranger.cookies)
        .expect(404);
    });

    it('lets a manager create, send, and void', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      await setRole(prisma, admin.email, 'manager');

      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);
      await post(admin, `/${envelope.id}/void`, { reason: 'Changed my mind' }).expect(200);
    });
  });

  describe('TC-02-INT-29: Deleting a draft; deleting a sent envelope', () => {
    it('deletes a draft and refuses a sent one', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);

      const draft = await sendableEnvelope(app, admin, template.id);
      await request(app.getHttpServer())
        .delete(envelopesApi(admin, `/${draft.id}`))
        .set('Cookie', admin.cookies)
        .expect(204);
      expect(await prisma.envelope.findUnique({ where: { id: draft.id } })).toBeNull();

      const sent = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${sent.id}/send`).expect(200);
      const refused = await request(app.getHttpServer())
        .delete(envelopesApi(admin, `/${sent.id}`))
        .set('Cookie', admin.cookies)
        .expect(409);
      expect(refused.body.error).toBe('not_draft');
      expect(await prisma.envelope.findUnique({ where: { id: sent.id } })).not.toBeNull();
    });

    it('refuses to edit an envelope that has been sent', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);

      const response = await fillEnvelope(app, admin, envelope).expect(409);
      expect(response.body.error).toBe('not_draft');
      expect(response.body.message).toBe(
        'This document has already been sent and cannot be edited',
      );
    });
  });

  /**
   * The fields and routes the envelope screens read that the spec's sample payloads do
   * not spell out. Each is required by a numbered requirement or a flow step; they are
   * covered here so the client is never the first thing to discover one is missing.
   */
  describe('Contract surface the screens depend on', () => {
    it('previews a draft with its real values, and serves the frozen copy once sent', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);

      const draftPreview = await post(admin, `/${envelope.id}/preview`).expect(200);
      expect(draftPreview.body.html).toContain('AGREEMENT with Alex Kaminski');
      expect(draftPreview.body.html).toContain('191234567');
      // The preview is inert wherever it is opened, not only inside the app's iframe.
      expect(draftPreview.body.html).toContain("default-src 'none'");

      await post(admin, `/${envelope.id}/send`).expect(200);
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      const sentPreview = await post(admin, `/${envelope.id}/preview`).expect(200);
      expect(sentPreview.body.html).toBe(stored.renderedHtml);
    });

    it('carries the draft expiry, the subject, and every field constraint on the detail', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const membership = await prisma.membership.findFirstOrThrow({
        where: { organizationId: admin.organizationId },
      });
      const envelope = await createEnvelope(app, admin, template.id, {
        expiresInDays: 14,
        subjectMembershipId: membership.id,
      });

      const detail = await get(admin, `/${envelope.id}`).expect(200);
      expect(detail.body.expiresInDays).toBe(14);
      expect(detail.body.expiresAt).toBeNull();
      expect(detail.body.subjectMembershipId).toBe(membership.id);

      const taxId = detail.body.fields.find((f: { key: string }) => f.key === 'contractor_tax_id');
      expect(taxId.maxLength).toBe(20);
      expect(taxId.options).toBeNull();
      expect(taxId.filledBy).toBe('sender');
    });

    it('exposes the decline and void details a read-only header renders', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);

      const voided = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${voided.id}/send`).expect(200);
      await post(admin, `/${voided.id}/void`, { reason: 'Terms renegotiated' }).expect(200);
      const voidedDetail = await get(admin, `/${voided.id}`).expect(200);
      expect(voidedDetail.body.voidReason).toBe('Terms renegotiated');
      expect(voidedDetail.body.voidedAt).not.toBeNull();

      const declined = await sendableEnvelope(app, admin, template.id, {
        emails: ['c2@acme.com', 'a2@example.com'],
      });
      await post(admin, `/${declined.id}/send`).expect(200);
      await request(app.getHttpServer())
        .post(`/api/sign/${invitationTokenFor('c2@acme.com')}/decline`)
        .send({ reason: 'Not acceptable' })
        .expect(200);
      const declinedDetail = await get(admin, `/${declined.id}`).expect(200);
      expect(declinedDetail.body.signers[0].declineReason).toBe('Not acceptable');
      expect(declinedDetail.body.signers[0].declinedAt).not.toBeNull();
    });

    it('refuses a retry that would re-render a document already produced', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await sendableEnvelope(app, admin, template.id);
      await post(admin, `/${envelope.id}/send`).expect(200);
      await signAs(invitationTokenFor('company@acme.com')).expect(200);
      await signAs(invitationTokenFor('alex@example.com'), {
        fieldValues: { contractor_bank: 'IBAN BY13' },
      }).expect(200);
      await queue.whenIdle();

      const before = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      const rendersBefore = pdf.rendered.length;

      const retry = await post(admin, `/${envelope.id}/pdf/retry`).expect(200);
      await queue.whenIdle();

      expect(retry.body.pdfStatus).toBe('ready');
      const after = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(after.signedPdfKey).toBe(before.signedPdfKey);
      expect(pdf.rendered.length).toBe(rendersBefore);
    });
  });

  describe('Validation of the fill form', () => {
    it('rejects an unknown field key, an over-long value, and a bad expiry', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id);

      const unknown = await fillEnvelope(app, admin, envelope, {
        fieldValues: { nope: 'x' },
      }).expect(400);
      expect(unknown.body.error).toBe('unknown_field');
      expect(unknown.body.keys).toEqual(['nope']);

      const tooLong = await fillEnvelope(app, admin, envelope, {
        fieldValues: { contractor_tax_id: 'x'.repeat(21) },
      }).expect(400);
      expect(tooLong.body.errors['fieldValues.contractor_tax_id']).toBe(
        'УНП must be at most 20 characters',
      );

      const badExpiry = await request(app.getHttpServer())
        .post(envelopesApi(admin))
        .set('Cookie', admin.cookies)
        .send({ templateId: template.id, expiresInDays: 400 })
        .expect(400);
      expect(badExpiry.body.errors.expiresInDays).toBe('Expiry must be between 1 and 365 days');

      const badEmail = await fillEnvelope(app, admin, envelope, {
        emails: ['ok@acme.com', 'not-an-email'],
      }).expect(400);
      expect(badEmail.body.errors['signers[1].email']).toBe('Enter a valid email address');
    });

    it('honours a configured expiry window at send', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id, { expiresInDays: 7 });
      await fillEnvelope(app, admin, envelope).expect(200);

      const response = await post(admin, `/${envelope.id}/send`).expect(200);
      const days =
        (Date.parse(response.body.expiresAt) - Date.parse(response.body.sentAt)) /
        (24 * 60 * 60 * 1000);
      expect(Math.round(days)).toBe(7);
    });
  });
});

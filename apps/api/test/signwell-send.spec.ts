import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ENVELOPE_MESSAGES, SIGNING_PROVIDER_MESSAGES } from '@devscribed/validation';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import request from 'supertest';
import { EnvelopeEventType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PdfRenderer } from '../src/pdf/pdf-renderer';
import { PrismaService } from '../src/prisma.service';
import { JobQueue } from '../src/queue/job-queue';
import { ORPHANED_SESSION } from '../src/documents/envelopes.service';
import { ProviderUnavailableError } from '../src/signature/signing-provider';
import {
  CREATE_POLL_ATTEMPTS,
  SignWellSigningProvider,
} from '../src/signature/signwell/signwell-signing-provider';
import {
  ProviderRejectedRequestError,
  SignWellHttpClient,
} from '../src/signature/signwell/signwell-http-client';
import type { SignWellDocument } from '../src/signature/signwell/signwell-types';
import {
  Signed,
  createEnvelope,
  envelopesApi,
  fillEnvelope,
  publishTemplate,
  sendableEnvelope,
  signup,
} from './envelope-fixtures';
import {
  TestSignWellClient,
  materializedFor,
  signWellDocument,
  useSignWell,
} from './signwell-fixtures';

/**
 * specs/documents/04-signature-providers.md — the SignWell send path.
 *
 * Requirements 26 and 38 in particular: creation is not idempotent and it is not
 * synchronous, so the send has to survive a create that failed without a response and has
 * to verify that the text tags actually became fields before it lets the envelope leave
 * `draft`. Every case stubs `SignWellHttpClient` and nothing else, so the adapter, the
 * translation and the send transaction under test are all the real ones.
 */

class StubPdfRenderer extends PdfRenderer {
  readonly rendered: string[] = [];

  async render(html: string): Promise<Buffer> {
    this.rendered.push(html);
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('SignWell send', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let signwell: TestSignWellClient;
  let pdf: StubPdfRenderer;

  const send = (who: Signed, id: string) =>
    request(app.getHttpServer())
      .post(envelopesApi(who, `/${id}/send`))
      .set('Cookie', who.cookies);

  const eventsOf = (envelopeId: string, type: EnvelopeEventType) =>
    prisma.envelopeEvent.count({ where: { envelopeId, type } });

  /** An organization on SignWell with a published template, ready to send. */
  const onSignWell = async () => {
    const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
    await useSignWell(app, admin.organizationId);
    const template = await publishTemplate(app, admin);
    const envelope = await sendableEnvelope(app, admin, template.id);
    return { admin, template, envelope };
  };

  beforeAll(async () => {
    signwell = new TestSignWellClient();
    pdf = new StubPdfRenderer();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .overrideProvider(PdfRenderer)
      .useValue(pdf)
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
    pdf.rendered.length = 0;
  });

  describe('TC-04-INT-01: Send creates a SignWell document and pins its reference', () => {
    it('sends the documented body, pins every reference, and mails our own invitation', async () => {
      const { admin, envelope } = await onSignWell();

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const [body] = signwell.createBodies;
      expect(body.test_mode).toBe(true);
      expect(body.embedded_signing).toBe(true);
      expect(body.apply_signing_order).toBe(true);
      expect(body.reminders).toBe(false);
      expect(body.metadata.envelope_id).toBe(envelope.id);
      expect(body.metadata.organization_id).toBe(admin.organizationId);

      const stored = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: { orderBy: { order: 'asc' } } },
      });
      expect(stored.status).toBe('sent');
      expect(stored.providerKey).toBe('signwell');
      expect(stored.providerRef).toBe('sw-1');
      expect(stored.providerTestMode).toBe(true);
      expect(stored.signers.map((signer) => signer.providerRef)).toEqual(['1', '2']);

      expect(await eventsOf(envelope.id, 'sent')).toBe(1);

      // Requirement 15 — our own SES invitation to our own page, never a provider link.
      const invitation = mail.lastFor('company@acme.com', 'signing_invitation');
      expect(invitation).toBeDefined();
      expect(invitation!.signingUrl).toContain('/sign/');
      expect(invitation!.signingUrl).not.toContain('signwell.com');
      expect(mail.lastFor('alex@example.com', 'signing_invitation')).toBeUndefined();
    });

    /**
     * Validation rule 6 — the same variable, at the other end of its life. `test_mode`
     * above is only true because `SIGNWELL_TEST_MODE` parsed; a value that does not parse
     * has to stop the container coming up, not wait to reach a sender as a 503 with the
     * provider blamed for a deployment error.
     *
     * The adapter is a provider of the global `CoreModule`, so "Nest cannot construct it"
     * and "the API does not start" are one statement. This builds the same fragment of the
     * container's graph — the adapter and its two collaborators — and asserts the
     * instantiation fails, which is the mechanism, rather than calling the parser directly,
     * which would pass whether or not anything wired it to boot.
     */
    it('refuses to start when SIGNWELL_TEST_MODE is malformed, rather than defaulting', async () => {
      const configured = process.env.SIGNWELL_TEST_MODE;
      const boot = () =>
        Test.createTestingModule({
          providers: [
            SignWellSigningProvider,
            { provide: SignWellHttpClient, useValue: signwell },
            { provide: PdfRenderer, useValue: pdf },
          ],
        }).compile();

      try {
        process.env.SIGNWELL_TEST_MODE = 'yes';
        await expect(boot()).rejects.toThrow(/SIGNWELL_TEST_MODE must be a boolean/);

        // A parse, not a blanket refusal: a deliberate `false` still boots, and so does an
        // absent variable — which is `true`, the safe direction, and what both environments
        // ship.
        process.env.SIGNWELL_TEST_MODE = 'false';
        await expect(boot()).resolves.toBeDefined();
        delete process.env.SIGNWELL_TEST_MODE;
        await expect(boot()).resolves.toBeDefined();
      } finally {
        if (configured === undefined) delete process.env.SIGNWELL_TEST_MODE;
        else process.env.SIGNWELL_TEST_MODE = configured;
      }
    });
  });

  describe('TC-04-INT-02: A provider failure at send leaves the envelope in draft', () => {
    it('answers 503 and applies nothing', async () => {
      const { admin, envelope } = await onSignWell();
      signwell.onCreate = async () => {
        throw new ProviderUnavailableError('provider_unavailable', 'status_500');
      };
      signwell.onList = async (page) => ({
        documents: [],
        current_page: page,
        next_page: null,
        total_pages: 1,
        total_count: 0,
      });

      const refused = await send(admin, envelope.id).expect(503);
      expect(refused.body.message).toBe(SIGNING_PROVIDER_MESSAGES.send.providerUnavailable);
      expect(refused.body.error).toBe('provider_unavailable');

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(stored.renderedHtml).toBeNull();
      expect(stored.documentHash).toBeNull();
      expect(stored.providerRef).toBe('');
      expect(await eventsOf(envelope.id, 'sent')).toBe(0);
    });
  });

  describe('TC-04-INT-03: A create that failed without a response adopts the existing document', () => {
    it('adopts the orphan instead of creating a second document', async () => {
      const { admin, envelope } = await onSignWell();

      let orphan: SignWellDocument | null = null;
      signwell.onCreate = async (body) => {
        // A create that reached them and whose response we never saw.
        orphan = signWellDocument('sw-orphan', body, {
          status: 'Sent',
          fields: materializedFor(body),
        });
        signwell.documents.set('sw-orphan', orphan);
        throw new ProviderUnavailableError('provider_unavailable', 'timeout');
      };
      signwell.onList = async (page) => ({
        documents: orphan ? [orphan] : [],
        current_page: page,
        next_page: null,
        total_pages: 1,
        total_count: orphan ? 1 : 0,
      });

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      expect(signwell.countOf('createDocument')).toBe(1);
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.providerRef).toBe('sw-orphan');
      expect(stored.status).toBe('sent');
      expect(await eventsOf(envelope.id, 'sent')).toBe(1);
    });

    /**
     * Edge case 4, first half. `createSession` runs outside the transaction (invariant
     * 11), so a rollback after it — here the transport rejecting our invitation — leaves
     * a document open on their side carrying the real counterparties and a live
     * `embedded_signing_url` each. It is deleted rather than left behind: nothing in our
     * rows refers to it any more, and the next send must not find a second one.
     */
    it('deletes the document the rolled-back send created, and creates one on the retry', async () => {
      const { admin, envelope } = await onSignWell();

      mail.failNextSend();
      const failed = await send(admin, envelope.id).expect(502);
      expect(failed.body.error).toBe('mail_delivery_failed');

      expect(signwell.calls).toContain('deleteDocument');
      expect(signwell.documents.size).toBe(0);

      const rolledBack = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(rolledBack.status).toBe('draft');
      expect(rolledBack.providerRef).toBe('');
      // The document is gone, so there is nothing for the next send to adopt and no
      // marker asking it to look.
      expect(rolledBack.providerError).toBeNull();

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const sent = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(sent.status).toBe('sent');
      expect(sent.providerRef).toBe('sw-2');
      expect(signwell.countOf('createDocument')).toBe(2);
      // Exactly one document exists for this envelope: the one it is pinned to.
      expect([...signwell.documents.keys()]).toEqual(['sw-2']);
    });

    /**
     * Edge case 4, second half — the compensation itself fails, which is the only way an
     * orphan survives. The leftover is recorded on the still-`draft` envelope and the
     * next send adopts it by `metadata.envelope_id` (requirement 26) instead of opening a
     * second contract that nothing of ours could ever reach again.
     */
    it('adopts the orphan a failed cleanup left behind rather than creating a second document', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onDelete = async () => {
        throw new ProviderUnavailableError('provider_unavailable', 'status_500');
      };
      mail.failNextSend();
      await send(admin, envelope.id).expect(502);

      const orphaned = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(orphaned.status).toBe('draft');
      expect(orphaned.providerRef).toBe('');
      expect(orphaned.providerError).toBe(ORPHANED_SESSION);
      // Their side still holds it, which is exactly the situation the marker records.
      expect([...signwell.documents.keys()]).toEqual(['sw-1']);

      signwell.onDelete = undefined;
      // Their list ignores filters, so it answers with everything and the match is ours.
      signwell.onList = async (page) => ({
        documents: [...signwell.documents.values()],
        current_page: page,
        next_page: null,
        total_pages: 1,
        total_count: signwell.documents.size,
      });

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      // The second send created nothing: it found its own leftover and adopted it.
      expect(signwell.countOf('createDocument')).toBe(1);
      const sent = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(sent.status).toBe('sent');
      expect(sent.providerRef).toBe('sw-1');
      expect(sent.providerError).toBeNull();
      expect(await eventsOf(envelope.id, 'sent')).toBe(1);
    });

    /**
     * The compensation's own hazard, and the reason it is not an unconditional delete.
     * Both sends of an envelope that already carries the marker adopt the *same* leftover,
     * so the loser must not remove the document the winner has just pinned — an envelope
     * `sent` on a document that no longer exists is worse than the orphan this all began
     * with.
     */
    it('does not delete the adopted document when a concurrent send loses the race', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onDelete = async () => {
        throw new ProviderUnavailableError('provider_unavailable', 'status_500');
      };
      mail.failNextSend();
      await send(admin, envelope.id).expect(502);
      expect(
        (await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } })).providerError,
      ).toBe(ORPHANED_SESSION);

      signwell.onDelete = undefined;
      signwell.onList = async (page) => ({
        documents: [...signwell.documents.values()],
        current_page: page,
        next_page: null,
        total_pages: 1,
        total_count: signwell.documents.size,
      });

      const [first, second] = await Promise.all([
        send(admin, envelope.id),
        send(admin, envelope.id),
      ]);
      await queue.whenIdle();
      expect([first.status, second.status].sort()).toEqual([200, 409]);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('sent');
      expect(stored.providerRef).toBe('sw-1');
      // Both adopted it; neither created a second one; and it is still there.
      expect(signwell.countOf('createDocument')).toBe(1);
      expect(signwell.documents.has('sw-1')).toBe(true);
    });

    /**
     * The double-click. Two sends pass the draft check before either reaches the row lock,
     * so both open a session; the loser throws `not_draft` inside the transaction and
     * deletes the document it opened. Exactly one survives, and it is the pinned one.
     */
    it('leaves exactly one document behind when two concurrent sends race', async () => {
      const { admin, envelope } = await onSignWell();

      const [first, second] = await Promise.all([
        send(admin, envelope.id),
        send(admin, envelope.id),
      ]);
      await queue.whenIdle();

      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([200, 409]);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('sent');
      expect([...signwell.documents.keys()]).toEqual([stored.providerRef]);
    });
  });

  describe('TC-04-INT-03a: The send verifies that text tags materialized', () => {
    it('polls past the Created response rather than trusting the 201', async () => {
      const { admin, envelope } = await onSignWell();

      let created: SignWellDocument | null = null;
      signwell.onCreate = async (body) => {
        created = signWellDocument('sw-parse', body, { status: 'Created', fields: [] });
        signwell.documents.set('sw-parse', signWellDocument('sw-parse', body, {
          status: 'Sent',
          fields: materializedFor(body),
        }));
        return created;
      };
      signwell.onGet = async (id, attempt) =>
        attempt === 1
          ? signWellDocument('sw-parse', signwell.createBodies[0], {
              status: 'Created',
              fields: [],
            })
          : (signwell.documents.get(id) ?? null);

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      // It read at least twice: once seeing `Created`, once seeing the parsed document.
      expect(signwell.countOf('getDocument')).toBeGreaterThanOrEqual(2);

      const stored = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: true },
      });
      expect(stored.status).toBe('sent');
      // No signer is left without a signature field: the adapter refuses the send when one
      // is missing, so reaching `sent` is the assertion.
      expect(stored.signers.every((signer) => signer.providerRef !== '')).toBe(true);
    });
  });

  describe('TC-04-INT-03b: A tag that failed to parse aborts and deletes', () => {
    it('deletes the document, keeps the envelope in draft, and names the missing recipient', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onCreate = async (body) => {
        const document = signWellDocument('sw-halfparsed', body, {
          status: 'Sent',
          // One signature for a two-signer document, and the contractor's text field.
          fields: [
            { type: 'signature', recipientId: '1', required: true },
            { type: 'text', recipientId: '2', required: true },
          ],
        });
        signwell.documents.set('sw-halfparsed', document);
        return document;
      };

      const refused = await send(admin, envelope.id).expect(502);
      expect(refused.body.error).toBe('document_fields_not_materialized');
      expect(refused.body.expected.join(' ')).toContain('Alex Kaminski (signer 2)');

      expect(signwell.calls).toContain('deleteDocument');
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(stored.providerRef).toBe('');
      expect(await eventsOf(envelope.id, 'sent')).toBe(0);
    });
  });

  describe('TC-04-INT-03c: A document stuck in Created is not sent', () => {
    it('stops at the polling bound, deletes, and leaves the envelope in draft', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onCreate = async (body) =>
        signWellDocument('sw-stuck', body, { status: 'Created', fields: [] });
      signwell.onGet = async (id) =>
        signWellDocument(id, signwell.createBodies[0], { status: 'Created', fields: [] });

      await send(admin, envelope.id).expect(502);

      // The bound, not a loop.
      expect(signwell.countOf('getDocument')).toBe(CREATE_POLL_ATTEMPTS);
      expect(signwell.calls).toContain('deleteDocument');
      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
    });
  });

  describe('TC-04-INT-03d: Orphan recovery matches metadata in our own code', () => {
    it('adopts only the row carrying our envelope id', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onCreate = async (body) => {
        const ours = signWellDocument('sw-ours', body, {
          status: 'Sent',
          fields: materializedFor(body),
        });
        signwell.documents.set('sw-ours', ours);
        // Two pages, and the filter is ignored — exactly what their list endpoint does.
        signwell.onList = async (page) =>
          page === 1
            ? {
                documents: [
                  { ...ours, id: 'sw-someone-else', metadata: { envelope_id: 'not-ours' } },
                  { ...ours, id: 'sw-no-metadata', metadata: {} },
                ],
                current_page: 1,
                next_page: 2,
                total_pages: 2,
                total_count: 3,
              }
            : {
                documents: [ours],
                current_page: 2,
                next_page: null,
                total_pages: 2,
                total_count: 3,
              };
        throw new ProviderUnavailableError('provider_unavailable', 'timeout');
      };

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.providerRef).toBe('sw-ours');
    });

    it('adopts nothing at all when no row carries our envelope id', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onCreate = async (body) => {
        const stranger = signWellDocument('sw-stranger', body, {
          status: 'Sent',
          fields: materializedFor(body),
        });
        signwell.onList = async (page) => ({
          documents: [{ ...stranger, metadata: { envelope_id: 'someone-elses-envelope' } }],
          current_page: page,
          next_page: null,
          total_pages: 1,
          total_count: 1,
        });
        throw new ProviderUnavailableError('provider_unavailable', 'timeout');
      };

      const refused = await send(admin, envelope.id).expect(503);
      expect(refused.body.error).toBe('provider_unavailable');

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(stored.providerRef).toBe('');
    });
  });

  describe('TC-04-INT-22: A provider call never runs inside a transaction', () => {
    it('does not block a concurrent reader and holds no transaction open', async () => {
      const { admin, envelope } = await onSignWell();

      let releaseCreate: () => void = () => {};
      const blocked = new Promise<void>((resolve) => {
        releaseCreate = resolve;
      });
      let entered: () => void = () => {};
      const inside = new Promise<void>((resolve) => {
        entered = resolve;
      });

      const defaultCreate = signwell.onCreate;
      signwell.onCreate = async (body) => {
        entered();
        await blocked;
        signwell.onCreate = defaultCreate;
        const document = signWellDocument('sw-slow', body, {
          status: 'Sent',
          fields: materializedFor(body),
        });
        signwell.documents.set('sw-slow', document);
        return document;
      };

      const sending = send(admin, envelope.id);
      const settled = sending.then((response) => response);
      await inside;

      // The reader runs while the provider call is outstanding.
      const startedAt = Date.now();
      const read = await request(app.getHttpServer())
        .get(envelopesApi(admin, `/${envelope.id}`))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(read.body.status).toBe('draft');
      expect(Date.now() - startedAt).toBeLessThan(2_000);

      // Invariant 11 — no transaction is open for the duration of the call.
      const idle = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
        "SELECT count(*)::bigint AS count FROM pg_stat_activity WHERE datname = current_database() AND state = 'idle in transaction'",
      );
      expect(Number(idle[0].count)).toBe(0);

      releaseCreate();
      expect((await settled).status).toBe(200);
      await queue.whenIdle();
      expect(
        (await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } })).status,
      ).toBe('sent');
    });
  });

  /**
   * BUG-002, the regression test. The address was accepted by every screen, stored, and
   * then refused by SignWell at the send — where the sender was told the provider was
   * unavailable. The rule is spec 01's shared one, tightened in `packages/validation`, so
   * the refusal now happens on the field the sender typed it into.
   */
  describe('TC-04-INT-23: A signer address the provider will not accept is refused at entry', () => {
    it('answers 400 on the address field, stores nothing, and never calls the provider', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      await useSignWell(app, admin.organizationId);
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id);

      const refused = await fillEnvelope(app, admin, envelope, {
        emails: ['company@acme.com', 'фывфывфыв@gmail.com'],
      }).expect(400);
      expect(refused.body.errors['signers[1].email']).toBe(
        ENVELOPE_MESSAGES.signer.emailInvalid,
      );

      // The whole point of moving the refusal: nothing was sent anywhere.
      expect(signwell.calls).toEqual([]);

      const stored = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: { orderBy: { order: 'asc' } } },
      });
      expect(stored.status).toBe('draft');
      expect(stored.providerRef).toBe('');
      // Not even the valid first address: the save is refused whole.
      expect(stored.signers.map((signer) => signer.email)).toEqual(['', '']);
    });

    it('still accepts the addresses people actually have', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      await useSignWell(app, admin.organizationId);
      const template = await publishTemplate(app, admin);
      const envelope = await createEnvelope(app, admin, template.id);

      await fillEnvelope(app, admin, envelope, {
        emails: ['ivan.demchenko.dev@gmail.com', 'alex+contracts@example.co.uk'],
      }).expect(200);

      const stored = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: { orderBy: { order: 'asc' } } },
      });
      expect(stored.signers.map((signer) => signer.email)).toEqual([
        'ivan.demchenko.dev@gmail.com',
        'alex+contracts@example.co.uk',
      ]);
    });
  });

  /**
   * BUG-002, the second half, at the send path — the half that produced the misleading
   * log line. A `4xx` means the create was refused and nothing was created, so there is
   * no orphan and the scan that looks for one is twenty reads spent on nothing.
   *
   * The mapping itself — which status becomes which error, and the field path extracted
   * from the body — is asserted against the real client in `signwell-client.spec.ts`
   * under the same case number; this half needs the real adapter, which that one does not
   * have.
   */
  describe('TC-04-INT-24: A permanent refusal is not an outage, and scans for no orphan', () => {
    it('leaves the envelope in draft without listing a single document', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onCreate = async () => {
        throw new ProviderRejectedRequestError(422, 'files.file_1.file_data', 'status_422');
      };

      const refused = await send(admin, envelope.id);
      // The status and the sentence a refused send shows are spec 04's open row — the
      // Error Messages table has no entry for a permanent refusal yet. What this case
      // fixes is what happens underneath: the refusal is not treated as an outage.
      expect(refused.status).toBeGreaterThanOrEqual(400);

      // Requirement 26 exists for a create that may have landed. This one did not.
      expect(signwell.countOf('listDocuments')).toBe(0);
      expect(signwell.countOf('createDocument')).toBe(1);

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(stored.renderedHtml).toBeNull();
      expect(stored.providerRef).toBe('');
      expect(await eventsOf(envelope.id, 'sent')).toBe(0);
    });

    /** The contrast, unchanged: a real outage still scans, because it may have landed. */
    it('still scans after an outage, which is the case the scan is for', async () => {
      const { admin, envelope } = await onSignWell();

      signwell.onCreate = async () => {
        throw new ProviderUnavailableError('provider_unavailable', 'timeout');
      };

      await send(admin, envelope.id).expect(503);
      expect(signwell.countOf('listDocuments')).toBeGreaterThan(0);
    });
  });
});

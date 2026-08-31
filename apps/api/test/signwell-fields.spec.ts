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
import { executionPageRowBox } from '../src/documents/signwell-text-tags';
import { toProviderUnits } from '../src/signature/signwell/signwell-signing-provider';
import { SignWellHttpClient } from '../src/signature/signwell/signwell-http-client';
import { flattenFields } from '../src/signature/signwell/signwell-types';
import type { SignWellCreateDocumentBody } from '../src/signature/signwell/signwell-types';
import {
  Signed,
  envelopesApi,
  publishTemplate,
  sendableEnvelope,
  signup,
} from './envelope-fixtures';
import { TestSignWellClient, signWellDocument, useSignWell } from './signwell-fixtures';

/**
 * specs/documents/04-signature-providers.md — TC-04-INT-25, recorded in BUG-001 as
 * TC-04-INT-21 before that number turned out to be the rate-limiter case.
 *
 * The double here is the point of the case. It behaves the way BUG-001 measured the live
 * API behaving: `POST /documents` answers `Created` with `fields: []`, the parse then
 * materializes **only the fields the request supplied**, and a document that supplied none
 * settles in `Draft` and is never sent. Against the code this replaces — `text_tags: true`
 * and no `fields` — every case below fails exactly as production failed, with ten polls and
 * `did not materialize the expected fields`.
 */

/**
 * The grid's box for a row that must exist, in **points** — the renderer's units and the
 * ones written onto the row itself. A `null` here would be the case's own bug.
 */
function row(index: number) {
  const box = executionPageRowBox(index);
  if (!box) throw new Error(`The execution page has no row ${index}`);
  return box;
}

/** The same box as it leaves for the provider: CSS pixels at 96 dpi (BUG-004). */
function onTheWire(index: number) {
  const box = row(index);
  return {
    x: toProviderUnits(box.x),
    y: toProviderUnits(box.y),
    width: toProviderUnits(box.width),
    height: toProviderUnits(box.height),
  };
}

class StubPdfRenderer extends PdfRenderer {
  readonly rendered: string[] = [];

  async render(html: string): Promise<Buffer> {
    this.rendered.push(html);
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

describe('SignWell field placement', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;
  let queue: JobQueue;
  let signwell: TestSignWellClient;
  let pdf: StubPdfRenderer;
  let sequence = 0;

  const send = (who: Signed, id: string) =>
    request(app.getHttpServer())
      .post(envelopesApi(who, `/${id}/send`))
      .set('Cookie', who.cookies);

  const onSignWell = async () => {
    const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
    await useSignWell(app, admin.organizationId);
    const template = await publishTemplate(app, admin);
    const envelope = await sendableEnvelope(app, admin, template.id);
    return { admin, envelope };
  };

  /**
   * The live API, as a double. `keep` is what the parse materializes: everything the
   * request supplied, or — for the second case — nothing at all, which is what a rejected
   * or dropped field list looks like from here.
   */
  const behaveLikeSignWell = (keep: 'the requested fields' | 'nothing') => {
    signwell.onCreate = async (body: SignWellCreateDocumentBody) => {
      sequence += 1;
      const id = `sw-live-${sequence}`;

      const supplied = keep === 'nothing' ? [] : flattenFields(body.fields);
      signwell.documents.set(
        id,
        signWellDocument(id, body, {
          // A document with no fields is never sent. That is the behaviour the old code
          // hit on every attempt, and the reason no envelope ever left `draft`.
          status: supplied.length > 0 ? 'Sent' : 'Draft',
          fields: supplied.map((field) => ({
            type: (field.type ?? 'signature') as 'signature' | 'text',
            recipientId: field.recipient_id ?? '',
            required: field.required === true,
            apiId: field.api_id ?? undefined,
          })),
        }),
      );

      // The `201`: created, the file not read yet, no fields on it whatever we sent.
      return signWellDocument(id, body, { status: 'Created', fields: [] });
    };
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
    sequence = 0;
  });

  describe('TC-04-INT-25: The send supplies the fields, against a double that materializes nothing else', () => {
    it('sends text_tags: false and a field list, and the document reaches Sent', async () => {
      const { admin, envelope } = await onSignWell();
      behaveLikeSignWell('the requested fields');

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const [body] = signwell.createBodies;
      expect(body.text_tags).toBe(false);

      // Grouped per file, and there is one file.
      expect(body.fields).toHaveLength(1);
      expect(body.fields[0]).toEqual([
        {
          api_id: 'Signature_1',
          type: 'signature',
          recipient_id: '1',
          required: true,
          page: 1,
          ...onTheWire(0),
        },
        {
          api_id: 'Signature_2',
          type: 'signature',
          recipient_id: '2',
          required: true,
          page: 1,
          ...onTheWire(1),
        },
        // The template's one signer-owned field, on the signer whose role owns it, with
        // the template's own required flag. Its row comes after the signatures.
        {
          api_id: 'Text_1',
          type: 'text',
          recipient_id: '2',
          required: true,
          page: 1,
          ...onTheWire(2),
        },
      ]);

      const stored = await prisma.envelope.findUniqueOrThrow({
        where: { id: envelope.id },
        include: { signers: { orderBy: { order: 'asc' } } },
      });
      expect(stored.status).toBe('sent');
      expect(stored.providerRef).toBe('sw-live-1');
      expect(stored.signers.map((signer) => signer.providerRef)).toEqual(['1', '2']);
      expect(signwell.documents.get('sw-live-1')?.status).toBe('Sent');
    });

    /**
     * The geometry is not recomputed anywhere: the adapter reads the boxes off the very
     * document it is about to render, so a field on the wire and the row a signer sees are
     * the same rectangle by construction rather than by two functions agreeing.
     */
    it('places every field on the execution page the rendered document carries', async () => {
      const { admin, envelope } = await onSignWell();
      behaveLikeSignWell('the requested fields');

      await send(admin, envelope.id).expect(200);
      await queue.whenIdle();

      const sent = pdf.rendered[0];
      // The section was hoisted to the front, and nothing of ours is left unresolved on a
      // document somebody is about to sign.
      expect(sent.indexOf('<div class="signatures execution-page">')).toBeLessThan(
        sent.indexOf('<div class="document-body">'),
      );
      expect(sent).not.toMatch(/\{\{[^{}]*\}\}/);

      // The drawn rectangle and the one on the wire are the same rectangle in two units:
      // the document carries points, the provider is sent pixels (BUG-004). Asserting both
      // ends of the conversion is what keeps "read off the document, never recomputed"
      // true after a unit was introduced between them.
      const wire = signwell.createBodies[0].fields[0];
      expect(wire).toHaveLength(3);
      wire.forEach((field, index) => {
        const box = row(index);
        expect(sent).toContain(
          `data-field-x="${box.x}" data-field-y="${box.y}"` +
            ` data-field-width="${box.width}" data-field-height="${box.height}"`,
        );
        expect({
          x: field.x,
          y: field.y,
          width: field.width,
          height: field.height,
        }).toEqual(onTheWire(index));
      });
    });

    it('refuses the send when the provider materializes none of them', async () => {
      const { admin, envelope } = await onSignWell();
      behaveLikeSignWell('nothing');

      const refused = await send(admin, envelope.id).expect(502);
      expect(refused.body.error).toBe('document_fields_not_materialized');
      // It names the signers, because that is what a person has to act on.
      expect(refused.body.expected.join(' ')).toContain('signer 1');
      expect(refused.body.expected.join(' ')).toContain('signer 2');

      // Deleted rather than left open: a document with no signature line is not one a
      // counterparty should be able to reach.
      expect(signwell.calls).toContain('deleteDocument');

      const stored = await prisma.envelope.findUniqueOrThrow({ where: { id: envelope.id } });
      expect(stored.status).toBe('draft');
      expect(stored.providerRef).toBe('');
      expect(mail.lastFor('company@acme.com', 'signing_invitation')).toBeUndefined();
    });
  });
});

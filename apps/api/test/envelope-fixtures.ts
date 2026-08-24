import { INestApplication } from '@nestjs/common';
import { deflateSync } from 'node:zlib';
import request from 'supertest';
import { PrismaService } from '../src/prisma.service';

/**
 * Shared setup for the two spec-02 suites.
 *
 * It lives outside a `*.spec.ts` so Jest does not treat it as a suite of its own, and it
 * deliberately drives the *public API* rather than seeding rows: an envelope built by
 * `POST` and `PUT` is the envelope the product produces, and a fixture that wrote the
 * columns directly would let a bug in creation hide behind a correct-looking test.
 *
 * The two exceptions are documented at their call sites — roles, because no invite flow
 * exists yet (the same fixture spec 01's suite uses), and the direct mutations the spec's
 * own test cases ask for ("`ExpiresAt` moved into the past directly in the database").
 */

export interface Signed {
  cookies: string[];
  organizationId: string;
  accountId: string;
  email: string;
}

export const SIGNER_ROLES = [
  { key: 'company', label: 'Company', order: 1 },
  { key: 'contractor', label: 'Contractor', order: 2 },
];

/**
 * Two required sender fields and one required signer-owned field — the smallest template
 * that can exercise ownership filtering, the missing-required-field refusal, and the
 * signing form all at once.
 */
export const TEMPLATE_FIELDS = [
  {
    key: 'full_name',
    label: 'Full name',
    type: 'text',
    required: true,
    maxLength: 200,
    filledBy: 'sender',
    autofillSource: null,
    order: 1,
  },
  {
    key: 'contractor_tax_id',
    label: 'УНП',
    type: 'text',
    required: true,
    maxLength: 20,
    filledBy: 'sender',
    autofillSource: null,
    order: 2,
  },
  {
    key: 'contractor_bank',
    label: 'Bank details',
    type: 'multiline',
    required: true,
    maxLength: 2000,
    filledBy: 'signer:contractor',
    autofillSource: null,
    order: 3,
  },
];

export const TEMPLATE_BODY =
  '<p>AGREEMENT with {{full_name}}, УНП {{contractor_tax_id}}.</p>' +
  '<p>Bank details: {{contractor_bank}}</p>';

export async function signup(
  app: INestApplication,
  email: string,
  orgName: string,
): Promise<Signed> {
  const response = await request(app.getHttpServer())
    .post('/api/signup')
    .send({ orgName, firstName: 'Pat', lastName: 'Owner', email, password: 'Passw0rd' })
    .expect(201);

  return {
    cookies: response.headers['set-cookie'] as unknown as string[],
    organizationId: response.body.organization.id,
    accountId: response.body.account?.id ?? '',
    email,
  };
}

/** No invite flow exists yet, so the role is set where the invite would have set it. */
export async function setRole(prisma: PrismaService, email: string, role: string): Promise<void> {
  const account = await prisma.account.findUniqueOrThrow({ where: { email } });
  await prisma.membership.updateMany({ where: { accountId: account.id }, data: { role } });
}

/** Create → save a complete draft → publish, through the spec-01 endpoints. */
export async function publishTemplate(
  app: INestApplication,
  who: Signed,
  name = 'Contractor agreement BY',
  overrides: Record<string, unknown> = {},
): Promise<{ id: string; versionId: string }> {
  const base = `/api/organizations/${who.organizationId}/document-templates`;

  const created = await request(app.getHttpServer())
    .post(base)
    .set('Cookie', who.cookies)
    .send({ name })
    .expect(201);

  await request(app.getHttpServer())
    .put(`${base}/${created.body.id}/draft`)
    .set('Cookie', who.cookies)
    .send({
      rowVersion: 1,
      bodyHtml: TEMPLATE_BODY,
      signerRoles: SIGNER_ROLES,
      fields: TEMPLATE_FIELDS,
      ...overrides,
    })
    .expect(200);

  const published = await request(app.getHttpServer())
    .post(`${base}/${created.body.id}/publish`)
    .set('Cookie', who.cookies)
    .expect(200);

  return { id: created.body.id, versionId: published.body.versionId };
}

export const envelopesApi = (who: Signed, path = '') =>
  `/api/organizations/${who.organizationId}/envelopes${path}`;

export async function createEnvelope(
  app: INestApplication,
  who: Signed,
  templateId: string,
  body: Record<string, unknown> = {},
) {
  const response = await request(app.getHttpServer())
    .post(envelopesApi(who))
    .set('Cookie', who.cookies)
    .send({ templateId, ...body })
    .expect(201);
  return response.body as {
    id: string;
    signers: { id: string; roleKey: string; order: number }[];
  };
}

/** Fills every sender-owned field and both signers, i.e. makes the envelope sendable. */
export function fillEnvelope(
  app: INestApplication,
  who: Signed,
  envelope: { id: string; signers: { id: string; order: number }[] },
  overrides: Record<string, unknown> = {},
) {
  const emails = (overrides.emails as string[]) ?? ['company@acme.com', 'alex@example.com'];
  delete overrides.emails;

  return request(app.getHttpServer())
    .put(envelopesApi(who, `/${envelope.id}`))
    .set('Cookie', who.cookies)
    .send({
      title: 'Contractor agreement — A. Kaminski',
      fieldValues: { full_name: 'Alex Kaminski', contractor_tax_id: '191234567' },
      signers: envelope.signers.map((signer, index) => ({
        id: signer.id,
        name: index === 0 ? 'Ivan Demchenko' : 'Alex Kaminski',
        email: emails[index],
        order: signer.order,
      })),
      ...overrides,
    });
}

/** The whole happy path up to and including `send`. */
export async function sendableEnvelope(
  app: INestApplication,
  who: Signed,
  templateId: string,
  fillOverrides: Record<string, unknown> = {},
) {
  const envelope = await createEnvelope(app, who, templateId);
  await fillEnvelope(app, who, envelope, fillOverrides).expect(200);
  return envelope;
}

/** The raw token out of a signing URL, exactly the way a recipient gets at it. */
export function tokenFromUrl(url: string): string {
  return url.split('/sign/')[1];
}

/* ------------------------------------------------------------------ *
 * PNG construction, for the signature validation cases.
 *
 * Hand-built rather than checked in as base64 blobs so the tests say what they mean:
 * "a canvas with no ink" is `alpha = 0`, and the 600 KB case is a size, not a magic
 * string. `pngHasInk` never verifies chunk CRCs, so the placeholder zeros are enough.
 * ------------------------------------------------------------------ */

export function makePng(width: number, height: number, alpha: number): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const at = row + 1 + x * 4;
      raw[at] = 0x11;
      raw[at + 1] = 0x22;
      raw[at + 2] = 0x33;
      raw[at + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
}

/**
 * A PNG whose *file* size is what the test is about. The 512 KB cap is measured on the
 * decoded PNG bytes, and a uniformly coloured image deflates to almost nothing however
 * many pixels it has — so the payload has to be incompressible for the size to be real.
 */
export function makeNoisyPng(width: number, height: number): Buffer {
  const raw = Buffer.alloc(height * (width * 4 + 1));
  let seed = 0x2545f491;
  for (let y = 0; y < height; y++) {
    const row = y * (width * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < width * 4; x++) {
      // A cheap xorshift: deterministic, so the case is reproducible, and noisy enough
      // that deflate cannot shrink it.
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      raw[row + 1 + x] = seed & 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function pngDataUri(png: Buffer): string {
  return `data:image/png;base64,${png.toString('base64')}`;
}

/** A signature with real ink, the payload most signing cases submit. */
export const DRAWN_SIGNATURE = pngDataUri(makePng(8, 4, 0xff));

export const drawnSignaturePayload = { type: 'drawn', value: DRAWN_SIGNATURE };

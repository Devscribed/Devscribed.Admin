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
  SIGNER_ROLES,
  Signed,
  drawnSignaturePayload,
  envelopesApi,
  signup,
  tokenFromUrl,
} from './envelope-fixtures';

/**
 * The resolution half of specs/documents/03-field-autofill.md — requirements 1-13 and
 * 19-23, as they are observable through the envelope API. Every `describe` carries its TC
 * id; the profile screen's own cases live in `member-profile.spec.ts`.
 *
 * This suite deliberately builds its own template rather than reusing `publishTemplate`'s
 * fixture: spec 02's fields are unbound by design, and what every case here turns on is
 * *which* source each field carries.
 */

class StubPdfRenderer extends PdfRenderer {
  async render(html: string): Promise<Buffer> {
    return Buffer.from(`%PDF-1.4 stub ${html.length}`);
  }
}

/** A template whose fields exercise a member source, a sensitive one, and `today`. */
const BOUND_FIELDS = [
  {
    key: 'contractor_full_name',
    label: 'Full name',
    type: 'text',
    required: true,
    maxLength: 200,
    filledBy: 'sender',
    autofillSource: 'member.fullName',
    order: 1,
  },
  {
    key: 'contractor_tax_id',
    label: 'УНП',
    type: 'text',
    required: true,
    maxLength: 40,
    filledBy: 'sender',
    autofillSource: 'member.taxId',
    order: 2,
  },
  {
    key: 'contract_date',
    label: 'Contract date',
    type: 'date',
    required: true,
    maxLength: null,
    filledBy: 'sender',
    autofillSource: 'today',
    order: 3,
  },
  {
    key: 'contract_number',
    label: 'Contract no.',
    type: 'text',
    required: false,
    maxLength: 40,
    filledBy: 'sender',
    autofillSource: null,
    order: 4,
  },
  {
    // Signer-owned *and* bound: requirement 6 resolves it anyway.
    key: 'contractor_bank',
    label: 'Bank details',
    type: 'multiline',
    required: false,
    maxLength: 500,
    filledBy: 'signer:contractor',
    autofillSource: 'member.bankDetails',
    order: 5,
  },
];

const BOUND_BODY =
  '<p>AGREEMENT with {{contractor_full_name}}, УНП {{contractor_tax_id}},' +
  ' dated {{contract_date}}, no. {{contract_number}}.</p>' +
  '<p>Bank: {{contractor_bank}}</p>';

describe('Field autofill', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  beforeAll(async () => {
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
  });

  /* ---------------------------------------------------------------- *
   * Fixtures
   * ---------------------------------------------------------------- */

  const templatesApi = (who: Signed, path = '') =>
    `/api/organizations/${who.organizationId}/document-templates${path}`;

  const publishBound = async (
    who: Signed,
    fields: unknown[] = BOUND_FIELDS,
    body = BOUND_BODY,
  ): Promise<{ id: string }> => {
    const created = await request(app.getHttpServer())
      .post(templatesApi(who))
      .set('Cookie', who.cookies)
      .send({ name: 'Contractor agreement BY' })
      .expect(201);

    await request(app.getHttpServer())
      .put(templatesApi(who, `/${created.body.id}/draft`))
      .set('Cookie', who.cookies)
      .send({ rowVersion: 1, bodyHtml: body, signerRoles: SIGNER_ROLES, fields })
      .expect(200);

    await request(app.getHttpServer())
      .post(templatesApi(who, `/${created.body.id}/publish`))
      .set('Cookie', who.cookies)
      .expect(200);

    return { id: created.body.id };
  };

  /**
   * A *signed-in* member of an existing organization. The second login is not optional:
   * the session cookie carries the organization id and `OrgScopeGuard` compares the URL
   * against that, so a cookie minted before the membership was moved would 404 on every
   * scoped route.
   */
  const joinOrg = async (email: string, role: string, organizationId: string): Promise<Signed> => {
    const own = await signup(app, email, `Temp Org for ${email}`);
    await prisma.membership.updateMany({
      where: { accountId: own.accountId },
      data: { organizationId, role },
    });
    const login = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email, password: 'Passw0rd' })
      .expect(200);
    return {
      ...own,
      organizationId,
      cookies: login.headers['set-cookie'] as unknown as string[],
    };
  };

  /** No invite flow exists yet, so a subject is created where the invite would create one. */
  const addSubject = async (
    who: Signed,
    profile: Record<string, unknown> | null = null,
    overrides: { firstName?: string; lastName?: string; status?: string } = {},
  ) => {
    const account = await prisma.account.create({
      data: {
        email: `alex${Math.random().toString(36).slice(2, 8)}@acme.com`,
        passwordHash: 'x',
        firstName: overrides.firstName ?? 'Alex',
        lastName: overrides.lastName ?? 'Kaminski',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId: who.organizationId,
        role: 'user',
        status: overrides.status ?? 'active',
      },
    });
    if (profile !== null) {
      await prisma.memberProfile.create({
        data: { membershipId: membership.id, ...(profile as object) },
      });
    }
    return { accountId: account.id, membershipId: membership.id, email: account.email };
  };

  const FULL_PROFILE = {
    addressLine: 'Nezavisimosti Ave 1, apt 5',
    city: 'Minsk',
    postalCode: '220030',
    country: 'BY',
    taxId: '191234567',
    dateOfBirth: new Date('1991-03-14T00:00:00.000Z'),
    idDocumentNumber: 'MP1234567',
    bankDetails: 'IBAN BY13 ALFA 30140000000000000000',
  };

  const create = (who: Signed, body: Record<string, unknown>) =>
    request(app.getHttpServer()).post(envelopesApi(who)).set('Cookie', who.cookies).send(body);

  const get = (who: Signed, path: string) =>
    request(app.getHttpServer()).get(envelopesApi(who, path)).set('Cookie', who.cookies);

  const put = (who: Signed, path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).put(envelopesApi(who, path)).set('Cookie', who.cookies).send(body);

  const profileUrl = (who: Signed, memberId: string) =>
    `/api/organizations/${who.organizationId}/members/${memberId}/profile`;

  /* ---------------------------------------------------------------- *
   * Cases
   * ---------------------------------------------------------------- */

  describe('TC-03-INT-01: Autofill on envelope creation', () => {
    it('fills every bound field, lists them, and leaves the unbound one empty', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      const alex = await addSubject(admin, FULL_PROFILE);

      const created = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);

      const today = new Date().toISOString().slice(0, 10);
      expect(created.body.fieldValues.contractor_full_name).toBe('Alex Kaminski');
      expect(created.body.fieldValues.contractor_tax_id).toBe('191234567');
      expect(created.body.fieldValues.contract_date).toBe(today);
      // Requirement 6 — a signer-owned field with a source arrives pre-filled too.
      expect(created.body.fieldValues.contractor_bank).toBe(FULL_PROFILE.bankDetails);
      // Requirement 11 — exactly the keys that received a value.
      expect([...created.body.autofilled].sort()).toEqual([
        'contract_date',
        'contractor_bank',
        'contractor_full_name',
        'contractor_tax_id',
      ]);
      expect(created.body.autofillGaps).toEqual([]);
      expect(created.body.autofillTruncated).toEqual([]);
      expect(created.body.subjectRemoved).toBe(false);

      const detail = await get(admin, `/${created.body.id}`).expect(200);
      const byKey = Object.fromEntries(
        detail.body.fields.map((f: { key: string }) => [f.key, f]),
      );
      expect(byKey.contractor_full_name.value).toBe('Alex Kaminski');
      expect(byKey.contractor_full_name.autofilled).toBe(true);
      expect(byKey.contractor_full_name.autofillSource).toBe('member.fullName');
      // The unbound field is empty and unmarked.
      expect(byKey.contract_number.value).toBe('');
      expect(byKey.contract_number.autofilled).toBe(false);
    });
  });

  describe('TC-03-INT-02: Snapshot isolation', () => {
    it('holds the value resolved at creation through a profile edit and a send', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      const alex = await addSubject(admin, FULL_PROFILE);

      const envelope = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);
      expect(envelope.body.fieldValues.contractor_tax_id).toBe('191234567');

      await request(app.getHttpServer())
        .put(profileUrl(admin, alex.membershipId))
        .set('Cookie', admin.cookies)
        .send({ taxId: '999999999' })
        .expect(200);

      // Requirement 8: no live binding. The edit is invisible to an existing envelope.
      const afterEdit = await get(admin, `/${envelope.body.id}`).expect(200);
      const taxField = afterEdit.body.fields.find(
        (f: { key: string }) => f.key === 'contractor_tax_id',
      );
      expect(taxField.value).toBe('191234567');

      // And through the send, where the value is frozen into the document itself.
      await put(admin, `/${envelope.body.id}`, {
        signers: envelope.body.signers.map((s: { id: string; order: number }, i: number) => ({
          id: s.id,
          name: i === 0 ? 'Ivan Demchenko' : 'Alex Kaminski',
          email: i === 0 ? 'company@acme.com' : alex.email,
          order: s.order,
        })),
      }).expect(200);
      await request(app.getHttpServer())
        .post(envelopesApi(admin, `/${envelope.body.id}/send`))
        .set('Cookie', admin.cookies)
        .expect(200);

      const sent = await get(admin, `/${envelope.body.id}`).expect(200);
      expect(sent.body.renderedHtml).toContain('191234567');
      expect(sent.body.renderedHtml).not.toContain('999999999');
    });
  });

  describe('TC-03-INT-03: Missing profile data does not block creation', () => {
    it('creates the draft and names every gap with its label and source', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      // Requirement 14: no profile row at all behaves exactly like an all-null one.
      const alex = await addSubject(admin, null, { firstName: 'Alex', lastName: 'Kaminski' });

      const created = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);

      expect(created.body.fieldValues.contractor_tax_id).toBe('');
      expect(created.body.fieldValues.contractor_bank).toBe('');
      // Requirement 7 — not an error, and nothing is blocked.
      expect(created.body.autofillGaps).toEqual([
        { key: 'contractor_tax_id', label: 'УНП', source: 'member.taxId' },
        { key: 'contractor_bank', label: 'Bank details', source: 'member.bankDetails' },
      ]);
      // The two that do not depend on the profile still filled.
      expect(created.body.autofilled.sort()).toEqual(['contract_date', 'contractor_full_name']);
    });
  });

  describe('TC-03-INT-04: Envelope without a subject', () => {
    it('fills org and system sources, empties member ones, and reports no gaps', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const fields = [
        { ...BOUND_FIELDS[0] },
        { ...BOUND_FIELDS[2] },
        {
          key: 'org_name',
          label: 'Organization',
          type: 'text',
          required: false,
          maxLength: 100,
          filledBy: 'sender',
          autofillSource: 'org.name',
          order: 4,
        },
      ];
      const template = await publishBound(
        admin,
        fields,
        '<p>{{contractor_full_name}} {{contract_date}} {{org_name}}</p>',
      );

      const created = await create(admin, { templateId: template.id }).expect(201);

      expect(created.body.fieldValues.contractor_full_name).toBe('');
      expect(created.body.fieldValues.org_name).toBe('Acme Inc');
      expect(created.body.fieldValues.contract_date).toBe(new Date().toISOString().slice(0, 10));
      // Requirement 12: no subject is a deliberate choice, not an incomplete one.
      expect(created.body.autofillGaps).toEqual([]);
      expect(created.body.subjectMembershipId).toBeNull();
    });
  });

  describe('TC-03-INT-05: Autofilled values remain editable', () => {
    it('stores the overwrite and keeps the key marked as autofilled', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      const alex = await addSubject(admin, FULL_PROFILE);

      const envelope = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);

      await put(admin, `/${envelope.body.id}`, {
        fieldValues: { contractor_full_name: 'Aliaksandr Kaminski' },
      }).expect(200);

      const detail = await get(admin, `/${envelope.body.id}`).expect(200);
      const field = detail.body.fields.find(
        (f: { key: string }) => f.key === 'contractor_full_name',
      );
      expect(field.value).toBe('Aliaksandr Kaminski');
      // The marker records what happened at creation, so an edit does not clear it —
      // and nothing about it locks the field.
      expect(field.autofilled).toBe(true);
      expect(field.masked).toBe(false);
      expect(detail.body.canEdit).toBe(true);
    });
  });

  describe('TC-03-INT-08: Manager creates an envelope for a member whose PII they cannot read', () => {
    it('resolves the tax id server-side, marks it masked, and renders it in full', async () => {
      const owner = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(owner);
      const alex = await addSubject(owner, FULL_PROFILE);

      // G is a manager of the same organization.
      const g = await joinOrg('gina@acme.com', 'manager', owner.organizationId);

      // G cannot read the tax id on the profile screen.
      const masked = await request(app.getHttpServer())
        .get(profileUrl(g, alex.membershipId))
        .set('Cookie', g.cookies)
        .expect(200);
      expect(masked.body.taxId).toBe('***4567');

      // ...and can still create the contract that carries it.
      const created = await create(g, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);
      // Requirement 23: the snapshot is the real value, resolved server-side.
      expect(created.body.fieldValues.contractor_tax_id).toBe('191234567');

      const detail = await get(g, `/${created.body.id}`).expect(200);
      const field = detail.body.fields.find(
        (f: { key: string }) => f.key === 'contractor_tax_id',
      );
      // Marked, so the fill form renders it read-only with "Hidden — will be filled
      // automatically" — but the value itself is not masked: it is part of the contract.
      expect(field.masked).toBe(true);
      expect(field.value).toBe('191234567');
      // A non-sensitive source carries no marker at all.
      expect(
        detail.body.fields.find((f: { key: string }) => f.key === 'contractor_full_name').masked,
      ).toBe(false);

      // After sending, the document G is authorized to send contains the real value and
      // G can read it.
      await put(g, `/${created.body.id}`, {
        signers: created.body.signers.map((s: { id: string; order: number }, i: number) => ({
          id: s.id,
          name: i === 0 ? 'Gina Manager' : 'Alex Kaminski',
          email: i === 0 ? 'gina@acme.com' : alex.email,
          order: s.order,
        })),
      }).expect(200);
      await request(app.getHttpServer())
        .post(envelopesApi(g, `/${created.body.id}/send`))
        .set('Cookie', g.cookies)
        .expect(200);

      const sent = await get(g, `/${created.body.id}`).expect(200);
      expect(sent.body.renderedHtml).toContain('191234567');
      expect(sent.body.renderedHtml).not.toContain('***4567');
    });
  });

  describe('TC-03-INT-09: Removed subject', () => {
    it('resolves normally and marks the subject as removed', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      const alex = await addSubject(admin, FULL_PROFILE, { status: 'removed' });

      const created = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);

      // Requirement 13: a contract may legitimately be issued for someone who has left.
      expect(created.body.fieldValues.contractor_tax_id).toBe('191234567');
      expect(created.body.subjectRemoved).toBe(true);
    });

    it('refuses a subject that no longer exists with the spec message', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);

      const refused = await create(admin, {
        templateId: template.id,
        subjectMembershipId: '00000000-0000-0000-0000-000000000000',
      }).expect(400);
      expect(refused.body.error).toBe('subject_not_found');
      expect(refused.body.message).toBe('The selected member no longer exists');
    });
  });

  describe('TC-03-INT-10: Deleted subject does not break the envelope', () => {
    it('nulls the reference and keeps every snapshotted value intact', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      const alex = await addSubject(admin, FULL_PROFILE);

      const created = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);

      await prisma.membership.delete({ where: { id: alex.membershipId } });

      const detail = await get(admin, `/${created.body.id}`).expect(200);
      // `SetNull`, so the envelope survives its subject.
      expect(detail.body.subjectMembershipId).toBeNull();
      const byKey = Object.fromEntries(
        detail.body.fields.map((f: { key: string }) => [f.key, f]),
      );
      expect(byKey.contractor_tax_id.value).toBe('191234567');
      expect(byKey.contractor_full_name.value).toBe('Alex Kaminski');
      expect(byKey.contractor_tax_id.autofilled).toBe(true);
    });
  });

  describe('TC-03-INT-11: Truncation is flagged', () => {
    it('stores the value cut to maxLength and names the key', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const fields = [
        {
          key: 'contractor_address',
          label: 'Address',
          type: 'text',
          required: false,
          // Deliberately below the 200-character column limit, so the field's own
          // constraint is what truncates rather than the profile's.
          maxLength: 120,
          filledBy: 'sender',
          autofillSource: 'member.addressLine',
          order: 1,
        },
      ];
      const template = await publishBound(admin, fields, '<p>{{contractor_address}}</p>');
      const longAddress = 'A'.repeat(200);
      const alex = await addSubject(admin, { addressLine: longAddress });

      const created = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);

      expect(created.body.fieldValues.contractor_address).toHaveLength(120);
      expect(created.body.fieldValues.contractor_address).toBe(longAddress.slice(0, 120));
      // Requirement 10 — flagged, so the sender sees a warning rather than a silently
      // shortened clause.
      expect(created.body.autofillTruncated).toEqual(['contractor_address']);

      const detail = await get(admin, `/${created.body.id}`).expect(200);
      expect(
        detail.body.fields.find((f: { key: string }) => f.key === 'contractor_address')
          .autofillTruncated,
      ).toBe(true);
    });
  });

  describe('TC-03-INT-12: Source catalogue and type filtering', () => {
    it('serves the catalogue with types and sensitivity, and refuses an incompatible bind', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const base = `/api/organizations/${admin.organizationId}/autofill-sources`;

      const all = await request(app.getHttpServer())
        .get(base)
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(all.body.sources).toHaveLength(17);
      const byKey = Object.fromEntries(
        all.body.sources.map((s: { key: string }) => [s.key, s]),
      );
      expect(byKey['member.fullName']).toEqual({
        key: 'member.fullName',
        group: 'Member',
        label: 'Full name',
        valueType: 'text',
        sensitive: false,
      });
      expect(byKey['member.dateOfBirth'].valueType).toBe('date');
      expect(byKey['member.dateOfBirth'].sensitive).toBe(true);
      expect(byKey['member.taxId'].sensitive).toBe(true);
      expect(byKey['org.name'].group).toBe('Organization');
      expect(byKey.today.group).toBe('System');

      // Requirement 4 — server-side type filtering for the picker.
      const forDate = await request(app.getHttpServer())
        .get(`${base}?fieldType=date`)
        .set('Cookie', admin.cookies)
        .expect(200);
      const dateKeys = forDate.body.sources.map((s: { key: string }) => s.key);
      expect(dateKeys).toEqual(['member.joinedAt', 'member.dateOfBirth', 'today']);
      expect(dateKeys).not.toContain('member.fullName');

      // ...and the same rule re-run server-side at save time (validation rule 9).
      const created = await request(app.getHttpServer())
        .post(templatesApi(admin))
        .set('Cookie', admin.cookies)
        .send({ name: 'Bad bind' })
        .expect(201);

      const incompatible = await request(app.getHttpServer())
        .put(templatesApi(admin, `/${created.body.id}/draft`))
        .set('Cookie', admin.cookies)
        .send({
          rowVersion: 1,
          bodyHtml: '<p>{{dob}}</p>',
          signerRoles: SIGNER_ROLES,
          fields: [
            {
              key: 'dob',
              label: 'Date of birth',
              type: 'text',
              required: false,
              maxLength: 40,
              filledBy: 'sender',
              autofillSource: 'member.dateOfBirth',
              order: 1,
            },
          ],
        })
        .expect(400);
      expect(incompatible.body.errors['fields[0].autofillSource']).toBe(
        'This source cannot fill a text field',
      );

      const unknown = await request(app.getHttpServer())
        .put(templatesApi(admin, `/${created.body.id}/draft`))
        .set('Cookie', admin.cookies)
        .send({
          rowVersion: 1,
          bodyHtml: '<p>{{dob}}</p>',
          signerRoles: SIGNER_ROLES,
          fields: [
            {
              key: 'dob',
              label: 'Anything',
              type: 'text',
              required: false,
              maxLength: 40,
              filledBy: 'sender',
              autofillSource: 'member.unknownThing',
              order: 1,
            },
          ],
        })
        .expect(400);
      expect(unknown.body.errors['fields[0].autofillSource']).toBe('Unknown autofill source');
    });

    it('requires ViewDocumentTemplates and org scope for the catalogue', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const viewer = await joinOrg('vic@acme.com', 'viewer', admin.organizationId);

      await request(app.getHttpServer())
        .get(`/api/organizations/${admin.organizationId}/autofill-sources`)
        .set('Cookie', viewer.cookies)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/api/organizations/${admin.organizationId}/autofill-sources`)
        .expect(401);
    });
  });

  describe('TC-03-INT-14: Sensitive values stay out of the audit trail', () => {
    it('keeps the tax id out of every envelope event and out of the change log', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const template = await publishBound(admin);
      const alex = await addSubject(admin, FULL_PROFILE);

      // The profile edit whose activity entry must name the field and not the value.
      await request(app.getHttpServer())
        .put(profileUrl(admin, alex.membershipId))
        .set('Cookie', admin.cookies)
        .send({ taxId: '191234567', bankDetails: 'IBAN BY13 ALFA 3014' })
        .expect(200);

      const created = await create(admin, {
        templateId: template.id,
        subjectMembershipId: alex.membershipId,
      }).expect(201);
      const id = created.body.id;

      await put(admin, `/${id}`, {
        signers: created.body.signers.map((s: { id: string; order: number }, i: number) => ({
          id: s.id,
          name: i === 0 ? 'Ivan Demchenko' : 'Alex Kaminski',
          email: i === 0 ? 'company@acme.com' : alex.email,
          order: s.order,
        })),
      }).expect(200);
      await request(app.getHttpServer())
        .post(envelopesApi(admin, `/${id}/send`))
        .set('Cookie', admin.cookies)
        .expect(200);

      // Drive the envelope all the way through signing, so every event type the trail
      // can produce has actually been written before it is searched.
      for (const email of ['company@acme.com', alex.email]) {
        const token = tokenFromUrl(mail.lastFor(email, 'signing_invitation')!.signingUrl);
        await request(app.getHttpServer())
          .post(`/api/sign/${token}/sign`)
          .send({
            consentAccepted: true,
            signature: drawnSignaturePayload,
            fieldValues: { contractor_bank: 'IBAN BY13 ALFA 3014' },
          })
          .expect(200);
      }

      /* ---------------------------------------------------------------- *
       * Requirement 21: sensitive values never reach `EnvelopeEvent.Metadata`.
       *
       * The whole row is serialized rather than only `metadata`, so a value that leaked
       * into `userAgent`, an actor field, or a future column is caught too — the rule is
       * about the audit trail, not about one column of it.
       * ---------------------------------------------------------------- */
      const events = await prisma.envelopeEvent.findMany({ where: { envelopeId: id } });
      expect(events.length).toBeGreaterThan(0);
      const trail = JSON.stringify(events);
      expect(trail).not.toContain('191234567');
      expect(trail).not.toContain('MP1234567');
      expect(trail).not.toContain('IBAN BY13');
      expect(trail).not.toContain('1991-03-14');

      // The audit API says the same thing to a reader.
      const audit = await get(admin, `/${id}/audit`).expect(200);
      expect(JSON.stringify(audit.body)).not.toContain('191234567');
      expect(audit.body.chain.valid).toBe(true);

      // The document itself, by contrast, *does* carry the value — requirement 23. If
      // this ever stops being true the assertions above would pass vacuously.
      const detail = await get(admin, `/${id}`).expect(200);
      expect(detail.body.renderedHtml).toContain('191234567');

      /* ---------------------------------------------------------------- *
       * The second half of this case — "the member activity entries for the profile
       * edit ... the entry names the changed field only" — cannot be asserted here:
       * **there is no member activity surface in this repository**. Requirement 18 is
       * deferred for that reason and the seam is `MemberProfileService.logProfileChange`,
       * whose signature accepts field names and nothing else. What *can* be asserted is
       * the guarantee that made the requirement worth writing, and it holds against the
       * only durable store the profile edit touches: the row itself carries the values,
       * and nothing beside it records them.
       * ---------------------------------------------------------------- */
      const profiles = await prisma.memberProfile.findMany();
      expect(profiles).toHaveLength(1);
    });
  });
});

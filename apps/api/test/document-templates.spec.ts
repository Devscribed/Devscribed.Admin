import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { json } from 'express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * Integration coverage for specs/documents/01-document-templates.md. Every `describe`
 * carries its TC id so the spec and the suite can be read side by side.
 *
 * Roles other than `admin` have no creation path yet — invitations are user-management
 * spec 04 — so the fixtures write `Membership.role` with Prisma directly. That is the
 * honest fixture: it produces exactly the row a future invite flow will produce, and it
 * exercises the same normalization the guard runs, including the legacy `member` value.
 */
describe('Document templates', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  interface Signed {
    cookies: string[];
    organizationId: string;
    email: string;
  }

  const signup = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(app.getHttpServer())
      .post('/api/signup')
      .send({ orgName, firstName: 'Pat', lastName: 'Owner', email, password: 'Passw0rd' })
      .expect(201);

    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      organizationId: response.body.organization.id,
      email,
    };
  };

  /** No invite flow exists yet, so the role is set where the invite would have set it. */
  const setRole = async (email: string, role: string): Promise<void> => {
    const account = await prisma.account.findUniqueOrThrow({ where: { email } });
    await prisma.membership.updateMany({ where: { accountId: account.id }, data: { role } });
  };

  const api = (who: Signed, path = '') =>
    `/api/organizations/${who.organizationId}/document-templates${path}`;

  const createTemplate = async (who: Signed, name = 'Contractor agreement BY') => {
    const response = await request(app.getHttpServer())
      .post(api(who))
      .set('Cookie', who.cookies)
      .send({ name })
      .expect(201);
    return response.body as { id: string; versionId: string; versionNumber: number };
  };

  const SIGNER_ROLES = [
    { key: 'company', label: 'Company', order: 1 },
    { key: 'contractor', label: 'Contractor', order: 2 },
  ];

  const draftPayload = (rowVersion: number, overrides: Record<string, unknown> = {}) => ({
    rowVersion,
    bodyHtml: '<p>AGREEMENT with {{full_name}}</p>',
    signerRoles: SIGNER_ROLES,
    fields: [
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
    ],
    ...overrides,
  });

  const saveDraft = (who: Signed, id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer()).put(api(who, `/${id}/draft`)).set('Cookie', who.cookies).send(body);

  const detail = (who: Signed, id: string) =>
    request(app.getHttpServer()).get(api(who, `/${id}`)).set('Cookie', who.cookies);

  /** Create → save a complete draft → publish, the happy path most cases start from. */
  const publishedTemplate = async (who: Signed, name?: string) => {
    const created = await createTemplate(who, name);
    await saveDraft(who, created.id, draftPayload(1)).expect(200);
    await request(app.getHttpServer())
      .post(api(who, `/${created.id}/publish`))
      .set('Cookie', who.cookies)
      .expect(200);
    return created;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    // TC-01-INT-13 posts a body larger than Express's 100 KB default, which would
    // otherwise answer 413 before the spec's own 1 MB rule ever ran. Registered before
    // `init()` so it wins over Nest's parser, which then sees the body already read.
    app.use(json({ limit: '4mb' }));
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  describe('TC-01-INT-01: Create and publish a template', () => {
    it('creates version 1 in draft, saves it, publishes it, and reads it back', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');

      const created = await createTemplate(admin);
      expect(created.versionNumber).toBe(1);
      const version = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(version.publishedAt).toBeNull();
      expect(version.bodyHtml).toBe('');

      const saved = await saveDraft(admin, created.id, draftPayload(1)).expect(200);
      expect(saved.body.rowVersion).toBe(2);
      expect(saved.body.validation.unknownPlaceholders).toEqual([]);

      const published = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(published.body.versionNumber).toBe(1);
      expect(published.body.publishedAt).toEqual(expect.any(String));

      const read = await detail(admin, created.id).expect(200);
      expect(read.body.status).toBe('published');
      expect(read.body.currentVersion.versionNumber).toBe(1);
      expect(read.body.draftVersion).toBeNull();

      const frozen = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(frozen.fieldsSnapshot).toEqual([expect.objectContaining({ key: 'full_name', order: 1 })]);
    });
  });

  describe('TC-01-INT-02: Publish rejected for an unknown placeholder', () => {
    it('names the undefined key and leaves the template a draft', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);
      await saveDraft(
        admin,
        created.id,
        draftPayload(1, { bodyHtml: '<p>No. {{contract_number}}</p>', fields: [] }),
      ).expect(200);

      const response = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('unknown_placeholders');
      expect(response.body.keys).toEqual(['contract_number']);

      const template = await prisma.documentTemplate.findUniqueOrThrow({ where: { id: created.id } });
      expect(template.status).toBe('draft');
      expect(template.currentVersionId).toBeNull();
    });
  });

  describe('TC-01-INT-03: Publish rejected for wrong signer count', () => {
    it.each([
      ['one role', [{ key: 'company', label: 'Company', order: 1 }]],
      [
        'three roles',
        [
          { key: 'company', label: 'Company', order: 1 },
          { key: 'contractor', label: 'Contractor', order: 2 },
          { key: 'witness', label: 'Witness', order: 2 },
        ],
      ],
    ])('rejects %s', async (_label, signerRoles) => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);
      await saveDraft(admin, created.id, draftPayload(1, { signerRoles })).expect(200);

      const response = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('invalid_signer_roles');
      expect(response.body.message).toBe('A template must define exactly two signer roles');
    });
  });

  describe('TC-01-INT-04: Editing a published template creates a new draft version', () => {
    it('opens version 2 while version 1 stays current until the next publish', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);

      const saved = await saveDraft(
        admin,
        created.id,
        draftPayload(1, { bodyHtml: '<p>Revised for {{full_name}}</p>' }),
      ).expect(200);
      expect(saved.body.versionNumber).toBe(2);

      const between = await detail(admin, created.id).expect(200);
      expect(between.body.currentVersion.versionNumber).toBe(1);
      expect(between.body.draftVersion.versionNumber).toBe(2);

      await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies)
        .expect(200);

      const after = await detail(admin, created.id).expect(200);
      expect(after.body.currentVersion.versionNumber).toBe(2);
      expect(after.body.draftVersion).toBeNull();

      const first = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(first.bodyHtml).toBe('<p>AGREEMENT with {{full_name}}</p>');
    });
  });

  describe('TC-01-INT-05: A published version is immutable', () => {
    it('leaves the published row byte-identical when a save targets its versionId', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);
      const before = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });

      const response = await saveDraft(admin, created.id, {
        // A crafted request naming the published version explicitly.
        versionId: created.versionId,
        rowVersion: before.rowVersion,
        bodyHtml: '<p>Tampered {{full_name}}</p>',
        signerRoles: SIGNER_ROLES,
        fields: draftPayload(1).fields,
      });

      // Either outcome the spec allows; what matters is the row underneath.
      expect([200, 409]).toContain(response.status);

      const after = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(after.bodyHtml).toBe(before.bodyHtml);
      expect(after.rowVersion).toBe(before.rowVersion);
      expect(after.fieldsSnapshot).toEqual(before.fieldsSnapshot);
      expect(after.signerRoles).toEqual(before.signerRoles);
      expect(after.publishedAt).toEqual(before.publishedAt);
    });
  });

  describe('TC-01-INT-06: Optimistic locking', () => {
    it('accepts the first save at rowVersion 3 and rejects the replay', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      await saveDraft(admin, created.id, draftPayload(1)).expect(200);
      const third = await saveDraft(admin, created.id, draftPayload(2)).expect(200);
      expect(third.body.rowVersion).toBe(3);

      const first = await saveDraft(
        admin,
        created.id,
        draftPayload(3, { bodyHtml: '<p>First writer {{full_name}}</p>' }),
      );
      expect(first.status).toBe(200);
      expect(first.body.rowVersion).toBe(4);

      const second = await saveDraft(
        admin,
        created.id,
        draftPayload(3, { bodyHtml: '<p>Second writer {{full_name}}</p>' }),
      );
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('stale_version');
      expect(second.body.message).toBe(
        'This template was changed by someone else. Reload to see the latest version.',
      );

      const stored = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(stored.bodyHtml).toBe('<p>First writer {{full_name}}</p>');
      expect(stored.rowVersion).toBe(4);
    });
  });

  describe('TC-01-INT-07: Sanitization is persisted', () => {
    it('stores the sanitized body, so a later read is already clean', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const saved = await saveDraft(
        admin,
        created.id,
        draftPayload(1, { bodyHtml: '<script>alert(1)</script><p>Hello</p>', fields: [] }),
      ).expect(200);

      expect(saved.body.bodyHtml).not.toContain('script');
      expect(saved.body.bodyHtml).toContain('Hello');
      expect(saved.body.sanitized).toBe(true);
      expect(saved.body.removedElements).toContain('script');

      const read = await detail(admin, created.id).expect(200);
      expect(read.body.draftVersion.bodyHtml).not.toContain('script');

      const stored = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(stored.bodyHtml).not.toContain('script');
    });
  });

  describe('TC-01-INT-08: Duplicate name rejected case-insensitively', () => {
    it('rejects a name differing only in case and whitespace', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      await createTemplate(admin, 'Mutual NDA');

      const response = await request(app.getHttpServer())
        .post(api(admin))
        .set('Cookie', admin.cookies)
        .send({ name: '  mutual nda ' });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({
        error: 'duplicate_name',
        message: 'A template with this name already exists',
      });
      expect(await prisma.documentTemplate.count()).toBe(1);
    });

    it('trims the stored name', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      await createTemplate(admin, '  Client agreement US  ');
      const template = await prisma.documentTemplate.findFirstOrThrow();
      expect(template.name).toBe('Client agreement US');
    });

    it('allows the same name in a different organization', async () => {
      const one = await signup('a@acme.com', 'Acme Inc');
      const two = await signup('b@globex.com', 'Globex');
      await createTemplate(one, 'Mutual NDA');
      await createTemplate(two, 'Mutual NDA');
      expect(await prisma.documentTemplate.count()).toBe(2);
    });
  });

  it.todo(
    'TC-01-INT-09: Delete blocked once used, archive allowed — needs envelopes from spec 02',
  );

  describe('TC-01-INT-10: Delete allowed for an unused template', () => {
    it('removes the template with its versions and fields', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);

      await request(app.getHttpServer())
        .delete(api(admin, `/${created.id}`))
        .set('Cookie', admin.cookies)
        .expect(204);

      await detail(admin, created.id).expect(404);
      expect(await prisma.documentTemplateVersion.count()).toBe(0);
      expect(await prisma.templateField.count()).toBe(0);
    });

    it('reports canDelete while nothing has used the template', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);

      const read = await detail(admin, created.id).expect(200);
      expect(read.body.canDelete).toBe(true);

      const list = await request(app.getHttpServer())
        .get(api(admin))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(list.body.templates[0].envelopeCount).toBe(0);
    });
  });

  describe('TC-01-INT-11: Capability enforcement', () => {
    const expectations: Array<[string, number, number, boolean]> = [
      // role, GET list, PUT draft, canManage
      ['admin', 200, 200, true],
      ['manager', 200, 403, false],
      ['user', 403, 403, false],
      ['viewer', 403, 403, false],
      // The legacy value normalizes to `user` and therefore has no access.
      ['member', 403, 403, false],
    ];

    it.each(expectations)(
      '%s sees %i on the list and %i on a draft save',
      async (role, listStatus, saveStatus, canManage) => {
        const admin = await signup('admin@acme.com', 'Acme Inc');
        const created = await createTemplate(admin);
        await setRole(admin.email, role);

        const list = await request(app.getHttpServer()).get(api(admin)).set('Cookie', admin.cookies);
        expect(list.status).toBe(listStatus);
        if (listStatus === 200) expect(list.body.canManage).toBe(canManage);

        const saved = await saveDraft(admin, created.id, draftPayload(1));
        expect(saved.status).toBe(saveStatus);
      },
    );

    it('answers 403 with the spec error shape and never names the resource', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin, 'Secret NDA');
      await setRole(admin.email, 'viewer');

      const response = await detail(admin, created.id);
      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: 'forbidden',
        message: 'You do not have permission to manage templates',
      });
      expect(JSON.stringify(response.body)).not.toContain('Secret NDA');
    });

    it('lets a manager read a template and its preview but not publish it', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);
      await setRole(admin.email, 'manager');

      const read = await detail(admin, created.id).expect(200);
      expect(read.body.canManage).toBe(false);

      await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/preview`))
        .set('Cookie', admin.cookies)
        .send({})
        .expect(200);

      await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies)
        .expect(403);
    });

    it('answers 401 without a session, before any capability is considered', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      await request(app.getHttpServer()).get(api(admin)).expect(401);
    });
  });

  describe('TC-01-INT-12: Organization scoping', () => {
    it('answers 404 for a foreign orgId in the URL', async () => {
      const one = await signup('a@acme.com', 'Acme Inc');
      const two = await signup('b@globex.com', 'Globex');
      const created = await createTemplate(one, 'Acme NDA');

      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${one.organizationId}/document-templates/${created.id}`)
        .set('Cookie', two.cookies);

      // 404, not 403: a stranger learns nothing about whether the id exists.
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain('Acme NDA');
    });

    it('answers 404 for a foreign template id under the caller own orgId', async () => {
      const one = await signup('a@acme.com', 'Acme Inc');
      const two = await signup('b@globex.com', 'Globex');
      const created = await createTemplate(one, 'Acme NDA');

      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${two.organizationId}/document-templates/${created.id}`)
        .set('Cookie', two.cookies);

      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain('Acme NDA');
    });

    it('lists only the caller own organization templates', async () => {
      const one = await signup('a@acme.com', 'Acme Inc');
      const two = await signup('b@globex.com', 'Globex');
      await createTemplate(one, 'Acme NDA');

      const response = await request(app.getHttpServer())
        .get(`/api/organizations/${two.organizationId}/document-templates`)
        .set('Cookie', two.cookies)
        .expect(200);
      expect(response.body.templates).toEqual([]);
    });
  });

  describe('TC-01-INT-13: Body size limit', () => {
    it('rejects a 1.5 MB body and persists nothing', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);
      await saveDraft(admin, created.id, draftPayload(1)).expect(200);

      const response = await saveDraft(
        admin,
        created.id,
        draftPayload(2, { bodyHtml: `<p>${'x'.repeat(1_500_000)}</p>` }),
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('body_too_large');
      expect(response.body.message).toBe('Template body must be at most 1 MB');

      const stored = await prisma.documentTemplateVersion.findUniqueOrThrow({
        where: { id: created.versionId },
      });
      expect(stored.bodyHtml).toBe('<p>AGREEMENT with {{full_name}}</p>');
      expect(stored.rowVersion).toBe(2);
    });
  });

  describe('TC-01-INT-14: Dangling signer reference', () => {
    it('names the role that does not exist', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const response = await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          fields: [
            {
              key: 'full_name',
              label: 'Full name',
              type: 'text',
              required: true,
              filledBy: 'signer:witness',
              order: 1,
            },
          ],
        }),
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('unknown_signer_role');
      expect(response.body.keys).toEqual(['witness']);
    });

    it('accepts a filledBy naming a role that does exist', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          fields: [
            {
              key: 'full_name',
              label: 'Full name',
              type: 'text',
              filledBy: 'signer:contractor',
              order: 1,
            },
          ],
        }),
      ).expect(200);

      const field = await prisma.templateField.findFirstOrThrow();
      expect(field.filledBy).toBe('signer:contractor');
    });
  });

  describe('Draft validation rules', () => {
    it('rejects a reserved field key', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const response = await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          bodyHtml: '<p>{{signed_date}}</p>',
          fields: [{ key: 'signed_date', label: 'Signed date', type: 'date', order: 1 }],
        }),
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('reserved_key');
      expect(response.body.keys).toEqual(['signed_date']);
    });

    it('rejects a duplicate field key', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const response = await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          fields: [
            { key: 'full_name', label: 'Full name', type: 'text', order: 1 },
            { key: 'full_name', label: 'Name again', type: 'text', order: 2 },
          ],
        }),
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('duplicate_field_key');
      expect(response.body.keys).toEqual(['full_name']);
    });

    it('reports the offset of a malformed placeholder', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const response = await saveDraft(
        admin,
        created.id,
        draftPayload(1, { bodyHtml: '<p>Hi {{Full Name}}</p>', fields: [] }),
      );

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('malformed_placeholder');
      expect(response.body.offset).toBe(6);
      expect(response.body.message).toBe('Malformed placeholder at position 6');
    });

    it('returns per-field errors in the signup endpoint shape', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const response = await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          bodyHtml: '<p>body</p>',
          fields: [{ key: 'Full Name', label: '', type: 'text', order: 1 }],
        }),
      );

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual({
        'fields[0].key': 'Field key must be lowercase letters, digits and underscores',
        'fields[0].label': 'Field label is required',
      });
    });

    it('rejects an empty template name with the field-error shape', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');

      const response = await request(app.getHttpServer())
        .post(api(admin))
        .set('Cookie', admin.cookies)
        .send({ name: '   ' });

      expect(response.status).toBe(400);
      expect(response.body.errors).toEqual({ name: 'Template name is required' });
    });

    it('clamps maxLength to the type default rather than raising it', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          fields: [
            { key: 'full_name', label: 'Full name', type: 'text', maxLength: 9000, order: 1 },
          ],
        }),
      ).expect(200);

      const field = await prisma.templateField.findFirstOrThrow();
      expect(field.maxLength).toBe(200);
    });

    it('reports unused fields as advice without blocking the save', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const saved = await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          bodyHtml: '<p>Nothing here</p>',
        }),
      ).expect(200);

      expect(saved.body.validation.unusedFields).toEqual(['full_name']);
      expect(saved.body.validation.unknownPlaceholders).toEqual([]);
    });
  });

  describe('Archival', () => {
    it('archives once and refuses the second call', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);

      const first = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/archive`))
        .set('Cookie', admin.cookies);
      expect(first.status).toBe(200);
      expect(first.body).toEqual({ status: 'archived' });

      const second = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/archive`))
        .set('Cookie', admin.cookies);
      expect(second.status).toBe(409);
      expect(second.body.error).toBe('already_archived');
    });

    it('refuses to edit an archived template', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);
      await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/archive`))
        .set('Cookie', admin.cookies)
        .expect(200);

      const response = await saveDraft(admin, created.id, draftPayload(1));
      expect(response.status).toBe(409);
      expect(response.body.error).toBe('template_archived');
      expect(response.body.message).toBe('This template is archived and cannot be edited');
    });
  });

  describe('Publish preconditions', () => {
    it('refuses to publish a template with no open draft', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);

      const response = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies);

      expect(response.status).toBe(409);
      expect(response.body.error).toBe('no_draft');
      expect(response.body.message).toBe('There is nothing to publish');
    });

    it('refuses to publish an empty body', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);

      const response = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/publish`))
        .set('Cookie', admin.cookies);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('empty_body');
      expect(response.body.message).toBe('Template body cannot be empty');
    });
  });

  describe('Listing', () => {
    it('filters by name substring and by status', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      await publishedTemplate(admin, 'Contractor agreement BY');
      await createTemplate(admin, 'Mutual NDA');

      const search = await request(app.getHttpServer())
        .get(`${api(admin)}?q=mutual`)
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(search.body.templates.map((t: { name: string }) => t.name)).toEqual(['Mutual NDA']);

      const byStatus = await request(app.getHttpServer())
        .get(`${api(admin)}?status=published`)
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(byStatus.body.templates).toHaveLength(1);
      expect(byStatus.body.templates[0]).toMatchObject({
        name: 'Contractor agreement BY',
        status: 'published',
        currentVersionNumber: 1,
        hasOpenDraft: false,
        envelopeCount: 0,
      });
      expect(byStatus.body.canManage).toBe(true);
    });

    it('reports an open draft alongside the published version', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);
      await saveDraft(admin, created.id, draftPayload(1, { bodyHtml: '<p>v2 {{full_name}}</p>' })).expect(
        200,
      );

      const list = await request(app.getHttpServer())
        .get(api(admin))
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(list.body.templates[0]).toMatchObject({
        status: 'published',
        currentVersionNumber: 1,
        hasOpenDraft: true,
      });
    });
  });

  describe('Preview', () => {
    it('substitutes each placeholder with its label in brackets and never reads members', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await publishedTemplate(admin);

      const response = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/preview`))
        .set('Cookie', admin.cookies)
        .send({})
        .expect(200);

      const html: string = response.body.html;
      expect(html).toContain('[Full name]');
      expect(html).not.toContain('{{full_name}}');
      expect(html).toContain('Company');
      expect(html).toContain('Contractor');
      expect(html).toContain('<html');
      expect(html).toContain("default-src 'none'");
      // The one property that makes preview safe to render: no real person appears.
      expect(html).not.toContain('admin@acme.com');
      expect(html).not.toContain('Pat');
    });

    it('renders a named version and 404s for a version of another template', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const mine = await publishedTemplate(admin, 'Mine');
      const other = await publishedTemplate(admin, 'Other');

      await request(app.getHttpServer())
        .post(api(admin, `/${mine.id}/preview`))
        .set('Cookie', admin.cookies)
        .send({ versionId: mine.versionId })
        .expect(200);

      await request(app.getHttpServer())
        .post(api(admin, `/${mine.id}/preview`))
        .set('Cookie', admin.cookies)
        .send({ versionId: other.versionId })
        .expect(404);
    });

    it('escapes a field label so preview cannot introduce markup', async () => {
      const admin = await signup('admin@acme.com', 'Acme Inc');
      const created = await createTemplate(admin);
      await saveDraft(
        admin,
        created.id,
        draftPayload(1, {
          fields: [
            { key: 'full_name', label: '<b>Bobby</b> & Co', type: 'text', order: 1 },
          ],
        }),
      ).expect(200);

      const response = await request(app.getHttpServer())
        .post(api(admin, `/${created.id}/preview`))
        .set('Cookie', admin.cookies)
        .send({})
        .expect(200);

      expect(response.body.html).toContain('[&lt;b&gt;Bobby&lt;/b&gt; &amp; Co]');
      expect(response.body.html).not.toContain('<b>Bobby</b>');
    });
  });
});

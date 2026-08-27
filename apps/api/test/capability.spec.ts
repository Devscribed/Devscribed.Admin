import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { setRole, signup } from './envelope-fixtures';

/**
 * The one guard behaviour that is easier to pin here than through a template: the
 * capability check reads the **live membership**, not the role baked into the session
 * cookie. A demotion therefore takes effect on the next request rather than the next
 * sign-in, which is the same reasoning that makes `SessionGuard` re-read the security
 * stamp.
 *
 * This file used to also cover `POST /api/test/role`, a fixture that existed because
 * signup created an `admin` and nothing could change that. Spec 04's invitation flow and
 * spec 05's `PUT .../members/:memberId` retired it, and its tests went with it — what is
 * left is the guard property, which was always the part worth having.
 *
 * The role is moved with a direct write rather than through the API on purpose: the
 * subject here is the guard, and routing through `PUT` would put role-authority rules,
 * the zero-admin guard, and a second session in front of the thing being asserted.
 *
 * TC-01-INT-11 itself lives in document-templates.spec.ts, alongside the endpoints it
 * covers.
 */
describe('Capability plumbing', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Envelopes first: `Envelope.templateVersionId` is `Restrict`, so a template cannot
    // go while anything built from it is still standing.
    await prisma.envelope.deleteMany();
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  it('applies a demotion to the very next request, without a new sign-in', async () => {
    const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
    const list = `/api/organizations/${admin.organizationId}/document-templates`;

    await request(app.getHttpServer()).get(list).set('Cookie', admin.cookies).expect(200);

    await setRole(prisma, 'admin@acme.com', 'viewer');

    // Same cookie, same session — the role is read from the membership, not the token.
    await request(app.getHttpServer()).get(list).set('Cookie', admin.cookies).expect(403);
  });

  it('normalizes the legacy member value, so a stored `member` cannot widen access', async () => {
    const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
    const list = `/api/organizations/${admin.organizationId}/document-templates`;

    // `member` is the value today's database actually holds, and it normalizes to `user`
    // — which has no template capability at all. A check that read the column raw would
    // fall through to a default and let it past.
    await setRole(prisma, 'admin@acme.com', 'member');

    await request(app.getHttpServer()).get(list).set('Cookie', admin.cookies).expect(403);
  });
});

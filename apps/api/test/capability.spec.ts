import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * The test-only role affordance E2E depends on, and the guard behaviour that is easier
 * to pin here than through a template: that the capability check reads the *live*
 * membership rather than the session cookie.
 *
 * TC-01-INT-11 itself lives in document-templates.spec.ts, alongside the endpoints it
 * covers.
 */
describe('Capability plumbing', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const signup = async (email: string, orgName: string) => {
    const response = await request(app.getHttpServer())
      .post('/api/signup')
      .send({ orgName, firstName: 'Pat', lastName: 'Owner', email, password: 'Passw0rd' })
      .expect(201);
    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      organizationId: response.body.organization.id,
    };
  };

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
    await prisma.documentTemplate.updateMany({ data: { currentVersionId: null } });
    await prisma.documentTemplate.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  it('sets a membership role through POST /api/test/role', async () => {
    await signup('admin@acme.com', 'Acme Inc');

    const response = await request(app.getHttpServer())
      .post('/api/test/role')
      .send({ email: 'admin@acme.com', role: 'manager' })
      .expect(200);
    expect(response.body).toEqual({ email: 'admin@acme.com', role: 'manager' });

    const membership = await prisma.membership.findFirstOrThrow();
    expect(membership.role).toBe('manager');
  });

  it('normalizes the legacy member value on the way in', async () => {
    await signup('admin@acme.com', 'Acme Inc');

    await request(app.getHttpServer())
      .post('/api/test/role')
      .send({ email: 'admin@acme.com', role: 'member' })
      .expect(200);

    const membership = await prisma.membership.findFirstOrThrow();
    expect(membership.role).toBe('user');
  });

  it('404s for an address with no account', async () => {
    await request(app.getHttpServer())
      .post('/api/test/role')
      .send({ email: 'nobody@acme.com', role: 'manager' })
      .expect(404);
  });

  it('404s entirely in production', async () => {
    await signup('admin@acme.com', 'Acme Inc');
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await request(app.getHttpServer())
        .post('/api/test/role')
        .send({ email: 'admin@acme.com', role: 'manager' })
        .expect(404);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });

  it('applies a demotion to the very next request, without a new sign-in', async () => {
    const admin = await signup('admin@acme.com', 'Acme Inc');
    const list = `/api/organizations/${admin.organizationId}/document-templates`;

    await request(app.getHttpServer()).get(list).set('Cookie', admin.cookies).expect(200);

    await request(app.getHttpServer())
      .post('/api/test/role')
      .send({ email: 'admin@acme.com', role: 'viewer' })
      .expect(200);

    // Same cookie, same session — the role is read from the membership, not the token.
    await request(app.getHttpServer()).get(list).set('Cookie', admin.cookies).expect(403);
  });
});

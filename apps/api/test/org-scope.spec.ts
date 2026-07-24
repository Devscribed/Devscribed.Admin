import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * The organization id travels in the URL, so it is untrusted input. These tests pin
 * the rule that makes it safe: the parameter is only ever *compared* against the
 * session — the query itself still scopes by the session's organization.
 */
describe('GET /api/organizations/:orgId/members', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  interface Signed {
    cookies: string[];
    organizationId: string;
  }

  /** Registers an org and returns its cookie jar plus the organization it created. */
  const signup = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(app.getHttpServer()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
    });

    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      organizationId: response.body.organization.id,
    };
  };

  const members = (orgId: string, cookies?: string[]) => {
    const call = request(app.getHttpServer()).get(`/api/organizations/${orgId}/members`);
    return cookies ? call.set('Cookie', cookies) : call;
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
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  it('lists the members of the caller own organization', async () => {
    const mine = await signup('pat@acme.com', 'Acme Inc');

    const response = await members(mine.organizationId, mine.cookies);

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ email: 'pat@acme.com', role: 'admin' });
  });

  it('answers 404 for an organization the session does not belong to', async () => {
    const mine = await signup('pat@acme.com', 'Acme Inc');
    const theirs = await signup('sam@globex.com', 'Globex');

    const response = await members(theirs.organizationId, mine.cookies);

    // 404, not 403: a stranger learns nothing about whether the id exists.
    expect(response.status).toBe(404);
    expect(JSON.stringify(response.body)).not.toContain('sam@globex.com');
  });

  it('answers 401 without a session, whatever the id in the URL', async () => {
    const mine = await signup('pat@acme.com', 'Acme Inc');

    const response = await members(mine.organizationId);

    expect(response.status).toBe(401);
  });
});

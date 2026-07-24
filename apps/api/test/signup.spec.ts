import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SESSION_COOKIE } from '../src/auth/session.service';
import { PrismaService } from '../src/prisma.service';

const validPayload = {
  orgName: 'Acme Inc',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'owner@acme.com',
  password: 'Passw0rd',
  timezone: 'America/New_York',
};

describe('POST /api/signup', () => {
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
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
  });

  // TC-01-INT-01
  it('creates account + organization + admin membership atomically', async () => {
    const response = await request(app.getHttpServer()).post('/api/signup').send(validPayload);

    expect(response.status).toBe(201);
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain(`${SESSION_COOKIE}=`);
    expect(cookies.join(';')).toContain('HttpOnly');

    const accounts = await prisma.account.findMany();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].email).toBe('owner@acme.com');
    expect(accounts[0].passwordHash).not.toBe(validPayload.password);

    const orgs = await prisma.organization.findMany();
    expect(orgs).toHaveLength(1);
    expect(orgs[0].name).toBe('Acme Inc');
    expect(orgs[0].createdAt).toBeInstanceOf(Date);

    const memberships = await prisma.membership.findMany();
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({
      accountId: accounts[0].id,
      organizationId: orgs[0].id,
      role: 'admin',
      status: 'active',
    });
    expect(memberships[0].joinedAt).toBeInstanceOf(Date);
  });

  it('stores the email lowercased and trims the names', async () => {
    await request(app.getHttpServer())
      .post('/api/signup')
      .send({ ...validPayload, email: 'Owner@Acme.COM', firstName: '  Pat  ', orgName: '  Acme Inc  ' })
      .expect(201);

    const account = await prisma.account.findFirstOrThrow();
    expect(account.email).toBe('owner@acme.com');
    expect(account.firstName).toBe('Pat');
    const org = await prisma.organization.findFirstOrThrow();
    expect(org.name).toBe('Acme Inc');
  });

  // TC-01-INT-02
  it('rejects a duplicate email without partial writes', async () => {
    await request(app.getHttpServer()).post('/api/signup').send(validPayload).expect(201);

    const response = await request(app.getHttpServer())
      .post('/api/signup')
      .send({ ...validPayload, orgName: 'Second Org' });

    expect(response.status).toBeGreaterThanOrEqual(400);
    expect(response.status).toBeLessThan(500);
    expect(response.body.message).toBe('This email is already registered');
    expect(response.body.errors).toEqual({ email: 'This email is already registered' });

    expect(await prisma.organization.count()).toBe(1);
    expect(await prisma.membership.count()).toBe(1);
    expect(await prisma.account.count()).toBe(1);
  });

  // TC-01-INT-03
  it.each(['OWNER@ACME.COM', 'Owner@Acme.Com'])(
    'rejects %s as a duplicate, case-insensitively',
    async (email) => {
      await request(app.getHttpServer()).post('/api/signup').send(validPayload).expect(201);

      const response = await request(app.getHttpServer())
        .post('/api/signup')
        .send({ ...validPayload, email, orgName: 'Other Org' });

      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.body.message).toBe('This email is already registered');
      expect(await prisma.account.count()).toBe(1);
      expect(await prisma.organization.count()).toBe(1);
      expect(await prisma.membership.count()).toBe(1);
    },
  );

  // TC-01-INT-04
  it('stores the browser-detected timezone', async () => {
    await request(app.getHttpServer()).post('/api/signup').send(validPayload).expect(201);

    const account = await prisma.account.findFirstOrThrow();
    expect(account.timezone).toBe('America/New_York');
  });

  it('re-validates server-side and returns per-field errors', async () => {
    const response = await request(app.getHttpServer()).post('/api/signup').send({
      orgName: '',
      firstName: 'Pat2',
      lastName: 'Owner',
      email: 'not-an-email',
      password: 'short',
    });

    expect(response.status).toBe(400);
    expect(response.body.errors).toEqual({
      orgName: 'Organization name is required',
      firstName: 'First name may contain only letters, hyphens, apostrophes, and spaces',
      email: 'Enter a valid email address',
      password: 'Password must be at least 8 characters',
    });
    expect(await prisma.account.count()).toBe(0);
  });

  it('authenticates the creator, who then sees themselves as the sole admin', async () => {
    const agent = request.agent(app.getHttpServer());
    const created = await agent.post('/api/signup').send(validPayload).expect(201);

    const members = await agent
      .get(`/api/organizations/${created.body.organization.id}/members`)
      .expect(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0]).toMatchObject({
      name: 'Pat Owner',
      email: 'owner@acme.com',
      role: 'admin',
      status: 'active',
    });
  });

  it('refuses the members list without a session', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/signup')
      .send(validPayload)
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/organizations/${created.body.organization.id}/members`)
      .expect(401);
  });
});

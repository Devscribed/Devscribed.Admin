import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTH_MESSAGES } from '@devscribed/validation';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SESSION_COOKIE } from '../src/auth/session.service';
import { PrismaService } from '../src/prisma.service';

describe('POST /api/login', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const signup = (overrides: Record<string, unknown> = {}) =>
    request(app.getHttpServer())
      .post('/api/signup')
      .send({
        orgName: 'Acme Inc',
        firstName: 'Pat',
        lastName: 'Owner',
        email: 'pat@acme.com',
        password: 'Passw0rd',
        ...overrides,
      });

  const login = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/login').send(body);

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

  // TC-02-INT-01
  it('authenticates an active account and issues a session', async () => {
    await signup();

    const response = await login({ email: 'pat@acme.com', password: 'Passw0rd' });

    expect(response.status).toBe(200);
    const account = await prisma.account.findUnique({ where: { email: 'pat@acme.com' } });
    const membership = await prisma.membership.findUnique({ where: { accountId: account!.id } });
    expect(response.body).toEqual({
      accountId: account!.id,
      organizationId: membership!.organizationId,
    });

    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.join(';')).toContain(`${SESSION_COOKIE}=`);
    expect(cookies.join(';')).toContain('HttpOnly');
  });

  // TC-02-INT-01: the session carries the user's organization, so the members list
  // works straight away — and the response body says which organization that is.
  it('scopes the session to the account current organization', async () => {
    await signup();

    const response = await login({ email: 'pat@acme.com', password: 'Passw0rd' });
    const cookies = response.headers['set-cookie'] as unknown as string[];

    const members = await request(app.getHttpServer())
      .get(`/api/organizations/${response.body.organizationId}/members`)
      .set('Cookie', cookies);

    expect(members.status).toBe(200);
    expect(members.body).toHaveLength(1);
    expect(members.body[0]).toMatchObject({ email: 'pat@acme.com', role: 'admin' });
  });

  it('never reveals which half of the pair was wrong', async () => {
    await signup();

    const wrongPassword = await login({ email: 'pat@acme.com', password: 'nope' }); // TC-02-INT-02
    const unknownEmail = await login({ email: 'ghost@acme.com', password: 'anything' }); // TC-02-INT-03

    expect(wrongPassword.status).toBe(400);
    expect(unknownEmail.status).toBe(400);
    expect(wrongPassword.body.message).toBe(AUTH_MESSAGES.invalidCredentials);
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);
    expect(wrongPassword.headers['set-cookie']).toBeUndefined();
    expect(unknownEmail.headers['set-cookie']).toBeUndefined();
  });

  // TC-02-INT-08
  it('looks the email up case-insensitively', async () => {
    await signup();

    for (const email of ['PAT@ACME.COM', 'Pat@Acme.Com', '  pat@acme.com  ']) {
      const response = await login({ email, password: 'Passw0rd' });
      expect(response.status).toBe(200);
    }
  });

  // TC-02-INT-10
  it('rejects empty or whitespace-only credentials', async () => {
    for (const body of [
      { email: '', password: '' },
      { email: '  ', password: '  ' },
      { email: 'pat@acme.com', password: '' },
    ]) {
      const response = await login(body);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(AUTH_MESSAGES.credentialsRequired);
    }
  });

  // TC-02-INT-04 / TC-02-INT-04b
  it('refuses a removed member before checking the password', async () => {
    await signup({ email: 'ex@acme.com' });
    await prisma.membership.updateMany({ data: { status: 'removed' } });

    const correct = await login({ email: 'ex@acme.com', password: 'Passw0rd' });
    const wrong = await login({ email: 'ex@acme.com', password: 'wrongpassword' });

    // Identical for both, or the response would leak whether the password was right.
    for (const response of [correct, wrong]) {
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(AUTH_MESSAGES.deactivated);
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('treats an account with no active membership as deactivated', async () => {
    await signup({ email: 'invited@acme.com' });
    await prisma.membership.updateMany({ data: { status: 'invited' } });

    const response = await login({ email: 'invited@acme.com', password: 'Passw0rd' });

    expect(response.status).toBe(400);
    expect(response.body.message).toBe(AUTH_MESSAGES.deactivated);
  });
});

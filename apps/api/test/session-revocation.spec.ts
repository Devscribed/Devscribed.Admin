import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';

/**
 * The SecurityStamp mechanism itself (spec 02, requirement 12). Password reset and
 * member removal both revoke by regenerating the stamp; this suite proves the
 * primitive works, so those specs only have to prove they call it.
 */
describe('SecurityStamp session revocation', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const signup = () =>
    request(app.getHttpServer()).post('/api/signup').send({
      orgName: 'Acme Inc',
      firstName: 'Pat',
      lastName: 'Owner',
      email: 'pat@acme.com',
      password: 'Passw0rd',
    });

  const login = () =>
    request(app.getHttpServer())
      .post('/api/login')
      .send({ email: 'pat@acme.com', password: 'Passw0rd' });

  const members = (cookies: string[]) =>
    request(app.getHttpServer()).get('/api/members').set('Cookie', cookies);

  const cookiesOf = (response: request.Response) =>
    response.headers['set-cookie'] as unknown as string[];

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

  it('gives every account a stamp at signup', async () => {
    await signup();

    const account = await prisma.account.findUnique({ where: { email: 'pat@acme.com' } });

    expect(account!.securityStamp).toEqual(expect.any(String));
    expect(account!.securityStamp.length).toBeGreaterThan(0);
  });

  it('accepts a session whose stamp still matches', async () => {
    await signup();
    const session = cookiesOf(await login());

    expect((await members(session)).status).toBe(200);
  });

  // TC-02-INT-09, the mechanism: regenerating the stamp kills every outstanding cookie.
  it('rejects every existing session once the stamp is regenerated', async () => {
    await signup();
    const first = cookiesOf(await login());
    const second = cookiesOf(await login());
    expect((await members(first)).status).toBe(200);
    expect((await members(second)).status).toBe(200);

    await prisma.account.update({
      where: { email: 'pat@acme.com' },
      data: { securityStamp: 'regenerated-stamp' },
    });

    expect((await members(first)).status).toBe(401);
    expect((await members(second)).status).toBe(401);
  });

  it('lets the user back in after re-authenticating', async () => {
    await signup();
    const stale = cookiesOf(await login());
    await prisma.account.update({
      where: { email: 'pat@acme.com' },
      data: { securityStamp: 'regenerated-stamp' },
    });
    expect((await members(stale)).status).toBe(401);

    const fresh = cookiesOf(await login());

    expect((await members(fresh)).status).toBe(200);
  });

  it('rejects a session whose account has been deleted outright', async () => {
    await signup();
    const session = cookiesOf(await login());
    await prisma.membership.deleteMany();
    await prisma.account.deleteMany();

    expect((await members(session)).status).toBe(401);
  });
});

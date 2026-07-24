import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { SESSION_COOKIE } from '../src/auth/session.service';
import { PrismaService } from '../src/prisma.service';

describe('POST /api/logout', () => {
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

  it('clears the session cookie', async () => {
    const cookies = (await signup()).headers['set-cookie'] as unknown as string[];

    const logout = await request(app.getHttpServer()).post('/api/logout').set('Cookie', cookies);

    expect(logout.status).toBe(200);
    // Clearing means an expiring cookie of the same name — not merely omitting it.
    const cleared = (logout.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cleared).toContain(`${SESSION_COOKIE}=;`);
  });

  it('leaves a caller who kept no cookie unauthenticated', async () => {
    await signup();

    // What the browser does after logout: it has no cookie left to send.
    const after = await request(app.getHttpServer()).get('/api/me');

    expect(after.status).toBe(401);
  });

  it('answers the same way when no session is present', async () => {
    const response = await request(app.getHttpServer()).post('/api/logout');

    expect(response.status).toBe(200);
  });
});

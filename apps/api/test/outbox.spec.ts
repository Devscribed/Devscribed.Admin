import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — nothing here depends on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

/**
 * The dev outbox — `GET /api/organizations/:orgId/outbox`.
 *
 * The screen in front of it is proved once in the browser (`TC-OB-E2E-01`), because the
 * one thing only a browser can show is that the link in a row actually opens the signing
 * page. Everything else about this route is a server rule — who may read it, and which
 * rows come back — and lives here, where a case costs a request instead of a browser.
 *
 * The load-bearing rules are the two filters. A signing or accept link is enough to act
 * *as its recipient*, so a shared stand must not hand one person another organization's
 * mail; and a password reset — which is an account takeover, and carries no organization
 * at all — must never be listed here for anyone.
 */
describe('Dev outbox (GET /api/organizations/:orgId/outbox)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  interface Signed {
    cookies: string[];
    organizationId: string;
  }

  const signupAdmin = async (email: string, orgName: string): Promise<Signed> => {
    const response = await request(app.getHttpServer()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Admin',
      email,
      password: 'Passw0rd',
    });
    return {
      cookies: response.headers['set-cookie'] as unknown as string[],
      organizationId: response.body.organization.id,
    };
  };

  /** Inserts an account + membership and signs it in — mirrors the other spec suites. */
  const memberSignedIn = async (
    organizationId: string,
    email: string,
    role: string,
  ): Promise<string[]> => {
    const passwordHash = await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS);
    const account = await prisma.account.create({
      data: { email, passwordHash, firstName: 'Sam', lastName: 'Member' },
    });
    await prisma.membership.create({
      data: { accountId: account.id, organizationId, role, status: 'active' },
    });
    const response = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email, password: 'Passw0rd' });
    return response.headers['set-cookie'] as unknown as string[];
  };

  /** An invitation is the cheapest message that carries an organization id. */
  const invite = (cookies: string[], email: string, role = 'user') =>
    request(app.getHttpServer())
      .post('/api/invitations')
      .set('Cookie', cookies)
      .send({ email, role });

  const outbox = (orgId: string, cookies?: string[], query = '') => {
    const call = request(app.getHttpServer()).get(`/api/organizations/${orgId}/outbox${query}`);
    return cookies ? call.set('Cookie', cookies) : call;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MailService)
      .useClass(InMemoryMailService)
      .compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    prisma = app.get(PrismaService);
    mail = app.get(MailService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  // TC-OB-INT-01
  it('is empty before anything has been sent', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const response = await outbox(admin.organizationId, admin.cookies);

    // Empty is not a 404: an outbox nobody has written to yet is a valid, empty outbox.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ messages: [] });
  });

  // TC-OB-INT-02
  it('lists what went out, with the link a recipient would click', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, 'new@acme.com');

    const response = await outbox(admin.organizationId, admin.cookies);

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0]).toMatchObject({
      type: 'invitation',
      to: 'new@acme.com',
      subject: 'You have been invited to join an organization',
    });
    expect(response.body.messages[0].link).toContain('/accept-invite?token=');
  });

  // TC-OB-INT-03
  it('never lists another organization mail', async () => {
    const mine = await signupAdmin('admin@acme.com', 'Acme Inc');
    const theirs = await signupAdmin('admin@globex.com', 'Globex');
    await invite(mine.cookies, 'mine@acme.com');
    await invite(theirs.cookies, 'theirs@globex.com');

    const response = await outbox(mine.organizationId, mine.cookies);

    // An accept link is enough to join as its recipient. One shared stand must not hand
    // every account on it everyone else's links.
    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
    expect(response.body.messages[0].to).toBe('mine@acme.com');
    expect(JSON.stringify(response.body)).not.toContain('theirs@globex.com');
  });

  // TC-OB-INT-04
  it('never lists a password reset, which belongs to an account and not an organization', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await request(app.getHttpServer())
      .post('/api/forgot-password')
      .send({ email: 'admin@acme.com' });

    // The sink has it; the outbox must not.
    expect(mail.allRecords(undefined, 'password_reset')).toHaveLength(1);

    const response = await outbox(admin.organizationId, admin.cookies);

    expect(response.status).toBe(200);
    expect(response.body.messages).toEqual([]);
  });

  // TC-OB-INT-05
  it('lets a manager read it, because a manager sends envelopes', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, 'new@acme.com');
    const manager = await memberSignedIn(admin.organizationId, 'manager@acme.com', 'manager');

    const response = await outbox(admin.organizationId, manager);

    expect(response.status).toBe(200);
    expect(response.body.messages).toHaveLength(1);
  });

  // TC-OB-INT-06
  it.each(['user', 'viewer'])('refuses a %s', async (role) => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, 'new@acme.com');
    const cookies = await memberSignedIn(admin.organizationId, `${role}@acme.com`, role);

    const response = await outbox(admin.organizationId, cookies);

    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain('new@acme.com');
  });

  // TC-OB-INT-07
  it('answers 404 for an organization the session does not belong to', async () => {
    const mine = await signupAdmin('admin@acme.com', 'Acme Inc');
    const theirs = await signupAdmin('admin@globex.com', 'Globex');
    await invite(theirs.cookies, 'theirs@globex.com');

    const response = await outbox(theirs.organizationId, mine.cookies);

    // 404, not 403 — the repository rule for a foreign orgId in the path.
    expect(response.status).toBe(404);
  });

  // TC-OB-INT-08
  it('answers 401 without a session', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');

    const response = await outbox(admin.organizationId);

    expect(response.status).toBe(401);
  });

  // TC-OB-INT-09
  it('narrows to nothing for a type that does not exist', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, 'new@acme.com');

    const response = await outbox(admin.organizationId, admin.cookies, '?type=not_a_type');

    // A list route answers "no messages", not 404, when asked for an unknown type.
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ messages: [] });
  });

  // TC-OB-INT-10
  it('filters to one type when asked', async () => {
    const admin = await signupAdmin('admin@acme.com', 'Acme Inc');
    await invite(admin.cookies, 'new@acme.com');

    const invitations = await outbox(admin.organizationId, admin.cookies, '?type=invitation');
    const completions = await outbox(
      admin.organizationId,
      admin.cookies,
      '?type=envelope_completed',
    );

    expect(invitations.body.messages).toHaveLength(1);
    expect(completions.body.messages).toEqual([]);
  });
});

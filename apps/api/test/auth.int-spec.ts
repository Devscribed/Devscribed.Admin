import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MembershipStatus, Role } from '@devscribed/shared';
import { Account } from '../src/entities/account.entity';
import { Membership } from '../src/entities/membership.entity';
import { MailerService } from '../src/mail/mailer.service';
import { createTestApp, resetDatabase } from './test-app';

const PAT = {
  orgName: 'Acme Inc',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'pat@acme.com',
  password: 'Passw0rd',
};

function extractResetToken(text: string | undefined): string {
  const match = /token=([a-f0-9]+)/.exec(text ?? '');
  if (!match) {
    throw new Error('reset token not found in email');
  }
  return match[1];
}

describe('Authentication & Login (spec 02)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let mailer: MailerService;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
    mailer = app.get(MailerService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
    mailer.clear();
  });

  const server = () => app.getHttpServer();
  const signup = (overrides: Partial<typeof PAT> = {}) =>
    request(server())
      .post('/api/auth/signup')
      .send({ ...PAT, ...overrides });
  const login = (email: string, password: string) =>
    request(server()).post('/api/auth/login').send({ email, password });
  const forgot = (email: string) =>
    request(server()).post('/api/auth/forgot-password').send({ email });
  const reset = (token: string, password: string) =>
    request(server()).post('/api/auth/reset-password').send({ token, password });

  it('TC-02-INT-01: successful login carries organization and role', async () => {
    await signup();
    const res = await login('pat@acme.com', 'Passw0rd');

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.user.role).toBe(Role.Admin);
    expect(res.body.organization.name).toBe('Acme Inc');
  });

  it('TC-02-INT-02: wrong password is rejected with the generic message', async () => {
    await signup();
    const res = await login('pat@acme.com', 'nope');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('invalid email or password');
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('TC-02-INT-03: unknown email is rejected with the identical message', async () => {
    const res = await login('ghost@acme.com', 'anything');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('invalid email or password');
  });

  it('TC-02-INT-04: a removed member cannot log in even with correct credentials', async () => {
    await signup({ email: 'ex@acme.com' });
    const account = await dataSource
      .getRepository(Account)
      .findOneByOrFail({ email: 'ex@acme.com' });
    await dataSource
      .getRepository(Membership)
      .update({ accountId: account.id }, { status: MembershipStatus.Removed });

    const res = await login('ex@acme.com', 'Passw0rd');

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('TC-02-INT-05: forgot-password is enumeration-safe and issues a single-use token', async () => {
    await signup();

    const existing = await forgot('pat@acme.com');
    const missing = await forgot('ghost@acme.com');

    // 1. Both return the same neutral confirmation.
    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body.message).toBe(missing.body.message);

    // 2. A reset email is generated for pat only.
    expect(mailer.getLastTo('ghost@acme.com')).toBeUndefined();
    const email = mailer.getLastTo('pat@acme.com');
    expect(email).toBeDefined();
    const token = extractResetToken(email?.text);

    // 3. The first reset succeeds.
    expect((await reset(token, 'NewPass1')).status).toBe(200);

    // 4. Reusing the same token is rejected.
    const reuse = await reset(token, 'NewPass2');
    expect(reuse.status).toBe(400);

    // After reset, the new password works and the old one does not (reqs 9–10).
    expect((await login('pat@acme.com', 'NewPass1')).status).toBe(200);
    expect((await login('pat@acme.com', 'Passw0rd')).status).toBe(401);
  });

  it('reset rejects a policy-violating password (spec 02, requirement 3)', async () => {
    await signup();
    await forgot('pat@acme.com');
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);

    const res = await reset(token, 'short');
    expect(res.status).toBe(400);
    // Original password still works.
    expect((await login('pat@acme.com', 'Passw0rd')).status).toBe(200);
  });

  it('a successful reset revokes existing sessions (spec 02, requirement 9)', async () => {
    const signupRes = await signup();
    const oldToken = signupRes.body.token as string;

    // The pre-existing session works.
    const before = await request(server())
      .get('/api/members')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(before.status).toBe(200);

    await forgot('pat@acme.com');
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);
    expect((await reset(token, 'NewPass1')).status).toBe(200);

    // The old session is now revoked.
    const after = await request(server())
      .get('/api/members')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(after.status).toBe(401);
  });

  it('logout clears the session cookie', async () => {
    const res = await request(server()).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const raw = res.headers['set-cookie'] as unknown as string | string[] | undefined;
    const cookie = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
    expect(cookie).toMatch(/ds_session=;/);
  });
});

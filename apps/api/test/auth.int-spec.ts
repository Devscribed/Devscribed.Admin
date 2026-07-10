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

const INVALID_CREDENTIALS = 'Invalid email or password';
const DEACTIVATED = 'Your account has been deactivated, contact your administrator';
const INVALID_RESET_LINK = 'This reset link is invalid or has expired';

function extractResetToken(text: string | undefined): string {
  const match = /token=([^\s"]+)/.exec(text ?? '');
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
  const reset = (token: string, password: string, passwordConfirmation = password) =>
    request(server())
      .post('/api/auth/reset-password')
      .send({ token, password, passwordConfirmation });

  async function removeMembership(email: string): Promise<void> {
    const account = await dataSource.getRepository(Account).findOneByOrFail({ email });
    await dataSource
      .getRepository(Membership)
      .update({ accountId: account.id }, { status: MembershipStatus.Removed });
  }

  it('TC-02-INT-01: successful login carries organization and role', async () => {
    await signup();
    const res = await login('pat@acme.com', 'Passw0rd');

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeDefined();
    expect(res.body.user.role).toBe(Role.Admin);
    expect(res.body.organization.name).toBe('Acme Inc');
  });

  it('TC-02-INT-02: wrong password is rejected (400, generic message)', async () => {
    await signup();
    const res = await login('pat@acme.com', 'nope');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe(INVALID_CREDENTIALS);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('TC-02-INT-03: unknown email is rejected with the identical message', async () => {
    const res = await login('ghost@acme.com', 'anything');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(INVALID_CREDENTIALS);
  });

  it('TC-02-INT-04: removed member with correct password gets the deactivation message', async () => {
    await signup({ email: 'ex@acme.com' });
    await removeMembership('ex@acme.com');

    const res = await login('ex@acme.com', 'Passw0rd');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(DEACTIVATED);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('TC-02-INT-04b: removed member with wrong password still gets the deactivation message', async () => {
    await signup({ email: 'ex@acme.com' });
    await removeMembership('ex@acme.com');

    const res = await login('ex@acme.com', 'wrongpassword');
    expect(res.status).toBe(400);
    expect(res.body.message).toBe(DEACTIVATED);
  });

  it('TC-02-INT-05: forgot-password is enumeration-safe and issues a single-use token', async () => {
    await signup();

    const existing = await forgot('pat@acme.com');
    const missing = await forgot('ghost@acme.com');

    expect(existing.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(existing.body.message).toBe(missing.body.message);

    expect(mailer.getLastTo('ghost@acme.com')).toBeUndefined();
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);

    expect((await reset(token, 'NewPass1')).status).toBe(200);

    const reuse = await reset(token, 'NewPass2');
    expect(reuse.status).toBe(400);
    expect(reuse.body.message).toBe(INVALID_RESET_LINK);

    expect((await login('pat@acme.com', 'NewPass1')).status).toBe(200);
    expect((await login('pat@acme.com', 'Passw0rd')).status).toBe(400);
  });

  it('TC-02-INT-06: forgot-password for a removed member dispatches no email', async () => {
    await signup({ email: 'ex@acme.com' });
    await removeMembership('ex@acme.com');

    const res = await forgot('ex@acme.com');
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('If an account exists, a reset link has been sent.');
    expect(mailer.getLastTo('ex@acme.com')).toBeUndefined();
  });

  it('TC-02-INT-07: a new reset request invalidates the prior token', async () => {
    await signup();

    await forgot('pat@acme.com');
    const token1 = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);
    await forgot('pat@acme.com');
    const token2 = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);
    expect(token2).not.toBe(token1);

    const withT1 = await reset(token1, 'NewPass1');
    expect(withT1.status).toBe(400);
    expect(withT1.body.message).toBe(INVALID_RESET_LINK);

    expect((await reset(token2, 'NewPass1')).status).toBe(200);
  });

  it('TC-02-INT-08: login is case-insensitive on email', async () => {
    await signup();
    expect((await login('PAT@ACME.COM', 'Passw0rd')).status).toBe(200);
    expect((await login('Pat@Acme.Com', 'Passw0rd')).status).toBe(200);
  });

  it('TC-02-INT-09: a successful reset revokes existing sessions', async () => {
    const signupRes = await signup();
    const oldToken = signupRes.body.token as string;

    const before = await request(server())
      .get('/api/members')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(before.status).toBe(200);

    await forgot('pat@acme.com');
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);
    expect((await reset(token, 'NewPass1')).status).toBe(200);

    const after = await request(server())
      .get('/api/members')
      .set('Authorization', `Bearer ${oldToken}`);
    expect(after.status).toBe(401);
  });

  it('TC-02-INT-10: empty or whitespace login credentials are rejected', async () => {
    for (const [email, password] of [
      ['', ''],
      ['  ', '  '],
      ['pat@acme.com', ''],
    ]) {
      const res = await login(email, password);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email and password are required');
    }
  });

  it('TC-02-INT-11: forgot-password with an empty email is rejected', async () => {
    for (const email of ['', '  ']) {
      const res = await forgot(email);
      expect(res.status).toBe(400);
      expect(res.body.message).toBe('Email is required');
    }
  });

  it('TC-02-INT-12: reset with a policy-violating password does not consume the token', async () => {
    await signup();
    await forgot('pat@acme.com');
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);

    const tooShort = await reset(token, 'short');
    expect(tooShort.status).toBe(400);
    expect(tooShort.body.message).toBe('Password must be at least 8 characters');

    const noLetter = await reset(token, '12345678');
    expect(noLetter.status).toBe(400);
    expect(noLetter.body.message).toBe('Password must contain at least one letter');

    // Token survived the failed attempts.
    expect((await reset(token, 'NewPass1')).status).toBe(200);
  });

  it('TC-02-INT-13: reset with a confirmation mismatch does not consume the token', async () => {
    await signup();
    await forgot('pat@acme.com');
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);

    const mismatch = await reset(token, 'NewPass1', 'NewPass2');
    expect(mismatch.status).toBe(400);
    expect(mismatch.body.message).toBe('Passwords do not match');

    expect((await reset(token, 'NewPass1', 'NewPass1')).status).toBe(200);
  });

  it('validate endpoint reports token usability', async () => {
    await signup();
    await forgot('pat@acme.com');
    const token = extractResetToken(mailer.getLastTo('pat@acme.com')?.text);

    const good = await request(server()).get(
      `/api/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
    );
    expect(good.body.valid).toBe(true);

    const bad = await request(server()).get('/api/auth/reset-password/validate?token=nope');
    expect(bad.body.valid).toBe(false);
  });

  it('logout clears the session cookie', async () => {
    const res = await request(server()).post('/api/auth/logout');
    expect(res.status).toBe(200);
    const raw = res.headers['set-cookie'] as unknown as string | string[] | undefined;
    const cookie = Array.isArray(raw) ? raw.join(';') : (raw ?? '');
    expect(cookie).toMatch(/ds_session=;/);
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTH_MESSAGES, MESSAGES } from '@devscribed/validation';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

describe('reset-password', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  const EMAIL = 'pat@acme.com';

  const signup = () =>
    request(app.getHttpServer()).post('/api/signup').send({
      orgName: 'Acme Inc',
      firstName: 'Pat',
      lastName: 'Owner',
      email: EMAIL,
      password: 'Passw0rd',
    });

  const login = (password: string) =>
    request(app.getHttpServer()).post('/api/login').send({ email: EMAIL, password });

  const validate = (token: unknown) =>
    request(app.getHttpServer())
      .get('/api/reset-password/validate')
      .query(token === undefined ? {} : { token: String(token) });

  const reset = (body: Record<string, unknown>) =>
    request(app.getHttpServer()).post('/api/reset-password').send(body);

  /** Runs the real forgot-password flow and returns the token the recipient would get. */
  const issueToken = async (): Promise<string> => {
    await request(app.getHttpServer()).post('/api/forgot-password').send({ email: EMAIL });
    return mail.lastFor(EMAIL)!.token;
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
    await prisma.passwordResetToken.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
    await signup();
  });

  // TC-02-INT-14
  describe('GET /api/reset-password/validate', () => {
    it('accepts a live token without consuming it', async () => {
      const token = await issueToken();

      for (let i = 0; i < 3; i += 1) {
        const response = await validate(token);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ valid: true });
      }

      const stored = await prisma.passwordResetToken.findFirstOrThrow();
      expect(stored.usedAt).toBeNull();
      expect(stored.isInvalidated).toBe(false);

      // Still spendable after all that validating.
      const spent = await reset({ token, password: 'NewPass1', passwordConfirmation: 'NewPass1' });
      expect(spent.status).toBe(200);
    });

    it('rejects every unusable token with one indistinguishable body', async () => {
      const token = await issueToken();
      await reset({ token, password: 'NewPass1', passwordConfirmation: 'NewPass1' });

      const expired = await issueToken();
      await prisma.passwordResetToken.updateMany({
        where: { usedAt: null },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });

      const superseded = await issueToken();
      await prisma.passwordResetToken.updateMany({
        where: { tokenHash: { not: undefined }, usedAt: null },
        data: { isInvalidated: true },
      });

      for (const candidate of [token, expired, superseded, 'not-a-real-token', '', undefined]) {
        const response = await validate(candidate);
        expect(response.status).toBe(200);
        expect(response.body).toEqual({ valid: false });
      }
    });
  });

  describe('POST /api/reset-password', () => {
    it('sets the new password, spends the token, and locks out the old one', async () => {
      const token = await issueToken();

      const response = await reset({
        token,
        password: 'NewPass1',
        passwordConfirmation: 'NewPass1',
      });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ message: AUTH_MESSAGES.resetSuccess });
      expect((await prisma.passwordResetToken.findFirstOrThrow()).usedAt).toBeInstanceOf(Date);

      expect((await login('NewPass1')).status).toBe(200);
      expect((await login('Passw0rd')).status).toBe(400);
    });

    // TC-02-INT-05 step 4
    it('refuses a token that has already been spent', async () => {
      const token = await issueToken();
      await reset({ token, password: 'NewPass1', passwordConfirmation: 'NewPass1' });

      const second = await reset({
        token,
        password: 'Other123',
        passwordConfirmation: 'Other123',
      });

      expect(second.status).toBe(400);
      expect(second.body.message).toBe(AUTH_MESSAGES.resetTokenInvalid);
      expect((await login('NewPass1')).status).toBe(200);
    });

    // TC-02-INT-07 step 3
    it('refuses a token superseded by a newer request', async () => {
      const first = await issueToken();
      const second = await issueToken();

      const stale = await reset({
        token: first,
        password: 'NewPass1',
        passwordConfirmation: 'NewPass1',
      });
      expect(stale.status).toBe(400);
      expect(stale.body.message).toBe(AUTH_MESSAGES.resetTokenInvalid);

      const fresh = await reset({
        token: second,
        password: 'NewPass1',
        passwordConfirmation: 'NewPass1',
      });
      expect(fresh.status).toBe(200);
    });

    it('refuses an expired token', async () => {
      const token = await issueToken();
      await prisma.passwordResetToken.updateMany({
        data: { expiresAt: new Date(Date.now() - 1) },
      });

      const response = await reset({
        token,
        password: 'NewPass1',
        passwordConfirmation: 'NewPass1',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(AUTH_MESSAGES.resetTokenInvalid);
      expect((await login('Passw0rd')).status).toBe(200);
    });

    // TC-02-INT-12
    it('rejects a policy-violating password without spending the token', async () => {
      const token = await issueToken();

      const tooShort = await reset({ token, password: 'short', passwordConfirmation: 'short' });
      expect(tooShort.status).toBe(400);
      expect(tooShort.body.message).toBe(MESSAGES.password.tooShort);

      const noLetter = await reset({
        token,
        password: '12345678',
        passwordConfirmation: '12345678',
      });
      expect(noLetter.status).toBe(400);
      expect(noLetter.body.message).toBe(MESSAGES.password.noLetter);

      expect((await prisma.passwordResetToken.findFirstOrThrow()).usedAt).toBeNull();
      const recovered = await reset({
        token,
        password: 'NewPass1',
        passwordConfirmation: 'NewPass1',
      });
      expect(recovered.status).toBe(200);
    });

    // TC-02-INT-13
    it('rejects a confirmation mismatch without spending the token', async () => {
      const token = await issueToken();

      const response = await reset({
        token,
        password: 'NewPass1',
        passwordConfirmation: 'NewPass2',
      });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe(AUTH_MESSAGES.passwordMismatch);
      expect((await prisma.passwordResetToken.findFirstOrThrow()).usedAt).toBeNull();
    });

    // TC-02-INT-09
    it('revokes every existing session', async () => {
      const first = (await login('Passw0rd')).headers['set-cookie'] as unknown as string[];
      const second = (await login('Passw0rd')).headers['set-cookie'] as unknown as string[];
      // Any authenticated route proves the point; /api/me needs no organization in its URL.
      const members = (cookies: string[]) =>
        request(app.getHttpServer()).get('/api/me').set('Cookie', cookies);
      expect((await members(first)).status).toBe(200);

      const stampBefore = (await prisma.account.findUniqueOrThrow({ where: { email: EMAIL } }))
        .securityStamp;
      const token = await issueToken();
      await reset({ token, password: 'NewPass1', passwordConfirmation: 'NewPass1' });

      expect((await members(first)).status).toBe(401);
      expect((await members(second)).status).toBe(401);
      const stampAfter = (await prisma.account.findUniqueOrThrow({ where: { email: EMAIL } }))
        .securityStamp;
      expect(stampAfter).not.toBe(stampBefore);
    });
  });
});

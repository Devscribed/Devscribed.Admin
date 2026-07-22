import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AUTH_MESSAGES } from '@devscribed/validation';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { hashResetToken } from '../src/auth/reset-token';
import { PrismaService } from '../src/prisma.service';

describe('POST /api/forgot-password', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  const signup = (email: string) =>
    request(app.getHttpServer())
      .post('/api/signup')
      .send({
        orgName: 'Acme Inc',
        firstName: 'Pat',
        lastName: 'Owner',
        email,
        password: 'Passw0rd',
      });

  const forgot = (email: unknown) =>
    request(app.getHttpServer()).post('/api/forgot-password').send({ email });

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
  });

  // TC-02-INT-05
  it('answers identically whether or not the address is registered', async () => {
    await signup('pat@acme.com');

    const known = await forgot('pat@acme.com');
    const unknown = await forgot('ghost@acme.com');

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body).toEqual({ message: AUTH_MESSAGES.resetLinkSent });
    expect(unknown.body).toEqual(known.body);

    // Only the real account gets a token and an email.
    expect(await prisma.passwordResetToken.count()).toBe(1);
    expect(mail.sent.map((m) => m.to)).toEqual(['pat@acme.com']);
  });

  it('stores only the hash of a token it can still put in the email', async () => {
    await signup('pat@acme.com');

    await forgot('pat@acme.com');

    const stored = await prisma.passwordResetToken.findFirstOrThrow();
    const emailed = mail.sent[0];
    expect(stored.tokenHash).toBe(hashResetToken(emailed.token));
    expect(stored.tokenHash).not.toBe(emailed.token);
    expect(emailed.resetUrl).toContain(`token=${encodeURIComponent(emailed.token)}`);
  });

  it('finds the account case-insensitively', async () => {
    await signup('pat@acme.com');

    await forgot('  PAT@ACME.COM  ');

    expect(await prisma.passwordResetToken.count()).toBe(1);
    expect(mail.sent).toHaveLength(1);
  });

  // TC-02-INT-06
  it('sends nothing to a removed member but still answers neutrally', async () => {
    await signup('ex@acme.com');
    await prisma.membership.updateMany({ data: { status: 'removed' } });

    const response = await forgot('ex@acme.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: AUTH_MESSAGES.resetLinkSent });
    expect(mail.sent).toHaveLength(0);
    expect(await prisma.passwordResetToken.count()).toBe(0);
  });

  // TC-02-INT-07
  it('invalidates the previous token when a new one is requested', async () => {
    await signup('pat@acme.com');

    await forgot('pat@acme.com');
    const first = await prisma.passwordResetToken.findFirstOrThrow();
    await forgot('pat@acme.com');

    const tokens = await prisma.passwordResetToken.findMany({ orderBy: { createdAt: 'asc' } });
    expect(tokens).toHaveLength(2);
    expect(tokens.find((t) => t.id === first.id)!.isInvalidated).toBe(true);
    expect(tokens.find((t) => t.id !== first.id)!.isInvalidated).toBe(false);
  });

  it('expires the issued token 60 minutes after it was created', async () => {
    await signup('pat@acme.com');

    await forgot('pat@acme.com');

    const token = await prisma.passwordResetToken.findFirstOrThrow();
    expect(token.expiresAt.getTime() - token.createdAt.getTime()).toBe(60 * 60_000);
    expect(token.usedAt).toBeNull();
  });

  // TC-02-INT-11
  it('rejects an empty or whitespace-only email', async () => {
    for (const email of ['', '   ', undefined]) {
      const response = await forgot(email);
      expect(response.status).toBe(400);
      expect(response.body.message).toBe(AUTH_MESSAGES.emailRequired);
    }
    expect(mail.sent).toHaveLength(0);
  });

  it('still answers neutrally when the mail transport fails', async () => {
    await signup('pat@acme.com');
    mail.failNextSend();

    const response = await forgot('pat@acme.com');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: AUTH_MESSAGES.resetLinkSent });
  });
});

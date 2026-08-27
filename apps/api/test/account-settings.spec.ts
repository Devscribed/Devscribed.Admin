import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ACCOUNT_MESSAGES, MESSAGES } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { InMemoryMailService } from '../src/mail/in-memory-mail.service';
import { MailService } from '../src/mail/mail.service';
import { PrismaService } from '../src/prisma.service';

/** Cheap in tests — the policy under bcrypt doesn't depend on the cost factor. */
const TEST_BCRYPT_ROUNDS = 4;

describe('Account settings (spec 06)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let mail: InMemoryMailService;

  interface Signed {
    cookies: string[];
    accountId: string;
    organizationId: string;
  }

  const cookiesOf = (response: request.Response) =>
    response.headers['set-cookie'] as unknown as string[];

  const server = () => app.getHttpServer();

  /** Signs up an org admin and returns their live session. */
  const signupAdmin = async (email: string, orgName = 'Acme Inc'): Promise<Signed> => {
    const response = await request(server()).post('/api/signup').send({
      orgName,
      firstName: 'Pat',
      lastName: 'Owner',
      email,
      password: 'Passw0rd',
    });
    return {
      cookies: cookiesOf(response),
      accountId: response.body.account.id as string,
      organizationId: response.body.organization.id as string,
    };
  };

  const login = (email: string, password: string) =>
    request(server()).post('/api/login').send({ email, password });

  const getSettings = (cookies: string[]) =>
    request(server()).get('/api/account/settings').set('Cookie', cookies);

  const putSettings = (cookies: string[], body: Record<string, unknown>) =>
    request(server()).put('/api/account/settings').set('Cookie', cookies).send(body);

  const changeEmail = (cookies: string[], newEmail: unknown) =>
    request(server()).post('/api/account/change-email').set('Cookie', cookies).send({ newEmail });

  const confirmEmail = (token: unknown, cookies?: string[]) => {
    const req = request(server()).post('/api/account/confirm-email');
    if (cookies) req.set('Cookie', cookies);
    return req.send({ token });
  };

  const changePassword = (cookies: string[], body: Record<string, unknown>) =>
    request(server()).post('/api/account/change-password').set('Cookie', cookies).send(body);

  /** The raw confirmation token for a new address, as a recipient would read it. */
  const tokenFor = (newEmail: string): string => {
    const message = mail.lastEmailChangeConfirmationFor(newEmail);
    if (!message) throw new Error(`No confirmation email for ${newEmail}`);
    return message.token;
  };

  const validEditBody = (overrides: Record<string, unknown> = {}) => ({
    firstName: 'Pat',
    lastName: 'Owner',
    phoneCountryCode: null,
    phoneNumber: null,
    timezone: 'America/New_York',
    firstDayOfWeek: 'Monday',
    ...overrides,
  });

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
    await prisma.pendingEmailChange.deleteMany();
    await prisma.invitation.deleteMany();
    await prisma.membership.deleteMany();
    await prisma.organization.deleteMany();
    await prisma.account.deleteMany();
    mail.clear();
  });

  // TC-06-INT-01
  it('change email requires confirmation before it takes effect and notifies old address', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const step1 = await changeEmail(pat.cookies, 'new@acme.com');
    expect(step1.status).toBe(200);
    expect(step1.body).toEqual({
      message: 'A confirmation link has been sent to your new email address',
    });

    // Login email is still the old one.
    const stillOld = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(stillOld.email).toBe('pat@acme.com');

    // Two emails: confirmation to new, notification to old.
    expect(mail.lastEmailChangeConfirmationFor('new@acme.com')).toBeDefined();
    expect(mail.lastEmailChangeNotificationFor('pat@acme.com')).toBeDefined();

    // Cannot log in with the new address yet (invalid credentials → 400 in this app).
    expect((await login('new@acme.com', 'Passw0rd')).status).toBe(400);

    // Confirm.
    const step4 = await confirmEmail(tokenFor('new@acme.com'));
    expect(step4.status).toBe(200);
    expect(step4.body).toEqual({ message: 'Your email has been updated' });

    // New email works; old one no longer does.
    expect((await login('new@acme.com', 'Passw0rd')).status).toBe(200);
    expect((await login('pat@acme.com', 'Passw0rd')).status).toBe(400);
  });

  // TC-06-INT-02
  it('change password requires the correct current password', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const wrong = await changePassword(pat.cookies, {
      currentPassword: 'wrong',
      newPassword: 'NewPass1',
      passwordConfirmation: 'NewPass1',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body).toEqual({ message: ACCOUNT_MESSAGES.currentPasswordIncorrect });

    const right = await changePassword(pat.cookies, {
      currentPassword: 'Passw0rd',
      newPassword: 'NewPass1',
      passwordConfirmation: 'NewPass1',
    });
    expect(right.status).toBe(200);
    expect(right.body).toEqual({ message: 'Your password has been changed' });

    expect((await login('pat@acme.com', 'NewPass1')).status).toBe(200);
  });

  // TC-06-INT-03
  it('email change token expires after 24 hours', async () => {
    const pat = await signupAdmin('pat@acme.com');
    await changeEmail(pat.cookies, 'new@acme.com');
    const token = tokenFor('new@acme.com');

    // Simulate 25 hours after issuance.
    await prisma.pendingEmailChange.updateMany({
      where: { newEmail: 'new@acme.com' },
      data: { expiresAt: new Date(Date.now() - 60 * 60_000) },
    });

    const response = await confirmEmail(token);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ACCOUNT_MESSAGES.confirmationExpired });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(account.email).toBe('pat@acme.com');
  });

  // TC-06-INT-04
  it('email change fails if the new email is taken before confirmation, without consuming the token', async () => {
    const pat = await signupAdmin('pat@acme.com');
    await changeEmail(pat.cookies, 'new@acme.com');
    const token = tokenFor('new@acme.com');

    // Another account claims new@acme.com in the meantime.
    await prisma.account.create({
      data: {
        email: 'new@acme.com',
        passwordHash: await bcrypt.hash('Passw0rd', TEST_BCRYPT_ROUNDS),
        firstName: 'Other',
        lastName: 'User',
      },
    });

    const response = await confirmEmail(token);
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ACCOUNT_MESSAGES.emailInUse });

    // Pat's email unchanged.
    const account = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(account.email).toBe('pat@acme.com');

    // Token NOT consumed — remains valid for retry once the email is freed.
    const record = await prisma.pendingEmailChange.findFirstOrThrow({
      where: { accountId: pat.accountId },
    });
    expect(record.usedAt).toBeNull();
    expect(record.isInvalidated).toBe(false);

    // Free the email and retry the same token — now it succeeds.
    await prisma.account.delete({ where: { email: 'new@acme.com' } });
    const retry = await confirmEmail(token);
    expect(retry.status).toBe(200);
    const updated = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(updated.email).toBe('new@acme.com');
  });

  // TC-06-INT-05
  it('a second email change request invalidates the first token', async () => {
    const pat = await signupAdmin('pat@acme.com');

    await changeEmail(pat.cookies, 'new1@acme.com');
    const t1 = tokenFor('new1@acme.com');

    await changeEmail(pat.cookies, 'new2@acme.com');
    const t2 = tokenFor('new2@acme.com');

    const useT1 = await confirmEmail(t1);
    expect(useT1.status).toBe(400);
    expect(useT1.body).toEqual({ message: ACCOUNT_MESSAGES.confirmationInvalid });

    const useT2 = await confirmEmail(t2);
    expect(useT2.status).toBe(200);
    const account = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(account.email).toBe('new2@acme.com');
  });

  // TC-06-INT-06
  it('change password revokes other sessions but keeps the current one', async () => {
    const pat = await signupAdmin('pat@acme.com');
    const s1 = cookiesOf(await login('pat@acme.com', 'Passw0rd'));
    const s2 = cookiesOf(await login('pat@acme.com', 'Passw0rd'));

    const response = await changePassword(s1, {
      currentPassword: 'Passw0rd',
      newPassword: 'NewPass1',
      passwordConfirmation: 'NewPass1',
    });
    expect(response.status).toBe(200);

    // The response re-issues a fresh cookie for the current device.
    const reissued = cookiesOf(response);
    expect(reissued).toBeDefined();

    // S1's original cookie is now stale (stamp rotated), but the re-issued one is live.
    expect((await getSettings(reissued)).status).toBe(200);
    // S2 (other device) is revoked.
    expect((await getSettings(s2)).status).toBe(401);
  });

  // TC-06-INT-07
  it('email change to uppercase normalizes correctly', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const response = await changeEmail(pat.cookies, 'NEW@ACME.COM');
    expect(response.status).toBe(200);

    // Stored/sent as lowercase.
    expect(mail.lastEmailChangeConfirmationFor('new@acme.com')).toBeDefined();
    const record = await prisma.pendingEmailChange.findFirstOrThrow({
      where: { accountId: pat.accountId },
    });
    expect(record.newEmail).toBe('new@acme.com');

    await confirmEmail(tokenFor('new@acme.com'));
    const account = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(account.email).toBe('new@acme.com');
    expect((await login('new@acme.com', 'Passw0rd')).status).toBe(200);
  });

  // TC-06-INT-08
  it('change email to the current email is rejected (case-insensitive)', async () => {
    const pat = await signupAdmin('pat@acme.com');

    for (const attempt of ['pat@acme.com', 'PAT@ACME.COM']) {
      const response = await changeEmail(pat.cookies, attempt);
      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: ACCOUNT_MESSAGES.sameAsCurrentEmail });
    }

    // Nothing created.
    expect(await prisma.pendingEmailChange.count()).toBe(0);
  });

  // TC-06-INT-09
  it('confirm email is a public endpoint requiring no authentication', async () => {
    const pat = await signupAdmin('pat@acme.com');
    await changeEmail(pat.cookies, 'new@acme.com');
    const token = tokenFor('new@acme.com');

    // No cookie at all.
    const response = await confirmEmail(token);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Your email has been updated' });

    const account = await prisma.account.findUniqueOrThrow({ where: { id: pat.accountId } });
    expect(account.email).toBe('new@acme.com');
  });

  // TC-06-INT-10
  it('change password with confirmation mismatch is rejected', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const response = await changePassword(pat.cookies, {
      currentPassword: 'Passw0rd',
      newPassword: 'NewPass1',
      passwordConfirmation: 'NewPass2',
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: 'Passwords do not match' });

    // Password unchanged.
    expect((await login('pat@acme.com', 'Passw0rd')).status).toBe(200);
  });

  // TC-06-INT-11
  it('change password with a policy-violating new password is rejected', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const tooShort = await changePassword(pat.cookies, {
      currentPassword: 'Passw0rd',
      newPassword: 'short',
      passwordConfirmation: 'short',
    });
    expect(tooShort.status).toBe(400);
    expect(tooShort.body).toEqual({ message: MESSAGES.password.tooShort });

    const noDigit = await changePassword(pat.cookies, {
      currentPassword: 'Passw0rd',
      newPassword: 'nDigits!',
      passwordConfirmation: 'nDigits!',
    });
    expect(noDigit.status).toBe(400);
    expect(noDigit.body).toEqual({ message: MESSAGES.password.noDigit });

    const noLetter = await changePassword(pat.cookies, {
      currentPassword: 'Passw0rd',
      newPassword: '12345678',
      passwordConfirmation: '12345678',
    });
    expect(noLetter.status).toBe(400);
    expect(noLetter.body).toEqual({ message: MESSAGES.password.noLetter });
  });

  // TC-06-INT-12
  it('edit information — phone validation per country at the API level', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const valid = await putSettings(
      pat.cookies,
      validEditBody({ phoneCountryCode: 'US', phoneNumber: '(555) 123-4567' }),
    );
    expect(valid.status).toBe(200);

    const invalid = await putSettings(
      pat.cookies,
      validEditBody({ phoneCountryCode: 'US', phoneNumber: '12345' }),
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ errors: { phoneNumber: MESSAGES.phone.invalid } });

    const cleared = await putSettings(
      pat.cookies,
      validEditBody({ phoneCountryCode: null, phoneNumber: null }),
    );
    expect(cleared.status).toBe(200);
  });

  // TC-06-INT-13
  it('edit information — name validation at the API level', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const emptyFirst = await putSettings(pat.cookies, validEditBody({ firstName: '' }));
    expect(emptyFirst.status).toBe(400);
    expect(emptyFirst.body).toEqual({ errors: { firstName: MESSAGES.firstName.required } });

    const badFirst = await putSettings(pat.cookies, validEditBody({ firstName: 'Pat2' }));
    expect(badFirst.status).toBe(400);
    expect(badFirst.body).toEqual({ errors: { firstName: MESSAGES.firstName.invalidChars } });

    const emptyLast = await putSettings(pat.cookies, validEditBody({ lastName: '' }));
    expect(emptyLast.status).toBe(400);
    expect(emptyLast.body).toEqual({ errors: { lastName: MESSAGES.lastName.required } });
  });

  // TC-06-INT-14
  it('unauthenticated access to account settings is rejected', async () => {
    expect((await request(server()).get('/api/account/settings')).status).toBe(401);
    expect((await request(server()).put('/api/account/settings').send(validEditBody())).status).toBe(401);
    expect(
      (await request(server()).post('/api/account/change-email').send({ newEmail: 'new@acme.com' }))
        .status,
    ).toBe(401);
    expect(
      (
        await request(server()).post('/api/account/change-password').send({
          currentPassword: 'Passw0rd',
          newPassword: 'NewPass1',
          passwordConfirmation: 'NewPass1',
        })
      ).status,
    ).toBe(401);
  });

  // TC-06-INT-15
  it('edit information persists and returns on GET', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const put = await putSettings(pat.cookies, {
      firstName: 'Dima',
      lastName: 'Bezzubenkov',
      phoneCountryCode: 'US',
      phoneNumber: '(555) 123-4567',
      timezone: 'America/Los_Angeles',
      firstDayOfWeek: 'Sunday',
    });
    expect(put.status).toBe(200);
    expect(put.body).toEqual({ message: 'Settings saved' });

    const get = await getSettings(pat.cookies);
    expect(get.status).toBe(200);
    expect(get.body).toEqual({
      email: 'pat@acme.com',
      firstName: 'Dima',
      lastName: 'Bezzubenkov',
      phoneCountryCode: 'US',
      phoneNumber: '(555) 123-4567',
      timezone: 'America/Los_Angeles',
      firstDayOfWeek: 'Sunday',
    });
  });

  // TC-06-INT-16
  it('change email to an address already in use at request time is rejected', async () => {
    const pat = await signupAdmin('pat@acme.com');
    // Another account already holds taken@acme.com.
    await signupAdmin('taken@acme.com', 'Other Inc');

    const response = await changeEmail(pat.cookies, 'taken@acme.com');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ACCOUNT_MESSAGES.emailInUse });

    // No record created, no emails dispatched.
    expect(await prisma.pendingEmailChange.count()).toBe(0);
    expect(mail.sentEmailChangeConfirmations.length).toBe(0);
    expect(mail.sentEmailChangeNotifications.length).toBe(0);
  });

  // TC-06-INT-17
  it('edit information — timezone and first-day-of-week validation at the API level', async () => {
    const pat = await signupAdmin('pat@acme.com');

    const emptyTz = await putSettings(
      pat.cookies,
      validEditBody({ timezone: '', firstDayOfWeek: 'Monday' }),
    );
    expect(emptyTz.status).toBe(400);
    expect(emptyTz.body).toEqual({ errors: { timezone: MESSAGES.timezone.required } });

    const badDay = await putSettings(
      pat.cookies,
      validEditBody({ timezone: 'America/New_York', firstDayOfWeek: 'Saturday' }),
    );
    expect(badDay.status).toBe(400);
    expect(badDay.body).toEqual({ errors: { firstDayOfWeek: MESSAGES.firstDayOfWeek.invalid } });

    const valid = await putSettings(
      pat.cookies,
      validEditBody({ timezone: 'America/New_York', firstDayOfWeek: 'Monday' }),
    );
    expect(valid.status).toBe(200);
  });

  // Additional coverage: empty/whitespace new email in change-email yields the field message.
  it('change email with an empty new email returns "Email is required"', async () => {
    const pat = await signupAdmin('pat@acme.com');
    const response = await changeEmail(pat.cookies, '   ');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: MESSAGES.email.required });
  });

  // Additional coverage: a malformed / unknown confirm token is "no longer valid".
  it('confirm email with a garbage token returns "no longer valid"', async () => {
    const response = await confirmEmail('invalid-garbage-token');
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ACCOUNT_MESSAGES.confirmationInvalid });
  });

  // Additional coverage: empty current password returns the field message (spec order).
  it('change password with an empty current password returns "Current password is required"', async () => {
    const pat = await signupAdmin('pat@acme.com');
    const response = await changePassword(pat.cookies, {
      currentPassword: '',
      newPassword: 'NewPass1',
      passwordConfirmation: 'NewPass1',
    });
    expect(response.status).toBe(400);
    expect(response.body).toEqual({ message: ACCOUNT_MESSAGES.currentPasswordRequired });
  });

  // Additional coverage: mail dispatch failure must not change the change-email response.
  it('change email still succeeds when mail dispatch throws', async () => {
    const pat = await signupAdmin('pat@acme.com');
    mail.failNextSend();

    const response = await changeEmail(pat.cookies, 'new@acme.com');
    expect(response.status).toBe(200);
    // The record was still created (dispatch failure is swallowed).
    expect(await prisma.pendingEmailChange.count()).toBe(1);
  });

  // Additional coverage: GET returns nulls for unset phone fields.
  it('GET settings returns null phone fields when unset', async () => {
    const pat = await signupAdmin('pat@acme.com');
    const response = await getSettings(pat.cookies);
    expect(response.status).toBe(200);
    expect(response.body.phoneCountryCode).toBeNull();
    expect(response.body.phoneNumber).toBeNull();
    expect(response.body.firstDayOfWeek).toBe('Monday');
  });
});

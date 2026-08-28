import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma.service';
import { Signed, signup } from './envelope-fixtures';

/**
 * The member-profile half of specs/documents/03-field-autofill.md — requirements 14-23,
 * plus the validation rules behind them. Every `describe` carries its TC id so the spec
 * and the suite read side by side; the resolution cases live in `autofill.spec.ts`.
 */
describe('Member contract details', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const profileUrl = (who: Signed, memberId: string) =>
    `/api/organizations/${who.organizationId}/members/${memberId}/profile`;

  const getProfile = (who: Signed, memberId: string) =>
    request(app.getHttpServer()).get(profileUrl(who, memberId)).set('Cookie', who.cookies);

  const putProfile = (who: Signed, memberId: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .put(profileUrl(who, memberId))
      .set('Cookie', who.cookies)
      .send(body);

  const FULL_PROFILE = {
    addressLine: 'Nezavisimosti Ave 1, apt 5',
    city: 'Minsk',
    postalCode: '220030',
    country: 'BY',
    taxId: '191234567',
    dateOfBirth: '1991-03-14',
    idDocumentNumber: 'MP1234567',
    bankDetails: 'IBAN BY13 ALFA 30140000000000000000',
  };

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

  /**
   * No invite flow exists yet, so a second member of the same organization is created
   * where the invite would have created one — the same exception `setRole` documents.
   */
  const addMember = async (
    who: Signed,
    email: string,
    role: string,
    overrides: Record<string, unknown> = {},
  ) => {
    const account = await prisma.account.create({
      data: {
        email,
        passwordHash: 'x',
        firstName: 'Alex',
        lastName: 'Kaminski',
        ...overrides,
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId: who.organizationId,
        role,
        status: 'active',
      },
    });
    return { accountId: account.id, membershipId: membership.id, email };
  };

  /**
   * A *signed-in* member of an existing organization — needed because `isSelf` is
   * authorization by identity, so several cases require a real session for someone other
   * than the org's founder.
   *
   * No invite flow exists yet, so the account is created through signup (which is what
   * gives it a usable password) and its membership is then moved into the target
   * organization. The second login is not optional: the session cookie carries the
   * organization id, and `OrgScopeGuard` compares the URL against *that*, so a cookie
   * minted before the move would 404 on every scoped route.
   */
  const joinOrg = async (email: string, role: string, organizationId: string): Promise<Signed> => {
    const own = await signup(app, email, `Temp Org for ${email}`);
    await prisma.membership.updateMany({
      where: { accountId: own.accountId },
      data: { organizationId, role },
    });

    const login = await request(app.getHttpServer())
      .post('/api/login')
      .send({ email, password: 'Passw0rd' })
      .expect(200);

    return {
      ...own,
      organizationId,
      cookies: login.headers['set-cookie'] as unknown as string[],
    };
  };

  describe('TC-03-INT-06: PII masking by role', () => {
    it('gives admin full values, manager masks, self full values, and a stranger a 403', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const member = await joinOrg('alex@acme.com', 'user', admin.organizationId);
      const memberId = (
        await prisma.membership.findFirstOrThrow({ where: { accountId: member.accountId } })
      ).id;
      await putProfile(admin, memberId, FULL_PROFILE).expect(200);

      const manager = await joinOrg('gina@acme.com', 'manager', admin.organizationId);
      const stranger = await joinOrg('uma@acme.com', 'user', admin.organizationId);

      // A — full values, `maskedFields` empty.
      const asAdmin = await getProfile(admin, memberId).expect(200);
      expect(asAdmin.body.taxId).toBe('191234567');
      expect(asAdmin.body.dateOfBirth).toBe('1991-03-14');
      expect(asAdmin.body.idDocumentNumber).toBe('MP1234567');
      expect(asAdmin.body.bankDetails).toBe(FULL_PROFILE.bankDetails);
      expect(asAdmin.body.maskedFields).toEqual([]);
      expect(asAdmin.body.canEdit).toBe(true);

      // G — masked values, all four listed, cannot edit. The non-sensitive rows stay
      // legible: a manager arranging a contract needs the address.
      const asManager = await getProfile(manager, memberId).expect(200);
      expect(asManager.body.taxId).toBe('***4567');
      expect(asManager.body.dateOfBirth).toBe('1991');
      expect(asManager.body.idDocumentNumber).toBe('***4567');
      expect(asManager.body.bankDetails).toBe('••••');
      expect(asManager.body.maskedFields).toEqual([
        'taxId',
        'dateOfBirth',
        'idDocumentNumber',
        'bankDetails',
      ]);
      expect(asManager.body.canEdit).toBe(false);
      expect(asManager.body.city).toBe('Minsk');
      expect(asManager.body.maskedHint).toBe(
        'Some values are hidden. Ask an admin if you need them.',
      );

      // M (self) — full values and editable. Authorization by identity, not by role:
      // `ROLE_CAPABILITIES.user` is empty.
      const asSelf = await getProfile(member, memberId).expect(200);
      expect(asSelf.body.taxId).toBe('191234567');
      expect(asSelf.body.maskedFields).toEqual([]);
      expect(asSelf.body.canEdit).toBe(true);

      // U — another plain user, no capability and not self.
      const asStranger = await getProfile(stranger, memberId).expect(403);
      expect(asStranger.body.error).toBe('forbidden');
      expect(asStranger.body.message).toBe('You do not have permission to view these details');
      // Requirement 21: nothing sensitive rides along on the refusal.
      expect(JSON.stringify(asStranger.body)).not.toContain('191234567');
    });

    it('creates the profile lazily and reports an all-null profile without one', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');

      // Requirement 14: no row yet, and the read behaves exactly like an all-null one.
      const empty = await getProfile(admin, alex.membershipId).expect(200);
      expect(empty.body.addressLine).toBeNull();
      expect(empty.body.taxId).toBeNull();
      // Requirement 20: an absent value is not a secret, so nothing is listed as masked.
      expect(empty.body.maskedFields).toEqual([]);
      expect(empty.body.updatedAt).toBeNull();
      expect(await prisma.memberProfile.count()).toBe(0);

      await putProfile(admin, alex.membershipId, { city: 'Minsk' }).expect(200);
      expect(await prisma.memberProfile.count()).toBe(1);
    });
  });

  describe('TC-03-INT-07: A mask is never written back', () => {
    it('refuses a manager outright, and leaves the column unchanged for a stale client', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');
      await putProfile(admin, alex.membershipId, FULL_PROFILE).expect(200);

      const manager = await joinOrg('gina@acme.com', 'manager', admin.organizationId);

      // G cannot edit at all — the refusal comes before the mask rule is ever reached.
      const refused = await putProfile(manager, alex.membershipId, { taxId: '***4567' }).expect(403);
      expect(refused.body.message).toBe('You do not have permission to edit these details');
      let stored = await prisma.memberProfile.findFirstOrThrow();
      expect(stored.taxId).toBe('191234567');

      /* ---------------------------------------------------------------- *
       * "Repeat the same payload as an admin who received a masked read in a stale
       * client." Two independent rules stand between that payload and the column, and
       * the case asserts the outcome rather than which of them fired:
       *
       *  - The mask-write guard (requirement 22) skips a masked value from a caller who
       *    could only have received it as a mask.
       *  - Validation refuses `***4567` as a tax id and `1991` as a date outright.
       *
       * Whichever applies, the stored value is unchanged and is never the mask.
       * ---------------------------------------------------------------- */
      const rejected = await putProfile(admin, alex.membershipId, {
        taxId: '***4567',
        idDocumentNumber: '***4567',
        dateOfBirth: '1991',
        bankDetails: '••••',
        city: 'Brest',
      }).expect(400);
      expect(rejected.body.errors.taxId).toBe('Tax ID contains invalid characters');

      stored = await prisma.memberProfile.findFirstOrThrow();
      expect(stored.taxId).toBe('191234567');
      expect(stored.taxId).not.toBe('***4567');
      expect(stored.idDocumentNumber).toBe('MP1234567');
      expect(stored.bankDetails).toBe(FULL_PROFILE.bankDetails);
      expect(stored.dateOfBirth?.toISOString().slice(0, 10)).toBe('1991-03-14');
      // Nothing persisted from a rejected save, not even the valid half of it.
      expect(stored.city).toBe('Minsk');
    });

    it('refuses each mask string on its own, one field at a time', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');
      await putProfile(admin, alex.membershipId, FULL_PROFILE).expect(200);

      // One field per request, so a single rejected key cannot hide behind an
      // all-or-nothing 400 raised by a neighbour.
      //
      // `idDocumentNumber` is deliberately absent from this list, and the omission is
      // the honest part of the case: it has no format rule beyond a length cap, and
      // `canReadProfilePii` is true for every caller who may edit under the shipped role
      // matrix — so `***4567` from an admin is an admin typing `***4567`, not a mask
      // being echoed. Requirement 22's guard covers the caller who *cannot* read the
      // value, and no such caller can currently reach the write path at all.
      for (const [field, mask, message] of [
        ['taxId', '***4567', 'Tax ID contains invalid characters'],
        ['dateOfBirth', '1991', 'Enter a valid date'],
      ] as const) {
        const response = await putProfile(admin, alex.membershipId, { [field]: mask }).expect(400);
        expect(response.body.errors[field]).toBe(message);
      }

      const stored = await prisma.memberProfile.findFirstOrThrow();
      expect(stored.taxId).toBe('191234567');
      expect(stored.dateOfBirth?.toISOString().slice(0, 10)).toBe('1991-03-14');
    });
  });

  describe('TC-03-INT-13: Profile validation', () => {
    it('rejects each invalid value with the spec message and persists nothing', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');
      await putProfile(admin, alex.membershipId, { city: 'Minsk' }).expect(200);

      const cases: [Record<string, unknown>, string, string][] = [
        [{ country: 'ZZ' }, 'country', 'Enter a valid country'],
        [{ dateOfBirth: '2999-01-01' }, 'dateOfBirth', 'Date of birth cannot be in the future'],
        [
          { dateOfBirth: isoYearsAgo(5) },
          'dateOfBirth',
          'Date of birth must be at least 16 years ago',
        ],
        [{ bankDetails: 'x'.repeat(600) }, 'bankDetails', 'Bank details must be at most 500 characters'],
        [{ addressLine: 'x'.repeat(201) }, 'addressLine', 'Address must be at most 200 characters'],
        [{ taxId: 'x'.repeat(41) }, 'taxId', 'Tax ID must be at most 40 characters'],
        [{ taxId: '19!23' }, 'taxId', 'Tax ID contains invalid characters'],
        [{ dateOfBirth: '14-03-1991' }, 'dateOfBirth', 'Enter a valid date'],
      ];

      for (const [body, field, message] of cases) {
        const response = await putProfile(admin, alex.membershipId, body).expect(400);
        expect(response.body.errors[field]).toBe(message);
      }

      const stored = await prisma.memberProfile.findFirstOrThrow();
      expect(stored.country).toBeNull();
      expect(stored.dateOfBirth).toBeNull();
      expect(stored.bankDetails).toBeNull();
      expect(stored.taxId).toBeNull();
      // The one legitimate save is untouched by eight rejected ones.
      expect(stored.city).toBe('Minsk');
    });

    it('treats an omitted key as unchanged and an explicit null as a clear', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');
      await putProfile(admin, alex.membershipId, FULL_PROFILE).expect(200);

      await putProfile(admin, alex.membershipId, { city: 'Brest' }).expect(200);
      let stored = await prisma.memberProfile.findFirstOrThrow();
      expect(stored.city).toBe('Brest');
      expect(stored.taxId).toBe('191234567');

      const cleared = await putProfile(admin, alex.membershipId, { taxId: null }).expect(200);
      expect(cleared.body.taxId).toBeNull();
      stored = await prisma.memberProfile.findFirstOrThrow();
      expect(stored.taxId).toBeNull();
      expect(stored.city).toBe('Brest');
    });

    it('normalizes a lowercase country code and records who edited', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');

      const saved = await putProfile(admin, alex.membershipId, { country: 'by' }).expect(200);
      expect(saved.body.country).toBe('BY');
      expect(saved.body.updatedBy.id).toBe(admin.accountId);
      expect(saved.body.updatedAt).not.toBeNull();
    });
  });

  describe('Scope and identity', () => {
    it('404s a membership belonging to another organization', async () => {
      const acme = await signup(app, 'admin@acme.com', 'Acme Inc');
      const other = await signup(app, 'boss@globex.com', 'Globex');
      const outsider = await prisma.membership.findFirstOrThrow({
        where: { organizationId: other.organizationId },
      });

      // Scoped by the session, so a foreign id is indistinguishable from a missing one.
      await request(app.getHttpServer())
        .get(`/api/organizations/${acme.organizationId}/members/${outsider.id}/profile`)
        .set('Cookie', acme.cookies)
        .expect(404);
    });

    it('lists removed members with a flag only for the subject picker', async () => {
      const admin = await signup(app, 'admin@acme.com', 'Acme Inc');
      const alex = await addMember(admin, 'alex@acme.com', 'user');
      await prisma.membership.update({
        where: { id: alex.membershipId },
        data: { status: 'removed' },
      });

      // The subject picker reads spec 04's members list with `showRemoved`, not a flag
      // of its own: requirement 13 wants a former member listed and marked, and that is
      // the question `showRemoved` already answers for the Members screen.
      const base = `/api/organizations/${admin.organizationId}/members`;
      const plain = await request(app.getHttpServer())
        .get(base)
        .set('Cookie', admin.cookies)
        .expect(200);
      expect(
        plain.body.members.some((m: { id: string }) => m.id === alex.membershipId),
      ).toBe(false);

      const picker = await request(app.getHttpServer())
        .get(`${base}?showRemoved=true`)
        .set('Cookie', admin.cookies)
        .expect(200);
      const listed = picker.body.members.find((m: { id: string }) => m.id === alex.membershipId);
      expect(listed.status).toBe('removed');
    });
  });
});

/** An ISO date exactly N years before today, for the age rules. */
function isoYearsAgo(years: number): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear() - years, now.getUTCMonth(), now.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

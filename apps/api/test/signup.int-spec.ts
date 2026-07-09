import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { MembershipStatus, Role } from '@devscribed/shared';
import { Account } from '../src/entities/account.entity';
import { Organization } from '../src/entities/organization.entity';
import { Membership } from '../src/entities/membership.entity';
import { createTestApp, resetDatabase } from './test-app';

const VALID_SIGNUP = {
  orgName: 'Acme Inc',
  firstName: 'Pat',
  lastName: 'Owner',
  email: 'owner@acme.com',
  password: 'Passw0rd',
};

describe('Signup (spec 01 — Organization Creation)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ({ app, dataSource } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(dataSource);
  });

  it('TC-01-INT-01: signup creates account + org + admin membership atomically', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/signup').send(VALID_SIGNUP);

    // 1. Success with an authenticated session/token.
    expect(res.status).toBe(201);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.headers['set-cookie']).toBeDefined();
    // Session carries the user's current organization and role.
    expect(res.body.user.role).toBe(Role.Admin);
    expect(res.body.organization.name).toBe('Acme Inc');

    // 2. Exactly one account for owner@acme.com.
    const accounts = await dataSource.getRepository(Account).find();
    expect(accounts).toHaveLength(1);
    expect(accounts[0].email).toBe('owner@acme.com');
    expect(accounts[0].passwordHash).not.toBe('Passw0rd');

    // 3. Exactly one organization with the supplied name.
    const organizations = await dataSource.getRepository(Organization).find();
    expect(organizations).toHaveLength(1);
    expect(organizations[0].name).toBe('Acme Inc');

    // 4. Exactly one admin/active membership linking them, with a joined date.
    const memberships = await dataSource.getRepository(Membership).find();
    expect(memberships).toHaveLength(1);
    expect(memberships[0].accountId).toBe(accounts[0].id);
    expect(memberships[0].organizationId).toBe(organizations[0].id);
    expect(memberships[0].role).toBe(Role.Admin);
    expect(memberships[0].status).toBe(MembershipStatus.Active);
    expect(memberships[0].joinedAt).toBeInstanceOf(Date);
  });

  it('TC-01-INT-02: duplicate email is rejected without partial writes', async () => {
    // An account already exists for owner@acme.com.
    const first = await request(app.getHttpServer()).post('/api/auth/signup').send(VALID_SIGNUP);
    expect(first.status).toBe(201);

    const orgsBefore = await dataSource.getRepository(Organization).count();
    const membershipsBefore = await dataSource.getRepository(Membership).count();

    // Second signup, same email, otherwise-valid payload with a different org.
    const res = await request(app.getHttpServer())
      .post('/api/auth/signup')
      .send({ ...VALID_SIGNUP, orgName: 'Different Org' });

    // 1. Validation error indicating the email is already in use.
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already exists/i);

    // 2. No new organization and no new membership were created.
    expect(await dataSource.getRepository(Organization).count()).toBe(orgsBefore);
    expect(await dataSource.getRepository(Membership).count()).toBe(membershipsBefore);
    expect(await dataSource.getRepository(Organization).countBy({ name: 'Different Org' })).toBe(0);
  });

  it('rejects an invalid payload with per-field errors (spec 01, requirements 2–4)', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/signup').send({
      orgName: '   ',
      firstName: 'Pat',
      lastName: 'Owner',
      email: 'not-an-email',
      password: 'short',
    });

    expect(res.status).toBe(400);
    expect(res.body.errors).toMatchObject({
      orgName: expect.any(String),
      email: expect.any(String),
      password: expect.any(String),
    });
    // Nothing persisted.
    expect(await dataSource.getRepository(Account).count()).toBe(0);
  });

  it('lists the creator as the sole active admin (supports TC-01-E2E-01)', async () => {
    const signup = await request(app.getHttpServer()).post('/api/auth/signup').send(VALID_SIGNUP);
    const token = signup.body.token as string;

    const res = await request(app.getHttpServer())
      .get('/api/members')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.canManage).toBe(true);
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({
      fullName: 'Pat Owner',
      email: 'owner@acme.com',
      role: Role.Admin,
      status: MembershipStatus.Active,
    });
  });

  it('rejects the members endpoint without a session (spec 03, requirement 7)', async () => {
    const res = await request(app.getHttpServer()).get('/api/members');
    expect(res.status).toBe(401);
  });
});

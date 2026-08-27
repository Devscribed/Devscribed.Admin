/**
 * TEST-SUPPORT FIXTURES — not part of the product.
 *
 * Everything in this file exists because the product cannot yet build its own E2E
 * preconditions: signup always creates an `admin` of a brand-new organization, there is no
 * invite flow, and a test cannot advance the clock. **user-management spec 04 retires the
 * role and membership halves**: once an invitation can put a person into an organization
 * with a role, the honest fixture is to invite them and both routes are deleted.
 *
 * Every write here is fenced twice — `assertFixturesOpen` for the environment,
 * `resolveFixtureScope` for the caller — and answers 404 to everything else. Read the
 * comment at the top of `fixture-gate.ts` before changing either.
 */
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  NotFoundException,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { normalizeRole } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../auth/session.service';
import { assertFixturesOpen, assertLocalOnly, resolveFixtureScope } from './fixture-gate';

interface SetRoleDto {
  email?: string;
  role?: string;
}

/**
 * Sets the role of somebody already in the caller's organization, so an E2E run can sign
 * in as a manager, a user, or a viewer.
 *
 * Where the route is exposed at all — a deployment — the target is looked up **within the
 * caller's own organization**, never globally. That is the difference between a fixture and
 * an escalation endpoint: the address in the body selects among people the caller already
 * administers, and names nobody outside.
 */
@Controller('api/test/role')
export class TestRoleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  @Post()
  @HttpCode(200)
  async setRole(
    @Body() dto: SetRoleDto,
    @Req() request: Request,
    @Headers('authorization') authorization?: string,
  ) {
    assertFixturesOpen(authorization);
    const scope = await resolveFixtureScope(this.prisma, this.sessions, request);

    const email = (dto?.email ?? '').trim().toLowerCase();
    // Normalized rather than stored raw: the same closed set capability checks use, so
    // a typo in a fixture fails loudly here instead of silently granting `viewer`.
    const role = normalizeRole(dto?.role);

    const membership = await this.prisma.membership.findFirst({
      // Scoped to the caller's organization wherever there is one to scope to. `null` is
      // a developer's machine, where the address is the whole selector and the `/dev`
      // console reaches organizations it is not signed in to on purpose.
      where: { ...(scope === null ? {} : { organizationId: scope }), account: { email } },
      select: { id: true },
    });
    if (!membership) throw new NotFoundException('No membership for that address');

    await this.prisma.membership.update({ where: { id: membership.id }, data: { role } });

    return { email, role };
  }
}

interface MoveMembershipDto {
  orgId?: string;
  email?: string;
  role?: string;
}

/**
 * The membership half: read for the `/dev` console, write for the E2E suite.
 *
 * The two halves are fenced differently on purpose, and the asymmetry is the point — see
 * `assertLocalOnly`.
 */
@Controller('api/test/memberships')
export class TestMembershipsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Who is there to switch.
   *
   * `POST /api/test/role` takes an email, which is fine for a fixture that already knows
   * one and useless for a UI — a free-text box for an address that must already exist is a
   * typo generator. This lets `/dev` offer the real people in an organization instead.
   *
   * Local only, and **not** openable by the fixture token: with no `orgId` it enumerates
   * every organization in the environment. Read-only, and it deliberately returns no
   * tokens, hashes, or profile details: it is a picker, not an export.
   */
  @Get()
  async list(@Query('orgId') orgId?: string) {
    assertLocalOnly();

    const wanted = (orgId ?? '').trim();

    // No `orgId` means the caller does not know one yet, which is the state a developer is
    // in when they open /dev. Answering with the organizations — rather than 400 — is what
    // lets the page render a picker on first paint without a second endpoint.
    if (!wanted) {
      const organizations = await this.prisma.organization.findMany({
        orderBy: { createdAt: 'asc' },
        include: { _count: { select: { memberships: true } } },
      });

      return {
        organizations: organizations.map((org) => ({
          id: org.id,
          name: org.name,
          memberCount: org._count.memberships,
          createdAt: org.createdAt.toISOString(),
        })),
      };
    }

    const memberships = await this.prisma.membership.findMany({
      where: { organizationId: wanted },
      include: { account: true },
      orderBy: { joinedAt: 'asc' },
    });

    return {
      orgId: wanted,
      members: memberships.map((m) => ({
        id: m.id,
        email: m.account.email,
        name: `${m.account.firstName} ${m.account.lastName}`,
        role: m.role,
        status: m.status,
      })),
    };
  }

  /**
   * Puts a second person into the caller's organization — the precondition every test
   * about two members looking at each other's contract details is impossible without.
   *
   * It **moves** rather than adds, because `Membership.accountId` is `@unique` in
   * `schema.prisma`: an account holds exactly one membership, so the account registered a
   * moment ago is carried out of the throwaway organization signup gave it and into this
   * one. The invite flow will do the same thing in one step when spec 04 lands.
   *
   * Until this existed the suite ran the same `UPDATE` from the test process with its own
   * Prisma client, which quietly required a route to the database — so every test that
   * needed it failed against a deployment, where there is none. A fixture that only works
   * where the database is exposed is a fixture that stops testing the thing it was written
   * for exactly where that thing matters most.
   */
  @Post()
  @HttpCode(200)
  async move(
    @Body() dto: MoveMembershipDto,
    @Req() request: Request,
    @Headers('authorization') authorization?: string,
  ) {
    assertFixturesOpen(authorization);
    const destination = await resolveFixtureScope(
      this.prisma,
      this.sessions,
      request,
      (dto?.orgId ?? '').trim() || undefined,
    );
    // Unlike the other two, this one cannot fall back to "unscoped": there is no such
    // thing as moving a membership into no organization.
    if (destination === null) throw new NotFoundException('No organization to move into');

    const email = (dto?.email ?? '').trim().toLowerCase();
    const account = await this.prisma.account.findUnique({
      where: { email },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!account) throw new NotFoundException('No account for that address');

    const existing = await this.prisma.membership.findFirst({
      where: { accountId: account.id },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('No membership for that address');

    // The role is written only when the caller names one. Leaving it alone otherwise keeps
    // "which role is this test about" in the test body, where `POST /api/test/role` puts
    // it, rather than half here and half there.
    const role = dto?.role === undefined ? undefined : normalizeRole(dto.role);

    const membership = await this.prisma.membership.update({
      where: { id: existing.id },
      data: {
        organizationId: destination,
        status: 'active',
        ...(role === undefined ? {} : { role }),
      },
      select: { id: true, role: true },
    });

    return {
      membershipId: membership.id,
      accountId: account.id,
      email,
      name: `${account.firstName} ${account.lastName}`,
      role: membership.role,
    };
  }
}

interface ExpireEnvelopeDto {
  orgId?: string;
  envelopeId?: string;
}

/**
 * Moves one of the caller's envelopes past its expiry.
 *
 * A test cannot advance the clock and the product offers no way to shorten an expiry, so
 * TC-02-E2E-07 — lazy expiry is authoritative even while the stored status still says
 * `sent` — has no precondition without this. The suite used to write the column directly,
 * with the same consequence as above.
 *
 * It writes exactly one column, on one envelope, in the caller's own organization, and
 * deliberately does **not** run the sweep afterwards: the whole point of the test is that
 * the read path is right before anything has swept.
 */
@Controller('api/test/envelopes')
export class TestEnvelopeExpiryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  @Post('expire')
  @HttpCode(200)
  async expire(
    @Body() dto: ExpireEnvelopeDto,
    @Req() request: Request,
    @Headers('authorization') authorization?: string,
  ) {
    assertFixturesOpen(authorization);
    const scope = await resolveFixtureScope(
      this.prisma,
      this.sessions,
      request,
      (dto?.orgId ?? '').trim() || undefined,
    );

    const envelopeId = (dto?.envelopeId ?? '').trim();
    const envelope = await this.prisma.envelope.findFirst({
      // Scoped by the caller's organization wherever there is one; never by the id alone
      // on a deployment.
      where: { id: envelopeId, ...(scope === null ? {} : { organizationId: scope }) },
      select: { id: true },
    });
    if (!envelope) throw new NotFoundException('No envelope with that id');

    const expiresAt = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await this.prisma.envelope.update({ where: { id: envelope.id }, data: { expiresAt } });

    return { envelopeId: envelope.id, expiresAt: expiresAt.toISOString() };
  }
}

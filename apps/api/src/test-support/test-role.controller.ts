/**
 * LOCAL DEVELOPMENT AFFORDANCE — not part of the product.
 *
 * Everything in this file exists because signup always creates an `admin` and there is no
 * invite flow. **user-management spec 04 retires the whole file**: once an invitation can
 * issue a role, the honest fixture is to invite the member, and this — together with the
 * roles panel of `/dev` — is deleted.
 */
import { Body, Controller, Get, HttpCode, NotFoundException, Post, Query } from '@nestjs/common';
import { normalizeRole } from '@devscribed/validation';
import { PrismaService } from '../prisma.service';

interface SetRoleDto {
  email?: string;
  role?: string;
}

/**
 * Sets a membership's role, so an E2E run can sign in as a manager, a user, or a viewer.
 *
 * This exists only because there is no invite flow yet: today the sole way to get a
 * membership is signup, which always creates an `admin`. **user-management spec 04
 * retires this controller** — the moment invitations can issue a role, the honest
 * fixture is to invite the member and this file is deleted.
 *
 * Fenced exactly the way `mail/test-mail.controller.ts` is: 404 whenever NODE_ENV is
 * production, so a real deployment cannot be privilege-escalated through it.
 */
@Controller('api/test/role')
export class TestRoleController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  @HttpCode(200)
  async setRole(@Body() dto: SetRoleDto) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();

    const email = (dto?.email ?? '').trim().toLowerCase();
    // Normalized rather than stored raw: the same closed set capability checks use, so
    // a typo in a fixture fails loudly here instead of silently granting `viewer`.
    const role = normalizeRole(dto?.role);

    const account = await this.prisma.account.findUnique({ where: { email } });
    if (!account) throw new NotFoundException('No account for that address');

    const membership = await this.prisma.membership.findFirst({ where: { accountId: account.id } });
    if (!membership) throw new NotFoundException('No membership for that address');

    await this.prisma.membership.update({ where: { id: membership.id }, data: { role } });

    return { email, role };
  }
}

/**
 * The read half of the same affordance: who is there to switch.
 *
 * `POST /api/test/role` takes an email, which is fine for a fixture that already knows one
 * and useless for a UI — a free-text box for an address that must already exist is a
 * typo generator. This lets `/dev` offer the real people in an organization instead.
 *
 * A separate class only because Nest binds one path prefix per controller; it shares the
 * single fence (404 whenever NODE_ENV is production) and the same retirement — spec 04
 * deletes both. Read-only, and it deliberately returns no tokens, hashes, or profile
 * details: it is a picker, not an export.
 */
@Controller('api/test/memberships')
export class TestMembershipsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query('orgId') orgId?: string) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();

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
}

import { Body, Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
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

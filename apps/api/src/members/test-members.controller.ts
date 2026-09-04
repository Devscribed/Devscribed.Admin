import {
  Body,
  Controller,
  ForbiddenException,
  NotFoundException,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ORG_ROLES, normalizeEmail, type OrgRole } from '@devscribed/validation';
import * as bcrypt from 'bcryptjs';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { PrismaService } from '../prisma.service';

interface SeedMemberDto {
  email?: unknown;
  role?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  password?: unknown;
}

/**
 * Lets an E2E run sign in as a `manager`, a `user` or a `viewer`.
 *
 * Hiring's permission matrix is four roles wide and the interviewer's row is gated on
 * assignment rather than role, so the rules cannot be exercised from one admin account —
 * and there is no invitation endpoint yet (user-management spec 03), so a browser has no
 * way to produce a second member at all. This is that missing seam, and only that: it
 * creates exactly the account and membership an invitation eventually will.
 *
 * Fenced the same way `/api/test/mail` and `/api/test/calendar` are, and one turn
 * tighter. It never answers in production, and it requires an `admin`'s own session —
 * so what it can create is bounded by an organization somebody already administers,
 * which is a thing that account will be able to do through the real screen shortly.
 */
@Controller('api/test/members')
@UseGuards(SessionGuard)
export class TestMembersController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async seed(@Req() req: AuthenticatedRequest, @Body() dto: SeedMemberDto) {
    if (process.env.NODE_ENV === 'production') throw new NotFoundException();

    const membership = await this.prisma.membership.findUnique({
      where: { accountId: req.session!.accountId },
      select: { role: true, status: true, organizationId: true },
    });
    if (membership?.status !== 'active' || membership.role !== 'admin') {
      throw new ForbiddenException();
    }

    const email = normalizeEmail(String(dto.email ?? ''));
    const role = String(dto.role ?? '') as OrgRole;
    if (!email || !ORG_ROLES.includes(role)) throw new ForbiddenException();

    const account = await this.prisma.account.create({
      data: {
        email,
        // A real hash, so the seeded member signs in through the real endpoint and the
        // guards a test exercises are reached by a genuine cookie.
        passwordHash: await bcrypt.hash(String(dto.password ?? 'Passw0rd'), 10),
        firstName: String(dto.firstName ?? 'Sam'),
        lastName: String(dto.lastName ?? 'Member'),
      },
    });
    await this.prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId: membership.organizationId,
        role,
        status: 'active',
      },
    });

    return { accountId: account.id, email, role };
  }
}

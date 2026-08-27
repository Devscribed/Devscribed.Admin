/**
 * TEST-SUPPORT FIXTURE — not part of the product.
 *
 * What used to live here: a role switch and a membership move, both existing only because
 * signup created an `admin` of a brand-new organization and nothing could put a second
 * person into an existing one. Spec 04's invitation flow retired both, exactly as their
 * own comments said it would — a test now invites a member the way a person does, and
 * changes a role through `PUT .../members/:memberId`.
 *
 * What is left is the one fixture no product feature retires, because nothing in the
 * product ages an envelope and nothing should.
 *
 * It is fenced twice — `assertFixturesOpen` for the environment, `resolveFixtureScope`
 * for the caller — and answers 404 to everything else. Read the comment at the top of
 * `fixture-gate.ts` before changing either.
 */
import { Body, Controller, Headers, HttpCode, NotFoundException, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma.service';
import { SessionService } from '../auth/session.service';
import { assertFixturesOpen, resolveFixtureScope } from './fixture-gate';

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

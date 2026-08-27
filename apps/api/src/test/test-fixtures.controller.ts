import { Body, Controller, HttpCode, NotFoundException, Post } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { InMemoryMailService } from '../mail/in-memory-mail.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';

/** Cheap on purpose — these hashes never protect a real credential. */
const BCRYPT_ROUNDS = 4;

/**
 * Test-only fixtures for states an E2E run cannot reach over the public HTTP surface.
 * Fenced exactly like `TestMailController`: both endpoints 404 whenever `NODE_ENV` is
 * production or the app isn't running the in-memory mail sink, so a real deployment
 * never exposes them regardless of how `NODE_ENV` happens to be set.
 */
@Controller('api/test')
export class TestFixturesController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  private guard(): void {
    if (process.env.NODE_ENV === 'production' || !(this.mail instanceof InMemoryMailService)) {
      throw new NotFoundException();
    }
  }

  /**
   * Forces a pending invitation into the expired state. E2E tests have no direct
   * database access and there is no product-facing way to fast-forward seven days, so
   * spec 03's "expired invitation link" case needs this to manufacture its precondition
   * (mirrors how the backend integration suite does it directly via Prisma).
   */
  @Post('invitations/expire')
  @HttpCode(200)
  async expireInvitation(@Body() body: { email?: unknown }) {
    this.guard();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) throw new NotFoundException();

    const result = await this.prisma.invitation.updateMany({
      where: { email, status: 'pending' },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    if (result.count === 0) throw new NotFoundException();
    return { message: 'expired' };
  }

  /**
   * Forces a pending email change into the expired state. Mirrors `expireInvitation`:
   * E2E tests cannot fast-forward 24 hours nor touch the database directly, so spec
   * 06's "expired confirmation link" case needs this to manufacture its precondition.
   *
   * The record is identified by its `newEmail` (the address the E2E requested the
   * change TO) — that is the value the E2E holds, since the confirmation link and the
   * mail sink are both keyed by the new address.
   */
  @Post('email-change/expire')
  @HttpCode(200)
  async expireEmailChange(@Body() body: { email?: unknown }) {
    this.guard();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) throw new NotFoundException();

    const result = await this.prisma.pendingEmailChange.updateMany({
      where: { newEmail: email, usedAt: null, isInvalidated: false },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    if (result.count === 0) throw new NotFoundException();
    return { message: 'expired' };
  }

  /**
   * Creates an account with a password but no organization membership at all — the
   * "existing account, not yet affiliated with any org" state spec 03's plain
   * existing-account-accept case needs. Every account reachable through the public API
   * (signup, invitation acceptance) gets a membership in the same transaction that
   * creates the account, so this state is otherwise unreachable over HTTP.
   */
  @Post('accounts')
  @HttpCode(200)
  async createBareAccount(
    @Body()
    body: {
      email?: unknown;
      password?: unknown;
      firstName?: unknown;
      lastName?: unknown;
    },
  ) {
    this.guard();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!email || !password) throw new NotFoundException();

    const firstName = typeof body?.firstName === 'string' && body.firstName ? body.firstName : 'Pat';
    const lastName = typeof body?.lastName === 'string' && body.lastName ? body.lastName : 'Other';
    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    const account = await this.prisma.account.create({
      data: { email, passwordHash, firstName, lastName },
    });
    return { id: account.id, email: account.email };
  }

  /**
   * Backdates every `MemberFinancialsSnapshot` of the member behind `email` to
   * `effectiveFrom` (a 'YYYY-MM-DD' date). Spec 08's E2E needs a clean full-month accrual
   * scenario: configure financials today, then backdate the snapshot to before the billing
   * month so the run produces a full (non-prorated) credit. E2E tests have no direct
   * database access, so this is the only way to manufacture that precondition over HTTP.
   */
  @Post('financials/backdate')
  @HttpCode(200)
  async backdateFinancials(@Body() body: { email?: unknown; effectiveFrom?: unknown }) {
    this.guard();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const effectiveFrom = typeof body?.effectiveFrom === 'string' ? body.effectiveFrom.trim() : '';
    if (!email || !effectiveFrom) throw new NotFoundException();

    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { memberships: true },
    });
    const membership = account?.memberships[0];
    if (!membership) throw new NotFoundException();

    const result = await this.prisma.memberFinancialsSnapshot.updateMany({
      where: { membershipId: membership.id },
      data: { effectiveFrom: new Date(`${effectiveFrom}T00:00:00.000Z`) },
    });
    if (result.count === 0) throw new NotFoundException();
    return { message: 'backdated', count: result.count };
  }

  /**
   * Seeds a vacation reserve `credit` transaction of an exact amount for the member
   * behind `email`. Spec 09's E2E needs precise balance preconditions ("exactly N
   * available days"), but the accrual engine only produces formula-derived amounts and
   * E2E tests have no direct database access. `createdAt` defaults to now, so the credit
   * lands in the current calendar year and counts toward the live reserve balance.
   */
  @Post('vacation/seed-credit')
  @HttpCode(200)
  async seedCredit(@Body() body: { email?: unknown; amount?: unknown }) {
    this.guard();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    const amount = typeof body?.amount === 'number' ? body.amount : Number(body?.amount);
    if (!email || !Number.isFinite(amount)) throw new NotFoundException();

    const account = await this.prisma.account.findUnique({
      where: { email },
      include: { memberships: true },
    });
    const membership = account?.memberships[0];
    if (!membership) throw new NotFoundException();

    const tx = await this.prisma.vacationReserveTransaction.create({
      data: {
        membershipId: membership.id,
        type: 'credit',
        amount,
        isAutoGenerated: true,
        description: 'Test seed credit',
      },
    });
    return { id: tx.id };
  }
}

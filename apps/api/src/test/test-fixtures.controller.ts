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
}

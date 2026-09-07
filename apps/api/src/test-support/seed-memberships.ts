/**
 * TEST-SUPPORT FIXTURE — not part of the product.
 *
 * **A module, and deliberately not a controller.** Every other file in this directory is a
 * route because an E2E browser had no other way to reach the state it needed; this one is
 * called from an integration test that already holds the `PrismaService`, and time off spec
 * 03 adds no route at all. Nothing registers it in `app.module.ts`, so it reaches no
 * deployed surface and needs no fence in front of it.
 *
 * What it exists for: the calendar refuses a view that resolves to more than
 * `TIME_OFF_CALENDAR_MAX_MEMBERS` rows, and with the empty-selection refusals withdrawn
 * (REQ-03-003) that cap is the refusal an empty Teams or People selection now meets in a
 * large organization — Edge case 1, the one state the suite could not reach because no
 * fixture seeded a hundred people.
 */
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma.service';

/** Cheap on purpose — nothing here logs in, and the cost factor is not what is under test. */
const SEED_BCRYPT_ROUNDS = 4;

export interface SeededMembership {
  accountId: string;
  membershipId: string;
  email: string;
}

/**
 * Seeds `count` accounts, each with one membership in `organizationId`.
 *
 * The emails are namespaced by `prefix` and by the position, so two calls inside one test
 * do not collide on the unique email column. The rows are created one at a time rather than
 * in a `createMany`, because a membership needs the account id the insert before it
 * produced.
 */
export async function seedMemberships(
  prisma: PrismaService,
  organizationId: string,
  count: number,
  options: { prefix?: string; role?: string; status?: string } = {},
): Promise<SeededMembership[]> {
  const prefix = options.prefix ?? 'seeded';
  const passwordHash = await bcrypt.hash('Passw0rd', SEED_BCRYPT_ROUNDS);
  const seeded: SeededMembership[] = [];

  for (let index = 0; index < count; index += 1) {
    const email = `${prefix}-${index}@seed.test`;
    const account = await prisma.account.create({
      data: {
        email,
        passwordHash,
        firstName: `Seed${String(index).padStart(3, '0')}`,
        lastName: 'Member',
      },
    });
    const membership = await prisma.membership.create({
      data: {
        accountId: account.id,
        organizationId,
        role: options.role ?? 'user',
        status: options.status ?? 'active',
      },
    });
    seeded.push({ accountId: account.id, membershipId: membership.id, email });
  }

  return seeded;
}

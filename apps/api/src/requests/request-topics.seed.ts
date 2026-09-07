import type { Prisma } from '@prisma/client';

/** One row of the default catalogue. */
export interface RequestTopicSeedRow {
  audience: 'staff' | 'client';
  type: 'access' | 'question';
  name: string;
  sortOrder: number;
}

/**
 * Requests spec 02 "Seed Data" — the catalogue every organization is born with
 * (REQ-02-015) and the one the backfill migration gives to every organization that
 * predates the spec (REQ-02-016). The two must stay identical, which is why the list is
 * one constant here and one `VALUES` clause in
 * `prisma/migrations/…_requests_02_request_topics_backfill/migration.sql`.
 *
 * The staff set is wider than VPN, Claude, Question and Other because it also names the
 * access kinds the retired `accessKind` dial offered, so an organization that classified
 * requests by that dial finds the same words in the catalogue and types none of them into
 * Settings before its next request. A seeded row an organization does not want is
 * archived from its row in Settings; a word the seed omits has to be typed there first.
 *
 * Every row is the organization's own from the moment it is written: renaming or
 * archiving one is an ordinary edit, and the seed is never re-applied.
 */
export const REQUEST_TOPIC_SEED: readonly RequestTopicSeedRow[] = [
  { audience: 'staff', type: 'access', name: 'VPN', sortOrder: 10 },
  { audience: 'staff', type: 'access', name: 'Claude', sortOrder: 20 },
  { audience: 'staff', type: 'access', name: 'Repository', sortOrder: 30 },
  { audience: 'staff', type: 'access', name: 'Environment', sortOrder: 40 },
  { audience: 'staff', type: 'access', name: 'Server', sortOrder: 50 },
  { audience: 'staff', type: 'access', name: 'Admin panel', sortOrder: 60 },
  { audience: 'staff', type: 'access', name: 'Documentation', sortOrder: 70 },
  { audience: 'staff', type: 'question', name: 'Question', sortOrder: 80 },
  { audience: 'staff', type: 'question', name: 'Other', sortOrder: 90 },
  { audience: 'client', type: 'access', name: 'Access', sortOrder: 10 },
  { audience: 'client', type: 'question', name: 'Other', sortOrder: 20 },
];

/**
 * Writes the default catalogue for one organization, inside the caller's transaction.
 *
 * `organizationId` is a required argument with no default (REQ-02-001). There is no
 * session at signup time and nobody created these rows, so `createdByAccountId` is left
 * null on every one of them.
 *
 * Called from the transaction that creates the `Organization` row, so a failure here
 * rolls the organization back rather than producing one without a catalogue
 * (REQ-02-015).
 */
export async function seedRequestTopics(
  tx: Prisma.TransactionClient,
  organizationId: string,
): Promise<void> {
  await tx.requestTopic.createMany({
    data: REQUEST_TOPIC_SEED.map((row) => ({
      organizationId,
      audience: row.audience,
      type: row.type,
      name: row.name,
      sortOrder: row.sortOrder,
      status: 'active',
      createdByAccountId: null,
    })),
  });
}

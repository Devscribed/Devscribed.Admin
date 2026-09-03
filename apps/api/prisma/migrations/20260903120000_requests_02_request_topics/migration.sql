-- Requests spec 02 — Request Topics & Vocabulary. Introduces the `RequestTopic` entity,
-- its (organizationId, audience, LOWER(name)) case-insensitive uniqueness index (Prisma
-- cannot express a functional unique — added by hand, the device `Client` already uses),
-- and the two nullable `Request` columns that carry the chosen topic and the snapshot of
-- its name.
--
-- Strictly additive: no existing column is altered, nothing is renamed or dropped, no
-- existing table gains a NOT NULL column, and no row is written. The backfill lives in
-- its own migration file beside this one, so a test can execute it by path.

-- CreateTable
CREATE TABLE "RequestTopic" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "audience" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" VARCHAR(60) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByAccountId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "archivedByAccountId" TEXT,

    CONSTRAINT "RequestTopic_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the picker's query: one audience of one organization, active only.
CREATE INDEX "RequestTopic_organizationId_audience_status_idx" ON "RequestTopic" ("organizationId", "audience", "status");

-- CreateIndex (functional, case-insensitive uniqueness of a topic name per organization
-- and audience — REQ-02-006 / TC-02-INT-05). Prisma cannot express a LOWER(name) unique
-- index in the schema, so it is added by hand here. This DB-level constraint is the race
-- backstop that makes two concurrent renames to one name resolve to exactly one 200 and
-- one 409 (edge case 1, TC-02-INT-16): the loser's P2002 is mapped to nameDuplicate.
CREATE UNIQUE INDEX "RequestTopic_organizationId_audience_name_lower_key" ON "RequestTopic" ("organizationId", "audience", LOWER("name"));

-- AddForeignKey — RequestTopic → Organization (cascade delete follows the organization).
ALTER TABLE "RequestTopic" ADD CONSTRAINT "RequestTopic_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — RequestTopic.createdByAccountId (audit; null on every seeded row).
ALTER TABLE "RequestTopic" ADD CONSTRAINT "RequestTopic_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey — RequestTopic.archivedByAccountId (audit; cleared on restore).
ALTER TABLE "RequestTopic" ADD CONSTRAINT "RequestTopic_archivedByAccountId_fkey" FOREIGN KEY ("archivedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable — the two Request columns (REQ-02-018, REQ-02-023). Both nullable, so every
-- request raised before this spec stays valid and needs no backfill.
ALTER TABLE "Request" ADD COLUMN "topicId" TEXT;
ALTER TABLE "Request" ADD COLUMN "topicLabel" VARCHAR(60);

-- AddForeignKey — Request.topicId. SET NULL is the correct semantics for a hard delete of
-- a topic, which no route this spec exposes performs (REQ-02-014); the state it would
-- leave — a topicLabel with no topicId — is one the serializer still answers for.
ALTER TABLE "Request" ADD CONSTRAINT "Request_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "RequestTopic"("id") ON DELETE SET NULL ON UPDATE CASCADE;

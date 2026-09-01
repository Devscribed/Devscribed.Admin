-- Spec organization/01 — Clients. Introduces the `Client` entity, the optional
-- `Project.clientId` FK, the (organizationId, LOWER(name)) case-insensitive
-- uniqueness index (Prisma cannot express a functional unique — added by hand),
-- and a partial index on `Project.clientId` for the projectCount groupBy.
-- Strictly additive: no existing column is altered, no data is backfilled.

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByAccountId" TEXT NOT NULL,
    "archivedAt" TIMESTAMP(3),
    "archivedByAccountId" TEXT,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — list filters commonly narrow by status per org (spec §16, §18).
CREATE INDEX "Client_organizationId_status_idx" ON "Client" ("organizationId", "status");

-- CreateIndex (functional, case-insensitive uniqueness of client name per org — spec
-- requirement 3 / TC-01-INT-05..07). Prisma cannot express a LOWER(name) unique index in
-- the schema, so it is added by hand here. This DB-level constraint is the race backstop
-- that guarantees concurrent duplicate creates resolve to exactly one 201 + one 409
-- (a P2002 the service maps to client_name_taken).
CREATE UNIQUE INDEX "Client_organizationId_name_lower_key" ON "Client" ("organizationId", LOWER("name"));

-- AlterTable — the optional Project → Client FK (spec Data Model / requirement 11).
-- ON DELETE SET NULL never fires through the API (there is no hard delete of a client),
-- but is kept as the correct semantics for a future admin script or direct DB cleanup.
ALTER TABLE "Project" ADD COLUMN "clientId" TEXT;

-- CreateIndex — partial: most projects will have no client, so an index on the small
-- subset that do is what keeps the projectCount / activeProjectCount groupBy cheap
-- while leaving the write cost on unlinked projects at zero.
CREATE INDEX "Project_clientId_idx" ON "Project" ("clientId") WHERE "clientId" IS NOT NULL;

-- AddForeignKey — Client → Organization (cascade delete follows the organization).
ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — Client.createdByAccountId (audit; block account delete while referenced).
ALTER TABLE "Client" ADD CONSTRAINT "Client_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey — Client.archivedByAccountId (audit; nullable, block delete while set).
ALTER TABLE "Client" ADD CONSTRAINT "Client_archivedByAccountId_fkey" FOREIGN KEY ("archivedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey — Project.clientId (nullable; SET NULL on hard delete, which never
-- happens through the API — soft archive preserves the FK per requirement 13).
ALTER TABLE "Project" ADD CONSTRAINT "Project_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

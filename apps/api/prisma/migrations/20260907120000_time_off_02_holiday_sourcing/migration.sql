-- Time off spec 02 — Holiday sourcing. Two new tables and three new columns on
-- `Holiday`: where a row came from (`source`), the provider's stable key for it
-- (`externalKey`) and when an import wrote it (`importedAt`).
--
-- Strictly additive. No rename, no drop, no new NOT NULL on an existing table and no
-- backfill: every existing `Holiday` row reads `source = 'manual'` from the default,
-- which is exactly what those rows are, and both new columns read NULL.
--
-- `infra/deploy.sh:27` runs migrations as a one-off task on the NEW image BEFORE the
-- Terraform rollout, so the schema is always ahead of the code that uses it. Additive is
-- what makes the reverse direction survivable too — old code against this schema selects
-- none of the columns below — which is why a rollback needs no database rollback.

-- AlterTable — Holiday gains its provenance.
ALTER TABLE "Holiday" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Holiday" ADD COLUMN "externalKey" TEXT;
ALTER TABLE "Holiday" ADD COLUMN "importedAt" TIMESTAMP(3);

-- CreateTable — that a (organization, country, year) has been sourced, and what the
-- provider offered for it.
CREATE TABLE "HolidayImport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "countryCode" CHAR(2) NOT NULL,
    "year" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "holidayCount" INTEGER NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HolidayImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — invariant 3, at most one import record per (organization, country,
-- year). The index is the arbiter rather than the service: two admins syncing one
-- unsourced year at the same instant is resolved by letting the loser collide
-- (Edge case 12), not by a lock nobody else on this table takes.
CREATE UNIQUE INDEX "HolidayImport_organizationId_countryCode_year_key" ON "HolidayImport" ("organizationId", "countryCode", "year");

-- CreateTable — the include-organization-country checkbox, one row per organization.
-- A missing row reads as `true` in the service (REQ-02-002), so nothing is backfilled
-- and no organization changes behaviour before somebody touches the control.
CREATE TABLE "OrganizationHolidaySourcing" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "includeOrgCountry" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAccountId" TEXT NOT NULL,

    CONSTRAINT "OrganizationHolidaySourcing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OrganizationHolidaySourcing_organizationId_key" ON "OrganizationHolidaySourcing" ("organizationId");

-- AddForeignKey — both new tables die with the organization.
ALTER TABLE "HolidayImport" ADD CONSTRAINT "HolidayImport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrganizationHolidaySourcing" ADD CONSTRAINT "OrganizationHolidaySourcing_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — who set the checkbox (audit; block account delete while referenced).
ALTER TABLE "OrganizationHolidaySourcing" ADD CONSTRAINT "OrganizationHolidaySourcing_updatedByAccountId_fkey" FOREIGN KEY ("updatedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Portal spec 01 — the team overview. One new table, `OrganizationPortalSettings`:
-- which of the three news groups (People, Hiring, Work) the feed derives entries for.
--
-- Strictly additive. One CREATE TABLE and one foreign key. No column is added to an
-- existing table, nothing is renamed, nothing is dropped, no existing column gains
-- NOT NULL, and nothing is backfilled — the absence of a row reads as all three groups
-- enabled (REQ-01-049), so every organization that predates this migration keeps the
-- behaviour it would have had with a row of defaults, and signup writes nothing.
--
-- `infra/deploy.sh:27` runs migrations as a one-off task on the NEW image BEFORE the
-- Terraform rollout, so this table exists before any code queries it. Additive is what
-- makes the reverse direction survivable too — rolled-back code simply never selects a
-- table it does not know about — which is why a rollback needs no database rollback.

-- CreateTable — one row per organization, written only by PUT .../portal/settings.
CREATE TABLE "OrganizationPortalSettings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "peopleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "hiringEnabled" BOOLEAN NOT NULL DEFAULT true,
    "workEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrganizationPortalSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — one row per organization. The unique key is what makes REQ-01-051's
-- create-or-update a single-statement upsert, which is the whole of its atomicity.
CREATE UNIQUE INDEX "OrganizationPortalSettings_organizationId_key" ON "OrganizationPortalSettings" ("organizationId");

-- AddForeignKey — the row dies with the organization.
ALTER TABLE "OrganizationPortalSettings" ADD CONSTRAINT "OrganizationPortalSettings_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

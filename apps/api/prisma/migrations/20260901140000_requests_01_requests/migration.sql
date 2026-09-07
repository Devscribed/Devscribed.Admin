-- Requests spec 01 — Requests. Three new tables (Request, RequestMessage, RequestEvent)
-- and one new column with a default (Organization.nextRequestNumber).
--
-- Strictly additive: no rename, no drop, no new NOT NULL on an existing table and no
-- backfill. `infra/deploy.sh` runs the migration as a one-off task on the NEW image and
-- only then `tf apply`s the services, so this schema is live while the PREVIOUS image is
-- still serving — three unreferenced tables and one defaulted column are invisible to it.

-- AlterTable — the per-organization request counter, allocated under FOR UPDATE
-- (requirement 10). The default is what makes a backfill unnecessary.
ALTER TABLE "Organization" ADD COLUMN "nextRequestNumber" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "accessKind" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "projectId" TEXT,
    "requesterMembershipId" TEXT NOT NULL,
    "assigneeKind" TEXT NOT NULL,
    "assigneeMembershipId" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "blocking" BOOLEAN NOT NULL DEFAULT false,
    "neededBy" DATE,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "answeredAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAccountId" TEXT,
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Request_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "authorKind" TEXT NOT NULL,
    "authorMembershipId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RequestEvent" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "actorKind" TEXT NOT NULL,
    "actorMembershipId" TEXT,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "oldLabel" TEXT,
    "newLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the human-readable number is unique within its organization
-- (requirement 10 / AC-4, and the DB-level backstop for concurrent allocation).
CREATE UNIQUE INDEX "Request_organizationId_number_key" ON "Request" ("organizationId", "number");

-- CreateIndex — the list's scope/filter shapes.
CREATE INDEX "Request_organizationId_status_idx" ON "Request" ("organizationId", "status");
CREATE INDEX "Request_organizationId_assigneeMembershipId_status_idx" ON "Request" ("organizationId", "assigneeMembershipId", "status");
CREATE INDEX "Request_organizationId_lastActivityAt_idx" ON "Request" ("organizationId", "lastActivityAt");

-- CreateIndex — thread and trail are both read in creation order for one request.
CREATE INDEX "RequestMessage_requestId_createdAt_idx" ON "RequestMessage" ("requestId", "createdAt");
CREATE INDEX "RequestEvent_requestId_createdAt_idx" ON "RequestEvent" ("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "Request" ADD CONSTRAINT "Request_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_requesterMembershipId_fkey" FOREIGN KEY ("requesterMembershipId") REFERENCES "Membership" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_assigneeMembershipId_fkey" FOREIGN KEY ("assigneeMembershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_resolvedByAccountId_fkey" FOREIGN KEY ("resolvedByAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_authorMembershipId_fkey" FOREIGN KEY ("authorMembershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorMembershipId_fkey" FOREIGN KEY ("actorMembershipId") REFERENCES "Membership" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

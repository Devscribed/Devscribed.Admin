-- Requests spec 03 — Client Participants & Client-Addressed Requests.
--
-- Two new tables and four nullable columns. Strictly additive: no column changes type or
-- nullability, nothing is renamed or dropped, no NOT NULL is added to an existing table,
-- and no data is backfilled. The migrate step runs on the new image before the services
-- roll out, so the PREVIOUS code serves against this schema for a window — two
-- unreferenced tables and four nullable columns are invisible to it.

-- CreateTable — the client-contact principal (REQ-03-001).
CREATE TABLE "ClientMembership" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "invitedByMembershipId" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedByAccountId" TEXT,

    CONSTRAINT "ClientMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — one client contact per account. The backstop for two concurrent accepts
-- of the same address; it says nothing about the staff row, which is a rule enforced at
-- both writes (REQ-03-014, REQ-03-042).
CREATE UNIQUE INDEX "ClientMembership_accountId_key" ON "ClientMembership" ("accountId");

-- CreateIndex — the organization-scoped and client-scoped list reads.
CREATE INDEX "ClientMembership_organizationId_status_idx" ON "ClientMembership" ("organizationId", "status");
CREATE INDEX "ClientMembership_clientId_status_idx" ON "ClientMembership" ("clientId", "status");

-- CreateTable — the notification outbox (REQ-03-035).
CREATE TABLE "RequestNotification" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "recipientKind" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'none',
    "providerKey" TEXT,
    "providerRef" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RequestNotification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — REQ-03-039's mechanism: a replayed event cannot manufacture a second row.
CREATE UNIQUE INDEX "RequestNotification_eventId_recipientKind_recipientId_key" ON "RequestNotification" ("eventId", "recipientKind", "recipientId");

-- CreateIndex — the dispatcher's query.
CREATE INDEX "RequestNotification_organizationId_status_createdAt_idx" ON "RequestNotification" ("organizationId", "status", "createdAt");

-- AlterTable — the four nullable columns.
ALTER TABLE "Invitation" ADD COLUMN "clientId" TEXT;
ALTER TABLE "Request" ADD COLUMN "assigneeClientMembershipId" TEXT;
ALTER TABLE "RequestMessage" ADD COLUMN "authorClientMembershipId" TEXT;
ALTER TABLE "RequestEvent" ADD COLUMN "actorClientMembershipId" TEXT;

-- AddForeignKey — ClientMembership's four references.
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_invitedByMembershipId_fkey" FOREIGN KEY ("invitedByMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ClientMembership" ADD CONSTRAINT "ClientMembership_removedByAccountId_fkey" FOREIGN KEY ("removedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey — the outbox. `recipientId` deliberately carries no foreign key, so a
-- notification survives the principal it points at being removed.
ALTER TABLE "RequestNotification" ADD CONSTRAINT "RequestNotification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestNotification" ADD CONSTRAINT "RequestNotification_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "Request"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RequestNotification" ADD CONSTRAINT "RequestNotification_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "RequestEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — the four nullable columns.
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Request" ADD CONSTRAINT "Request_assigneeClientMembershipId_fkey" FOREIGN KEY ("assigneeClientMembershipId") REFERENCES "ClientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestMessage" ADD CONSTRAINT "RequestMessage_authorClientMembershipId_fkey" FOREIGN KEY ("authorClientMembershipId") REFERENCES "ClientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "RequestEvent" ADD CONSTRAINT "RequestEvent_actorClientMembershipId_fkey" FOREIGN KEY ("actorClientMembershipId") REFERENCES "ClientMembership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Documents spec 04 — Signature Providers & SignWell.
--
-- Every statement here is additive: new columns with defaults, one new table, two new
-- enum values. No renames, no drops, no new NOT NULL on an existing table. That is what
-- makes `make deploy-<env>` sound, since it rolls the services out BEFORE running
-- `prisma migrate deploy` — the already-running code must tolerate this schema, and the
-- new code must tolerate the old one.

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum. Postgres here is 17, where both values in one
-- transaction is supported as long as neither is *used* in it.
ALTER TYPE "EnvelopeEventType" ADD VALUE 'provider_synced';
ALTER TYPE "EnvelopeEventType" ADD VALUE 'provider_error';

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "signatureProviderKey" TEXT NOT NULL DEFAULT 'internal',
ADD COLUMN     "signatureProviderSetAt" TIMESTAMP(3),
ADD COLUMN     "signatureProviderSetBy" TEXT;

-- AlterTable
ALTER TABLE "Envelope" ADD COLUMN     "providerTestMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "providerSyncedAt" TIMESTAMP(3),
ADD COLUMN     "providerError" TEXT;

-- AlterTable
ALTER TABLE "EnvelopeSigner" ADD COLUMN     "providerRef" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "ProviderWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "providerRef" TEXT NOT NULL,
    "envelopeId" TEXT,
    "eventType" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL,
    "relatedSignerEmail" TEXT NOT NULL DEFAULT '',
    "hashVerified" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWebhookEvent_providerKey_providerRef_eventType_even_key" ON "ProviderWebhookEvent"("providerKey", "providerRef", "eventType", "eventTime", "relatedSignerEmail");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_processedAt_idx" ON "ProviderWebhookEvent"("processedAt");

-- CreateIndex
CREATE INDEX "ProviderWebhookEvent_envelopeId_idx" ON "ProviderWebhookEvent"("envelopeId");

-- AddForeignKey
ALTER TABLE "Organization" ADD CONSTRAINT "Organization_signatureProviderSetBy_fkey" FOREIGN KEY ("signatureProviderSetBy") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderWebhookEvent" ADD CONSTRAINT "ProviderWebhookEvent_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE SET NULL ON UPDATE CASCADE;

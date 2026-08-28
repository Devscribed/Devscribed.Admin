-- CreateEnum
CREATE TYPE "EnvelopeStatus" AS ENUM ('draft', 'sent', 'partially_signed', 'completed', 'declined', 'voided', 'expired');

-- CreateEnum
CREATE TYPE "SignerStatus" AS ENUM ('pending', 'notified', 'viewed', 'signed', 'declined');

-- CreateEnum
CREATE TYPE "SignatureType" AS ENUM ('drawn', 'typed');

-- CreateEnum
CREATE TYPE "PdfStatus" AS ENUM ('not_required', 'pending', 'ready', 'failed');

-- CreateEnum
CREATE TYPE "EnvelopeEventType" AS ENUM ('created', 'sent', 'email_accepted', 'email_delivered', 'email_bounced', 'viewed', 'signed', 'declined', 'reminded', 'voided', 'expired', 'completed', 'downloaded', 'pdf_failed', 'tamper_detected');

-- CreateTable
CREATE TABLE "Envelope" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "EnvelopeStatus" NOT NULL DEFAULT 'draft',
    "fieldValues" JSONB NOT NULL DEFAULT '{}',
    "renderedHtml" TEXT,
    "documentHash" TEXT,
    "signedPdfKey" TEXT,
    "signedPdfHash" TEXT,
    "pdfStatus" "PdfStatus" NOT NULL DEFAULT 'not_required',
    "subjectMembershipId" TEXT,
    "providerKey" TEXT NOT NULL DEFAULT 'internal',
    "providerRef" TEXT NOT NULL DEFAULT '',
    "expiresAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidedByAccountId" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByAccountId" TEXT NOT NULL,

    CONSTRAINT "Envelope_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeSigner" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL,
    "status" "SignerStatus" NOT NULL DEFAULT 'pending',
    "membershipId" TEXT,
    "signedAt" TIMESTAMP(3),
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "signatureImage" TEXT,
    "signatureType" "SignatureType",
    "signatureTypedName" TEXT,
    "consentAcceptedAt" TIMESTAMP(3),

    CONSTRAINT "EnvelopeSigner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningToken" (
    "id" TEXT NOT NULL,
    "envelopeSignerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "isInvalidated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SigningToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EnvelopeEvent" (
    "id" TEXT NOT NULL,
    "envelopeId" TEXT NOT NULL,
    "envelopeSignerId" TEXT,
    "type" "EnvelopeEventType" NOT NULL,
    "actorAccountId" TEXT,
    "actorEmail" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "documentHash" TEXT,
    "metadata" JSONB,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "previousEventHash" TEXT,
    "eventHash" TEXT NOT NULL,

    CONSTRAINT "EnvelopeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Envelope_organizationId_status_idx" ON "Envelope"("organizationId", "status");

-- CreateIndex
CREATE INDEX "Envelope_templateVersionId_idx" ON "Envelope"("templateVersionId");

-- CreateIndex
CREATE INDEX "EnvelopeSigner_envelopeId_idx" ON "EnvelopeSigner"("envelopeId");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeSigner_envelopeId_roleKey_key" ON "EnvelopeSigner"("envelopeId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "EnvelopeSigner_envelopeId_order_key" ON "EnvelopeSigner"("envelopeId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "SigningToken_tokenHash_key" ON "SigningToken"("tokenHash");

-- CreateIndex
CREATE INDEX "SigningToken_envelopeSignerId_idx" ON "SigningToken"("envelopeSignerId");

-- CreateIndex
CREATE INDEX "EnvelopeEvent_envelopeId_occurredAt_idx" ON "EnvelopeEvent"("envelopeId", "occurredAt");

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "DocumentTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_subjectMembershipId_fkey" FOREIGN KEY ("subjectMembershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Envelope" ADD CONSTRAINT "Envelope_voidedByAccountId_fkey" FOREIGN KEY ("voidedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeSigner" ADD CONSTRAINT "EnvelopeSigner_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeSigner" ADD CONSTRAINT "EnvelopeSigner_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningToken" ADD CONSTRAINT "SigningToken_envelopeSignerId_fkey" FOREIGN KEY ("envelopeSignerId") REFERENCES "EnvelopeSigner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeEvent" ADD CONSTRAINT "EnvelopeEvent_envelopeId_fkey" FOREIGN KEY ("envelopeId") REFERENCES "Envelope"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeEvent" ADD CONSTRAINT "EnvelopeEvent_envelopeSignerId_fkey" FOREIGN KEY ("envelopeSignerId") REFERENCES "EnvelopeSigner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EnvelopeEvent" ADD CONSTRAINT "EnvelopeEvent_actorAccountId_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;


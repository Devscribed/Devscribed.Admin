-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "firstDayOfWeek" TEXT NOT NULL DEFAULT 'Monday',
ADD COLUMN     "phoneCountryCode" TEXT,
ADD COLUMN     "phoneNumber" TEXT;

-- CreateTable
CREATE TABLE "PendingEmailChange" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "isInvalidated" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PendingEmailChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingEmailChange_tokenHash_key" ON "PendingEmailChange"("tokenHash");

-- CreateIndex
CREATE INDEX "PendingEmailChange_accountId_isInvalidated_idx" ON "PendingEmailChange"("accountId", "isInvalidated");

-- AddForeignKey
ALTER TABLE "PendingEmailChange" ADD CONSTRAINT "PendingEmailChange_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

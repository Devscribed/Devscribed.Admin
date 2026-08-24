-- CreateTable
CREATE TABLE "MemberProfile" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "addressLine" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "country" TEXT,
    "taxId" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "idDocumentNumber" TEXT,
    "bankDetails" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAccountId" TEXT,

    CONSTRAINT "MemberProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberProfile_membershipId_key" ON "MemberProfile"("membershipId");

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberProfile" ADD CONSTRAINT "MemberProfile_updatedByAccountId_fkey" FOREIGN KEY ("updatedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;


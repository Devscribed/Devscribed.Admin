-- CreateTable
CREATE TABLE "MemberFinancials" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "monthlySalary" DECIMAL(10,2) NOT NULL,
    "clientHourlyRate" DECIMAL(8,2) NOT NULL,
    "vacationReservePercent" DECIMAL(5,2) NOT NULL,
    "isReservePercentManual" BOOLEAN NOT NULL,
    "vacationDaysPerYear" INTEGER NOT NULL DEFAULT 20,
    "currency" VARCHAR(3) NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedByAccountId" TEXT NOT NULL,

    CONSTRAINT "MemberFinancials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MemberFinancialsSnapshot" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "monthlySalary" DECIMAL(10,2) NOT NULL,
    "clientHourlyRate" DECIMAL(8,2) NOT NULL,
    "vacationReservePercent" DECIMAL(5,2) NOT NULL,
    "isReservePercentManual" BOOLEAN NOT NULL,
    "vacationDaysPerYear" INTEGER NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "effectiveFrom" DATE NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MemberFinancialsSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MemberFinancials_membershipId_key" ON "MemberFinancials"("membershipId");

-- CreateIndex
CREATE INDEX "MemberFinancialsSnapshot_membershipId_idx" ON "MemberFinancialsSnapshot"("membershipId");

-- AddForeignKey
ALTER TABLE "MemberFinancials" ADD CONSTRAINT "MemberFinancials_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFinancials" ADD CONSTRAINT "MemberFinancials_updatedByAccountId_fkey" FOREIGN KEY ("updatedByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MemberFinancialsSnapshot" ADD CONSTRAINT "MemberFinancialsSnapshot_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

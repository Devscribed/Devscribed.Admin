-- CreateTable
CREATE TABLE "VacationRequest" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "workingDays" INTEGER NOT NULL,
    "deductionAmount" DECIMAL(12,2) NOT NULL,
    "status" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedByAccountId" TEXT,
    "reviewerComment" VARCHAR(500),
    "cancelledAt" TIMESTAMP(3),
    "cancelledByAccountId" TEXT,

    CONSTRAINT "VacationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VacationRequest_membershipId_idx" ON "VacationRequest"("membershipId");

-- AddForeignKey
ALTER TABLE "VacationReserveTransaction" ADD CONSTRAINT "VacationReserveTransaction_vacationRequestId_fkey" FOREIGN KEY ("vacationRequestId") REFERENCES "VacationRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_reviewedByAccountId_fkey" FOREIGN KEY ("reviewedByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacationRequest" ADD CONSTRAINT "VacationRequest_cancelledByAccountId_fkey" FOREIGN KEY ("cancelledByAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

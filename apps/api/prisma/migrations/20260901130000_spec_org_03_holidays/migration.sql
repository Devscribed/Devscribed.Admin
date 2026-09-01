-- Spec organization/03 — Holidays. Introduces the `Holiday` entity, its two
-- uniqueness indexes and its range index. Strictly additive: one new table, no
-- existing column is altered or dropped and no data is backfilled, so a rollback
-- (old code against this schema) needs no database rollback.

-- CreateTable
CREATE TABLE "Holiday" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "paidHours" DECIMAL(4,2) NOT NULL DEFAULT 8.00,
    "countryCode" CHAR(2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByAccountId" TEXT NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex — the year filter and the calendar's visible-range read both narrow
-- by (organization, date), which is also the prefix the list's ORDER BY date uses.
CREATE INDEX "Holiday_organizationId_date_idx" ON "Holiday" ("organizationId", "date");

-- CreateIndex — primary uniqueness (spec requirement 5). Postgres treats every NULL
-- as distinct, so this constraint alone permits TWO global holidays on the same date;
-- the partial index below is what closes that hole. Both are required.
CREATE UNIQUE INDEX "Holiday_organizationId_date_countryCode_key" ON "Holiday" ("organizationId", "date", "countryCode");

-- CreateIndex (partial unique — Prisma cannot express a WHERE clause on an index, so
-- it is written by hand). Exactly one global (countryCode IS NULL) holiday per date
-- per organization. Together with the constraint above: same date + same country → 409,
-- same date + both NULL → 409, same date + one NULL one country → both succeed
-- (TC-03-INT-04/05/06/07). A single expression index on
-- (organizationId, date, (countryCode IS NULL)) cannot satisfy both cases.
CREATE UNIQUE INDEX "Holiday_org_date_globalUniq" ON "Holiday" ("organizationId", "date") WHERE "countryCode" IS NULL;

-- AddForeignKey — Holiday → Organization (the calendar dies with the organization).
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey — Holiday.createdByAccountId (audit; block account delete while referenced).
ALTER TABLE "Holiday" ADD CONSTRAINT "Holiday_createdByAccountId_fkey" FOREIGN KEY ("createdByAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

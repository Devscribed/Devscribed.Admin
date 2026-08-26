-- The first of the two org-wide libraries (hiring 06 §02). Categories carry
-- `organizationId` from this, their first migration — nothing hiring writes is ever
-- retrofitted with a scope (hiring 00).

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VacancyCategory" (
    "vacancyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VacancyCategory_pkey" PRIMARY KEY ("vacancyId","categoryId")
);

-- CreateIndex
CREATE INDEX "Category_organizationId_idx" ON "Category"("organizationId");

-- CreateIndex
CREATE INDEX "VacancyCategory_categoryId_idx" ON "VacancyCategory"("categoryId");

-- Case-insensitive uniqueness, per organization (hiring 06 §01.3).
--
-- This is the rule the whole library rests on: without it `React`, `react` and `ReactJS`
-- coexist and every filter built on them quietly misses a third of its matches. The
-- service looks the collision up first so it can answer 409 with the existing row's id —
-- an inline caller needs that id to select what the member actually meant — but the
-- lookup is a convenience and this index is the guarantee. Two concurrent creates of the
-- same name reach it, and exactly one survives.
--
-- Expressed as raw SQL because Prisma's schema language has no expression indexes.
-- `lower(name)` rather than a second stored column: a normalized copy is a value that
-- can drift from the one it normalizes, and there is nothing to keep the two honest.
CREATE UNIQUE INDEX "Category_organizationId_lower_name_key"
    ON "Category"("organizationId", lower("name"));

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyCategory" ADD CONSTRAINT "VacancyCategory_vacancyId_fkey" FOREIGN KEY ("vacancyId") REFERENCES "Vacancy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VacancyCategory" ADD CONSTRAINT "VacancyCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The second org-wide library, and the one with real structure (hiring 06 §03).
--
-- A criterion has a name and one of four types; a scale owns an ordered list of values;
-- an application records at most one assessment per criterion. `Criterion` carries
-- `organizationId` from this, its first migration. The other two inherit that scope
-- through their parents, exactly as `VacancyCategory` does — a join row's organization is
-- not a second fact about it, and a copy of it is a copy that can drift.

-- CreateTable
CREATE TABLE "Criterion" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Criterion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CriterionValue" (
    "id" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CriterionValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationCriterion" (
    "applicationId" TEXT NOT NULL,
    "criterionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "valueId" TEXT,
    "valueBool" BOOLEAN,
    "valueNumber" DOUBLE PRECISION,
    "valueText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    -- The pair *is* the rule: a criterion is assessed at most once per application, so
    -- re-adding one edits the row already there rather than adding a second (04 §05.24).
    CONSTRAINT "ApplicationCriterion_pkey" PRIMARY KEY ("applicationId","criterionId")
);

-- CreateIndex
CREATE INDEX "Criterion_organizationId_idx" ON "Criterion"("organizationId");

-- CreateIndex
CREATE INDEX "CriterionValue_criterionId_position_idx" ON "CriterionValue"("criterionId", "position");

-- CreateIndex
CREATE INDEX "ApplicationCriterion_criterionId_idx" ON "ApplicationCriterion"("criterionId");

-- CreateIndex
CREATE INDEX "ApplicationCriterion_valueId_idx" ON "ApplicationCriterion"("valueId");

-- Case-insensitive uniqueness, per organization — the same rule, and the same reasoning,
-- as `Category_organizationId_lower_name_key` (hiring 06 §01.3). Both libraries decay the
-- same way without it.
CREATE UNIQUE INDEX "Criterion_organizationId_lower_name_key"
    ON "Criterion"("organizationId", lower("name"));

-- A scale's labels are unique within it case-insensitively too (06 §Validation.3), but
-- that one is enforced in the service rather than here, and deliberately so: values are
-- only ever written as one complete ordered list inside one transaction, so the service
-- sees the whole final state and can refuse a duplicate in it. A unique index would add
-- nothing to that and would break a legitimate edit — swapping two labels collides
-- halfway through, since a plain unique index is checked per statement and an expression
-- index cannot be declared deferrable.

-- The two composite keys below exist to be pointed at by foreign keys, not as rules of
-- their own: `id` and `(criterionId, id)` are already unique by construction.
CREATE UNIQUE INDEX "Criterion_id_type_key" ON "Criterion"("id", "type");

CREATE UNIQUE INDEX "CriterionValue_criterionId_id_key" ON "CriterionValue"("criterionId", "id");

-- AddForeignKey
ALTER TABLE "Criterion" ADD CONSTRAINT "Criterion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CriterionValue" ADD CONSTRAINT "CriterionValue_criterionId_fkey" FOREIGN KEY ("criterionId") REFERENCES "Criterion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationCriterion" ADD CONSTRAINT "ApplicationCriterion_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The criterion reference carries `type` with it.
--
-- `ApplicationCriterion.type` is a copy of `Criterion.type`, and this is what keeps the
-- copy honest: the row cannot name a criterion that does not exist, and it cannot name
-- one whose type differs from the one it recorded. The copy has to exist because the
-- check constraint below cannot read another table, and it can never go stale because the
-- type it copies is immutable (06 §03.14) — an attempt to move it would be refused here
-- as well as by the API.
ALTER TABLE "ApplicationCriterion" ADD CONSTRAINT "ApplicationCriterion_criterionId_type_fkey" FOREIGN KEY ("criterionId", "type") REFERENCES "Criterion"("id", "type") ON DELETE CASCADE ON UPDATE CASCADE;

-- A scale assessment's value must be one of *that* criterion's values (04 §Validation.5).
--
-- Composite, so a value belonging to another scale cannot be stored here, and `NO ACTION`
-- rather than `CASCADE` because a value with assessments may not be removed at all
-- (06 §03.16) — the API refuses it first, with the count, and this is what makes that a
-- fact about the database rather than a promise about the service. A `NULL` `valueId`
-- satisfies it under the default MATCH SIMPLE, which is exactly right: the other three
-- types have no value row.
ALTER TABLE "ApplicationCriterion" ADD CONSTRAINT "ApplicationCriterion_criterionId_valueId_fkey" FOREIGN KEY ("criterionId", "valueId") REFERENCES "CriterionValue"("criterionId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;

-- Exactly one value column, and it is the one the type names (04 §05.23).
--
-- This is what lets every filter in spec 03 be a plain indexed comparison rather than a
-- cast out of JSON, and it is a constraint rather than a convention because the four
-- columns are nullable and a bug that populated the wrong one would be invisible until a
-- filter quietly stopped matching somebody.
ALTER TABLE "ApplicationCriterion" ADD CONSTRAINT "ApplicationCriterion_value_matches_type" CHECK (
    ("type" = 'scale'   AND "valueId" IS NOT NULL AND "valueBool" IS NULL     AND "valueNumber" IS NULL     AND "valueText" IS NULL)
 OR ("type" = 'boolean' AND "valueId" IS NULL     AND "valueBool" IS NOT NULL AND "valueNumber" IS NULL     AND "valueText" IS NULL)
 OR ("type" = 'number'  AND "valueId" IS NULL     AND "valueBool" IS NULL     AND "valueNumber" IS NOT NULL AND "valueText" IS NULL)
 OR ("type" = 'text'    AND "valueId" IS NULL     AND "valueBool" IS NULL     AND "valueNumber" IS NULL     AND "valueText" IS NOT NULL)
);

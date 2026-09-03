-- Spec user-management/16 — Billable Time.
--
-- Both columns default to TRUE so Postgres backfills every pre-existing row with
-- `billable = true` in one pass. No separate UPDATE migration is required
-- (spec 16 §Migration).
--
-- Additive and reversible: dropping the columns is safe if the feature is rolled
-- back, at the cost of losing the flag. No index is added — the field is a
-- projected column on reads today; the (membershipId, date, billable) composite
-- can land in a follow-up if profiling shows a hot path (spec 16 Data Model note).

ALTER TABLE "TimeEntry" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "RunningTimer" ADD COLUMN "billable" BOOLEAN NOT NULL DEFAULT true;

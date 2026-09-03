-- Spec 14 follow-up: preserve a human-readable snapshot of the changed value at
-- activity-write time, so a later delete/rename of the referenced column, label,
-- membership, or parent task does not leave the activity feed showing raw UUIDs.
ALTER TABLE "TaskActivity" ADD COLUMN "oldLabel" TEXT;
ALTER TABLE "TaskActivity" ADD COLUMN "newLabel" TEXT;

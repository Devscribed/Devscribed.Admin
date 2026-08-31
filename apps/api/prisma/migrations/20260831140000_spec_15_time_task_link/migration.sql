-- Spec 15 — Time Tracking ↔ Tasks Integration
--
-- Additive migration:
--   * `TimeEntry` gains `taskId` (nullable) — FK → `Task.id` with ON DELETE SET NULL,
--     so hard-deleting a task un-links historical entries but leaves the snapshot
--     `task` free-text alone (spec 15 FR-8).
--   * `RunningTimer` gains `taskId` (nullable) with the same FK semantics.
--   * Both get an index on `taskId` for the "time logged on this task" aggregate.

-- AlterTable
ALTER TABLE "TimeEntry" ADD COLUMN "taskId" TEXT;

-- AlterTable
ALTER TABLE "RunningTimer" ADD COLUMN "taskId" TEXT;

-- CreateIndex
CREATE INDEX "TimeEntry_taskId_idx" ON "TimeEntry"("taskId");

-- CreateIndex
CREATE INDEX "RunningTimer_taskId_idx" ON "RunningTimer"("taskId");

-- AddForeignKey
ALTER TABLE "TimeEntry" ADD CONSTRAINT "TimeEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RunningTimer" ADD CONSTRAINT "RunningTimer_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

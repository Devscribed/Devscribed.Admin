-- Spec 13 — Kanban Board & Tasks
--
-- Additive migration:
--   * `Project` gains `key` (nullable) and `nextTaskNumber` (default 1). Existing rows
--     keep `key = NULL` and `nextTaskNumber = 1` — they simply can't use the board
--     until a key is set (spec 13 FR-2).
--   * `BoardColumn` and `Task` are new.
--   * `(organizationId, key)` is unique per org WHERE key IS NOT NULL — a partial
--     unique index Prisma cannot express via @@unique, added by hand here.

-- AlterTable
ALTER TABLE "Project"
    ADD COLUMN "key" TEXT,
    ADD COLUMN "nextTaskNumber" INTEGER NOT NULL DEFAULT 1;

-- Partial unique: same key never reused within an org, but many projects may have no key.
CREATE UNIQUE INDEX "Project_organizationId_key_key" ON "Project" ("organizationId", "key")
    WHERE "key" IS NOT NULL;

-- CreateTable
CREATE TABLE "BoardColumn" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'custom',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoardColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "taskNumber" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT,
    "columnId" TEXT NOT NULL,
    "position" DOUBLE PRECISION NOT NULL,
    "storyPoints" INTEGER,
    "assigneeId" TEXT,
    "reporterId" TEXT NOT NULL,
    "parentId" TEXT,
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BoardColumn_projectId_idx" ON "BoardColumn"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BoardColumn_projectId_position_key" ON "BoardColumn"("projectId", "position");

-- CreateIndex
CREATE INDEX "Task_projectId_columnId_idx" ON "Task"("projectId", "columnId");

-- CreateIndex
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");

-- CreateIndex
CREATE INDEX "Task_parentId_idx" ON "Task"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Task_projectId_taskNumber_key" ON "Task"("projectId", "taskNumber");

-- Column-name uniqueness per project is case-insensitive (spec 13 FR-4). Prisma cannot
-- express a LOWER(name) unique index in the schema; added by hand.
CREATE UNIQUE INDEX "BoardColumn_projectId_name_lower_key" ON "BoardColumn" ("projectId", LOWER("name"));

-- AddForeignKey
ALTER TABLE "BoardColumn" ADD CONSTRAINT "BoardColumn_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_columnId_fkey" FOREIGN KEY ("columnId") REFERENCES "BoardColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;

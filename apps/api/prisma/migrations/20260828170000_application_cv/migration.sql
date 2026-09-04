-- Manage booking, phase four: every version of a candidate's CV (hiring 07 §07).
--
-- Two things are worth stating before the statements, because both are easy to get
-- wrong in the direction that loses a file.
--
-- **No file moves.** New keys are `{cvId}{extension}` — the old `{applicationId}{extension}`
-- shape is a single slot and cannot hold two versions of one candidate's CV (00 §03.17).
-- Existing files keep the keys they have, and the back-fill records those keys verbatim
-- rather than rewriting them to the new shape. Nothing is copied, renamed or deleted.
--
-- **Nothing is ever deleted.** A superseded CV stays in storage and keeps its row: the
-- record is permanent, and what the candidate submitted at booking is evidence the
-- interviewer may already have read (07 §07.33).
--
-- The back-fill ships inside the migration that adds its table, never batched into a
-- later one, and is written so that re-running it adds nothing (TC-H07-INT-14).

CREATE TABLE "ApplicationCv" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    -- Nullable, mirroring `Application.cvSizeBytes`: a booking made before that column
    -- existed has no size to record, and inventing one would be worse than omitting it.
    "sizeBytes" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationCv_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationCv_applicationId_uploadedAt_idx"
  ON "ApplicationCv"("applicationId", "uploadedAt");

ALTER TABLE "ApplicationCv"
  ADD CONSTRAINT "ApplicationCv_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- One row per application **that has a CV** — an application whose file was lost gets
-- none, because a version row pointing at nothing would make the card offer a download
-- that cannot succeed.
--
-- `key` is copied byte-for-byte off `Application.cvKey`, which is the whole point: the
-- file stays exactly where it is. `uploadedAt` is the application's own `createdAt`, so
-- the entry sits where the upload actually happened rather than where the migration ran.
-- The `NOT EXISTS` is what makes re-running this add nothing.
INSERT INTO "ApplicationCv"
  ("id", "applicationId", "key", "fileName", "contentType", "sizeBytes", "uploadedAt")
SELECT
  gen_random_uuid()::text,
  a."id",
  a."cvKey",
  -- Both columns are nullable and neither has ever been written without the other, so
  -- these fallbacks are for a row nothing in the product can produce. They exist because
  -- a NOT NULL column will not take a null however unlikely it is.
  COALESCE(a."cvFileName", 'cv'),
  COALESCE(a."cvContentType", 'application/octet-stream'),
  a."cvSizeBytes",
  a."createdAt"
FROM "Application" AS a
WHERE a."cvKey" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ApplicationCv" AS c WHERE c."applicationId" = a."id"
  );

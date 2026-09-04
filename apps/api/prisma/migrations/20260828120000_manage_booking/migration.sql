-- Manage booking, phase one: the link a candidate reaches their booking by, the
-- interviewer the booking was actually made with, and the append-only log of when the
-- interview is (hiring 07 §03, §11, §13.63).
--
-- Each back-fill ships inside the migration that adds its column or table, never
-- batched into a later one, and every statement here is written so that re-running it
-- adds nothing (TC-H07-INT-13).

-- ---------------------------------------------------------------------------
-- Application.manageToken and Application.interviewerAccountId
-- ---------------------------------------------------------------------------

ALTER TABLE "Application" ADD COLUMN "manageToken" TEXT;
ALTER TABLE "Application" ADD COLUMN "interviewerAccountId" TEXT;

-- The vacancy's **current** interviewer, which is the only answer available. It is
-- wrong for any application booked before a reassignment that has already happened —
-- that history was never recorded and cannot be recovered. The column is correct from
-- here forward, and the limitation is stated in the spec (07 §13.63) rather than
-- discovered later by somebody who trusts the column further back than it goes.
UPDATE "Application" AS a
SET "interviewerAccountId" = v."interviewerAccountId"
FROM "Vacancy" AS v
WHERE v."id" = a."vacancyId" AND a."interviewerAccountId" IS NULL;

-- 16 random bytes as base64url — the shape `randomBytes(16).base64url` mints at
-- booking, so a back-filled token is indistinguishable from a freshly booked one.
--
-- Built from `gen_random_uuid()`, which is core Postgres, rather than from pgcrypto's
-- `gen_random_bytes`: requiring an extension would make this migration fail on a
-- database whose role may not create one. A v4 UUID's version and variant nibbles are
-- fixed, so the three slices below deliberately avoid them and take 48 + 60 + 20 = 128
-- random bits from three separate draws.
UPDATE "Application"
SET "manageToken" = rtrim(
  translate(
    encode(
      decode(
           substr(replace(gen_random_uuid()::text, '-', ''),  1, 12)
        || substr(replace(gen_random_uuid()::text, '-', ''), 18, 15)
        || substr(replace(gen_random_uuid()::text, '-', ''),  1,  5),
        'hex'
      ),
      'base64'
    ),
    '+/', '-_'
  ),
  '='
)
WHERE "manageToken" IS NULL;

ALTER TABLE "Application" ALTER COLUMN "manageToken" SET NOT NULL;
ALTER TABLE "Application" ALTER COLUMN "interviewerAccountId" SET NOT NULL;

CREATE UNIQUE INDEX "Application_manageToken_key" ON "Application"("manageToken");
CREATE INDEX "Application_interviewerAccountId_idx" ON "Application"("interviewerAccountId");

-- No cascade, matching `Vacancy.interviewer`: an account that conducted an interview is
-- soft-removed from its organization, never deleted out from under the record.
ALTER TABLE "Application"
  ADD CONSTRAINT "Application_interviewerAccountId_fkey"
  FOREIGN KEY ("interviewerAccountId") REFERENCES "Account"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- ApplicationScheduleEvent
-- ---------------------------------------------------------------------------

CREATE TABLE "ApplicationScheduleEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "actorAccountId" TEXT,
    "fromStart" TIMESTAMP(3),
    "toStart" TIMESTAMP(3),
    "timeZone" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationScheduleEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ApplicationScheduleEvent_applicationId_createdAt_idx"
  ON "ApplicationScheduleEvent"("applicationId", "createdAt");

CREATE INDEX "ApplicationScheduleEvent_actorAccountId_idx"
  ON "ApplicationScheduleEvent"("actorAccountId");

ALTER TABLE "ApplicationScheduleEvent"
  ADD CONSTRAINT "ApplicationScheduleEvent_applicationId_fkey"
  FOREIGN KEY ("applicationId") REFERENCES "Application"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ApplicationScheduleEvent"
  ADD CONSTRAINT "ApplicationScheduleEvent_actorAccountId_fkey"
  FOREIGN KEY ("actorAccountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- One `booked` row per application that predates the log, so the history is the whole
-- story rather than only its later deviations (07 §11.50). Attributed to the candidate
-- with a null account, exactly as a live booking writes it; `createdAt` is the row's own
-- so the entry sits where the booking actually happened rather than where the migration
-- ran. The `NOT EXISTS` is what makes re-running this add nothing.
INSERT INTO "ApplicationScheduleEvent"
  ("id", "applicationId", "type", "actor", "actorAccountId", "fromStart", "toStart", "timeZone", "reason", "createdAt")
SELECT gen_random_uuid()::text, a."id", 'booked', 'candidate', NULL, NULL, a."start", a."timeZone", NULL, a."createdAt"
FROM "Application" AS a
WHERE NOT EXISTS (
  SELECT 1 FROM "ApplicationScheduleEvent" AS e
  WHERE e."applicationId" = a."id" AND e."type" = 'booked'
);

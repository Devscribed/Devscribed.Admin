-- The candidate database, phase six: deleting a person is a flag (hiring 03 §11).
--
-- One nullable column, no back-fill, and the two things it deliberately does not do are
-- worth stating, because both are the kind of thing a later reader would "fix".
--
-- **The unique pair stays as it is.** `(organizationId, email)` is what `BookingService`
-- upserts a candidate on, so a deleted person who books again is *revived* — the update
-- branch clears this column — rather than colliding with their own tombstone. A partial
-- unique index over the live rows would let a second row for the same address exist, and
-- the recruiter would get a stranger wearing a familiar name instead of the person's
-- history back. That history coming back with them is the entire reason this is a soft
-- delete and not a `DELETE`.
--
-- **Nothing cascades.** Applications, assessments, CVs and scheduling events are
-- untouched; they keep their board position and become unreachable while their candidate
-- is, which is what the hiring spec set's "nothing hiring writes is ever deleted" rule
-- has always meant.
ALTER TABLE "Candidate" ADD COLUMN "deletedAt" TIMESTAMP(3);

-- Every hiring read of this table now carries `organizationId = … AND "deletedAt" IS NULL`
-- together, so the pair is indexed together. The `(organizationId, email)` unique index
-- still serves the booking upsert, which must find a deleted row and therefore never
-- names this column.
CREATE INDEX "Candidate_organizationId_deletedAt_idx"
  ON "Candidate"("organizationId", "deletedAt");

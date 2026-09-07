-- Time off spec 01 — Vacation Calendar. The holiday-country chain (REQ-01-026) needs a
-- country stated on the member and one stated on the organization; neither column exists.
--
-- Strictly additive: two new nullable columns with NO default and NO backfill. Nothing
-- selects them until the new code ships, and the previous image — which runs against this
-- schema, because infra/deploy.sh migrates on the new image BEFORE the services roll out
-- (deploy.sh:27) — never names them. A code rollback therefore needs no database rollback.

-- AlterTable — the first link of the chain. NULL means "use the organization's".
ALTER TABLE "Membership" ADD COLUMN "countryCode" CHAR(2);

-- AlterTable — the second link, and the one that covers every member nobody has stated a
-- country for. NULL means the member resolves to no country and gets global holidays only.
ALTER TABLE "Organization" ADD COLUMN "countryCode" CHAR(2);

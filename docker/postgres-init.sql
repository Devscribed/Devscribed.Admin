-- Postgres runs docker-entrypoint-initdb.d only when the data volume is empty, so this
-- executes on first `docker compose up` and never again. To re-run it after changing
-- anything here: `docker compose down -v`.
CREATE DATABASE devscribed_test OWNER devscribed;
-- The E2E suite writes here rather than into devscribed_dev. On a volume that predates
-- this line the database is created by `prisma migrate deploy` in e2e/global-setup.ts, so
-- nobody has to destroy their data to get it.
CREATE DATABASE devscribed_e2e OWNER devscribed;

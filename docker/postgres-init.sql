-- Postgres runs docker-entrypoint-initdb.d only when the data volume is empty, so this
-- executes on first `docker compose up` and never again. To re-run it after changing
-- anything here: `docker compose down -v`.
CREATE DATABASE devscribed_test OWNER devscribed;

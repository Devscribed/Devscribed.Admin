-- Requests spec 02 — the seed backfill (REQ-02-016).
--
-- A migration file of its own, separate from the one creating the table, so that it can
-- be executed by path on demand and so that this file contains nothing but the insert.
--
-- Gives the default catalogue to every organization holding no `RequestTopic` row at all.
-- Executing it a second time inserts nothing: the NOT EXISTS is evaluated per
-- organization, and an organization that already holds one row — whether from the first
-- run, from signup, or from a curator — is skipped entirely rather than topped up. That
-- is deliberate: a curator who archived a seeded topic must not have it silently
-- reinstated by a re-run.
--
-- `createdByAccountId` is NULL on every row: nobody created these. No `Request` row is
-- read and none is written.
INSERT INTO "RequestTopic" (
  "id", "organizationId", "audience", "type", "name", "sortOrder", "status",
  "createdAt", "updatedAt", "createdByAccountId", "archivedAt", "archivedByAccountId"
)
SELECT
  gen_random_uuid()::text,
  o."id",
  seed."audience",
  seed."type",
  seed."name",
  seed."sortOrder",
  'active',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL,
  NULL,
  NULL
FROM "Organization" o
CROSS JOIN (
  VALUES
    ('staff',  'access',   'VPN',           10),
    ('staff',  'access',   'Claude',        20),
    ('staff',  'access',   'Repository',    30),
    ('staff',  'access',   'Environment',   40),
    ('staff',  'access',   'Server',        50),
    ('staff',  'access',   'Admin panel',   60),
    ('staff',  'access',   'Documentation', 70),
    ('staff',  'question', 'Question',      80),
    ('staff',  'question', 'Other',         90),
    ('client', 'access',   'Access',        10),
    ('client', 'question', 'Other',         20)
) AS seed("audience", "type", "name", "sortOrder")
WHERE NOT EXISTS (
  SELECT 1 FROM "RequestTopic" t WHERE t."organizationId" = o."id"
);

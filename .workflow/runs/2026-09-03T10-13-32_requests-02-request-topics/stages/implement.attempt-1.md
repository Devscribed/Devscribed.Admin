# implement — attempt 1

Spec: `specs/requests/02-request-topics.md` (+ `.contracts.md`, `.cases.md`)
Branch: `spec/requests-02-client-participants` · Diff base: `225e843a`

All eight tasks implemented. 34 live cases written: 6 unit, 22 integration, 6 E2E.

---

## Tasks and the files they touched

### T1 — packages/validation

- `packages/validation/src/request-topics.ts` **(new)** — `TopicAudience` / `TopicType` /
  `TopicStatus` / `TopicStatusQuery` and their arrays; `normalizeTopicName`,
  `validateTopicName` (trim + whitespace-collapse then 1–60, the `normalizeClientName`
  shape), `validateTopicAudience` and `validateTopicType` (exact, case-sensitive),
  `validateTopicSortOrder` (clamp an out-of-range integer, refuse a non-integer),
  `clampSortOrder`, `parseTopicStatusQuery` and `parseTopicAudienceQuery` (both **refuse**
  an unknown value — deliberately not `parseClientStatusFilter`'s silent fallback), and
  `compareRequestTopics`.
- `packages/validation/src/index.ts` — four new keys on `REQUEST_MESSAGES` in place
  (`topicRequired`, `topicUnavailable`, `topicAudienceMismatch`, `classifierNotAccepted`);
  new export `REQUEST_TOPIC_MESSAGES` (twelve rows, `pickerEmpty` included); new export
  `REQUEST_STATUS_LABELS`; `'manage-request-topics'` in `MemberCapability` and in all four
  `CAPABILITY_MATRIX` rows; `export * from './request-topics'`.
- `packages/validation/src/roles.ts` — `'ManageRequestTopics'` in `Capability` and in the
  `admin` and `manager` rows of `ROLE_CAPABILITIES`.
- `packages/validation/src/requests.ts` — `'closed'` joins `REQUEST_STATUS_QUERIES`;
  `expandRequestStatusQuery`; `vacationStatusesFor` gains the `closed` arm (the exhaustive
  switch would not compile without it); `'topicId'` joins `IMMUTABLE_REQUEST_FIELDS`;
  `validateNewRequest` rewritten — `topicId` required, `type`/`accessKind` refused by
  `hasOwnProperty` presence and validated no longer, `RETIRED_CLASSIFIER_FIELDS` exported.
  `validateRequestKind` is untouched and still exported.
- `packages/validation/src/requests.test.ts`, `roles.test.ts` — the three plain
  `validateNewRequest` tests (no TC id) rewritten onto a `topicId` body; the matrix and
  `capabilitiesFor` assertions extended with the new capability.

### T2 — schema and migrations

- `apps/api/prisma/schema.prisma` — `model RequestTopic`; `Request.topicId` (SetNull) and
  `Request.topicLabel` (`VarChar(60)`), both nullable; back-relations on `Organization`
  and `Account`.
- `apps/api/prisma/migrations/20260903120000_requests_02_request_topics/migration.sql` —
  the table, `@@index([organizationId, audience, status])`, the hand-written
  `UNIQUE (organizationId, audience, LOWER(name))`, the three FKs, and the two `Request`
  columns with their FK.
- `apps/api/prisma/migrations/20260903120100_requests_02_request_topics_backfill/migration.sql`
  — the backfill alone: one `INSERT … SELECT … CROSS JOIN (VALUES …) WHERE NOT EXISTS`.

**Two migration files in one run**, against the usual one-per-run. Pre-implement raised
this as note P1 and the plan settled it: the spec's Seed Data section requires the backfill
to be "a migration file of its own", and TC-02-INT-02 executes it *by its path*, which is
impossible if it shares a file with the `CREATE TABLE`. Both are additive; the backfill is
idempotent and the case executes it twice to prove it.

### T3 — seeding

- `apps/api/src/requests/request-topics.seed.ts` **(new)** — `REQUEST_TOPIC_SEED` (the
  eleven rows) and `seedRequestTopics(tx, organizationId)`; `organizationId` is required
  with no default and `createdByAccountId` is null on every row.
- `apps/api/src/signup/signup.service.ts` — called inside the existing `$transaction`, so a
  failure rolls the organization back rather than producing one without a catalogue.

### T4 — the topics module

- `apps/api/src/requests/request-topics.controller.ts` **(new)** — five routes under
  `@Controller('api/organizations/:orgId')` behind `SessionGuard, OrgScopeGuard`. No
  `DELETE` handler.
- `apps/api/src/requests/request-topics.service.ts` **(new)** — read, create, update
  (rename + reorder), archive, restore. Capability checked in the service (403 carrying
  `manageForbidden`). Every writer of an existing row takes
  `SELECT … FOR UPDATE` and decides against that read. Immutability answered before
  uniqueness. Duplicate pre-check plus P2002 → the same 409. Default `sortOrder` = highest
  in the audience (every status) + 10, clamped.
- `apps/api/src/requests/request-topics.dto.ts` **(new)** — the documented row shape only.
- `apps/api/src/app.module.ts` — controller and service registered flat.

### T5 — the requests surface

- `apps/api/src/requests/requests.service.ts` — `createRequest` looks the topic up active
  and in the caller's organization (one 400 `topicUnavailable` for all three misses),
  compares the audience only afterwards, writes `type` from the topic and `accessKind`
  null, and writes `topicId` + `topicLabel` inside the creating transaction.
  `listRequests` gains `topicId` (inside the organization scope) and expands `status`
  through `expandRequestStatusQuery`.
- `apps/api/src/requests/requests.serializer.ts` — `REQUEST_ROW_INCLUDE` gains the `topic`
  relation; `toRequestTopicMember` keys the member on `topicLabel`.
- `apps/api/src/requests/requests.dto.ts`, `requests.controller.ts` — the member's type and
  the `topicId` query parameter.

### T6 — Settings › Request topics

- `apps/web/app/org/[orgId]/settings/request-topics/page.tsx`, `RequestTopicModal.tsx`,
  `types.ts` **(new)** — `'use client'`, `credentials: 'same-origin'`, tokens only.
  Capability-gated with the holidays redirect pattern. Up/down controls, one `PATCH` per
  press. Both DS gaps shipped as the spec's table commits: up/down controls instead of a
  drag handle, two `aria-pressed` `Button`s instead of a segmented control.
- `apps/web/src/layout/Sidebar.tsx` — the `settings-tab-request-topics` row, gated through
  `hasCapability` (which normalizes the raw role internally, as the two rows beside it do).

### T7 — the requests screens

- `NewRequestModal.tsx` — `request-new-type` and `request-new-access-kind` **deleted**;
  `request-new-topic` filled from `?audience=staff&status=active`;
  `request-new-topic-empty` and no submit control when that read returns nothing; neither
  classifier sent.
- `page.tsx` — `STATUS_OPTIONS` rebuilt from `REQUEST_STATUS_LABELS` (five entries, sending
  `all|open|answered|granted|closed`); `statusSelection` shows Closed for a saved
  `declined`/`cancelled` link; `requests-topic-filter` filled from a **second** read
  carrying `status=all`, archived entries marked.
- `RequestRow.tsx` — `REQUEST_STATUS_META` **deleted**; `STATUS_TONE` (tone only) and
  `statusLabelOf` exported; the About cell drawn under `request-row-{id}-topic` when the
  request carries a topic and outside it when it does not (note P3's reading).
- `[requestId]/page.tsx` — header badge and `request-detail-topic`.
- `[requestId]/RequestHistory.tsx` — `marked it ${newValue}` → the label from the map.

### T8 — cases

New: `packages/validation/src/request-topics.test.ts`,
`apps/api/test/request-topics.spec.ts`, `e2e/tests/request-topics.spec.ts`.
Amended: `apps/api/test/requests.spec.ts`, `e2e/tests/requests.spec.ts`,
`e2e/tests/requests-page.spec.ts`, `e2e/tests/helpers.ts`.

---

## Test cases written

| Case | Where |
|---|---|
| TC-02-UNIT-01 … 06 | `packages/validation/src/request-topics.test.ts` |
| TC-02-INT-01 … 22 | `apps/api/test/request-topics.spec.ts` |
| TC-02-E2E-01 … 06 | `e2e/tests/request-topics.spec.ts` |

---

## Commands run

| Command | Summary line |
|---|---|
| `npm run test:unit` | `Test Files 23 passed (23) · Tests 1084 passed (1084)` |
| `npx tsc --noEmit -p apps/api/tsconfig.json` | clean (includes `test/**/*`) |
| `npx tsc --noEmit -p apps/web/tsconfig.json` | clean |
| `npx tsc --noEmit -p packages/validation/tsconfig.json` | clean |
| `apps/api: npm test -- test/request-topics.spec.ts` | `Tests: 22 passed, 22 total` |
| `apps/api: npm test -- test/requests.spec.ts` | `Tests: 23 passed, 23 total` |
| `apps/api: npm test -- test/signup.spec.ts test/capability.spec.ts test/org-scope.spec.ts test/requests-page.spec.ts` | `Tests: 19 passed, 19 total` |
| `e2e: E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/request-topics.spec.ts` | `6 passed (21.4s)` |
| `e2e: … npx playwright test tests/requests.spec.ts tests/requests-page.spec.ts tests/regressions.spec.ts` | `23 passed (45.0s)` |
| `npm run gate` | `blocked` — six findings, all analysed below |

Integration and E2E were run targeted, never whole; E2E held ports 3100/4100.

---

## Existing cases amended, and why

1. **`apps/api/test/requests.spec.ts` — every create body.** `newRequestBody` now takes a
   `topicId` and sends no classifier; `seededTopicId()` reads one from the catalogue signup
   writes. Eleven call sites.
2. **`apps/api/test/requests.spec.ts` — TC-01-INT-05's kind assertions.** Edge cases 5 and
   6 asserted `accessKindNotAllowed` and `accessKindRequired` on create, and the long-title
   case paired the title with `typeUnknown`. REQ-02-021 removes all three from this route.
   They are **replaced, not deleted**, by the rule that took their place: a body carrying
   `type` and/or `accessKind` is refused with `classifierNotAccepted` keyed under the name
   that was sent, **and** none of the four retired messages appears anywhere in the
   response. The long-title case now pairs the title with `priorityUnknown`, so it still
   proves every error is reported at once.
3. **`e2e/tests/requests.spec.ts`** — `createRequestViaApi` sends a topic; TC-01-E2E-01
   drives `request-new-topic` and asserts the two retired controls are absent;
   TC-01-E2E-02 asserts `request-new-error-topic` and that the picker takes focus; the
   eleven status-word assertions become Pending / In progress / Completed /
   `Closed · declined` / `Closed · cancelled`; the two filter selections become Pending and
   Completed; `marked it answered` becomes `marked it In progress`.
4. **`e2e/tests/requests.spec.ts` — two row locators.** `request-row-{id}-topic` shares the
   `request-row-` prefix, so the container locators gained
   `:not([data-testid*="-topic"])`. Without it TC-01-E2E-04 counted six rows where there
   are three. This was not in the blast radius; the spec's new testid caused it.
5. **`e2e/tests/requests-page.spec.ts:147`** — the `Open` option becomes `Pending`.
6. **`e2e/tests/helpers.ts`** — three additive helpers: `listRequestTopicsViaApi`,
   `requestTopicIdViaApi`, `archiveRequestTopicViaApi`. Nothing existing changed.

---

## Two things a person should look at

### 1. The static gate blocks on six findings that are all false — `scripts/static-gate.mjs` cannot see a bundled spec

`npm run gate` reports six `[code] spec/testid-unnamed` findings:
`request-new-topic`, `request-new-topic-empty`, `request-new-submit`,
`request-detail-topic`, `request-detail-status`, `requests-topic-filter`.

Every one of the six **is** named in the spec — in `02-request-topics.contracts.md`, the
bundle member the entry file's own frontmatter declares:

```
$ for id in request-new-submit request-new-topic-empty request-new-topic \
            request-detail-status request-detail-topic requests-topic-filter; do
    printf '%-24s contracts=%s  entry=%s\n' "$id" \
      "$(grep -c -- "$id" specs/requests/02-request-topics.contracts.md)" \
      "$(grep -c -- "$id" specs/requests/02-request-topics.md)"
  done
request-new-submit       contracts=2  entry=0
request-new-topic-empty  contracts=2  entry=0
request-new-topic        contracts=3  entry=0
request-detail-status    contracts=2  entry=0
request-detail-topic     contracts=1  entry=0
requests-topic-filter    contracts=1  entry=0
```

The cause is in the script: `specText` at `scripts/static-gate.mjs:209-213` reads **only**
the file named in `run.json` and no bundle member, and the check at `:318` is
`specText.includes(id)`. Against a bundled spec every id defined in a bundle member is
therefore reported as named in no spec. This is the same blindness pre-implement recorded
as note P6 for `scripts/handoff-coverage.mjs`, in a second script that P6 does not name.

I did not fix it: `scripts/` is outside this handoff's file globs, and repairing the gate
that judges this diff is not a change an implementer should make unasked. The fix is three
lines — parse the entry file's `bundle:` frontmatter and concatenate those files into
`specText`, the same repair P6 proposes for the coverage script.

I also did not rename any id: every one is the id the spec names, and the testid table is
explicit that `request-new-submit`, `request-detail-status` and the rest "appear here
because this spec's cases assert them and their contents change".

The seventh finding the gate raised on the first run —
`[code] pipeline/no-detector-weakening` on `apps/api/test/requests.spec.ts`, "4 more
assertions removed than added" — was **real** and is fixed, by amendment 2 above: the
retired kind assertions are now restated as the rule that replaced them rather than simply
dropped.

### 2. Part of this run's work was committed by something else, mid-run, under an unrelated message

While I was working, `3d62ecc fix(board): an SDK stage log is not a killed stage` appeared
on this branch carrying `apps/api/prisma/schema.prisma`, both migration files, and six
`packages/validation/src/*` files — my T1 and T2 output — alongside unrelated
`scripts/*.mjs` changes. `6a7bfd1` then partly reverted the script half. Neither commit was
made by me and I have not amended or rebased either.

The consequence for the reviewer: `git diff 225e843...HEAD` still contains the whole change
set, so nothing is missing, but it also contains three commits of pipeline housekeeping
(`d3c026e`, `61f34d2`, `3d62ecc`/`6a7bfd1`'s `scripts/` and `docs/` parts) that are not
mine and are not part of this spec. Read `apps/`, `packages/`, `e2e/` and
`apps/api/prisma/` as the implementation; `scripts/`, `docs/` and `.workflow/` in that range
are not.

---

## Decisions taken where the plan left a choice

- **`REQUEST_TOPIC_MESSAGES` and `REQUEST_STATUS_LABELS` live in `index.ts`**, as the
  contracts state ("a new export in `packages/validation/src/index.ts`", "lives beside the
  messages"). The validators, parsers and comparator live in `request-topics.ts` and read
  the messages inside functions only, the cycle-safe arrangement `requests.ts` already uses.
- **400 bodies are field-keyed** (`{ error: 'validation_error', fields: { … } }`), matching
  every other route in this module; 403 and 409 carry `{ error, message }`; 404 is the
  framework's bare body, and TC-02-INT-21 asserts that every 404 on these routes is byte
  -identical and names no resource.
- **Note P2** — the computed default `sortOrder` is clamped to 32767 and counts rows of
  every status.
- **Note P3** — a legacy request's About fallback is drawn *outside* `request-row-{id}-topic`.
- **Note P4** — the row status assertion in TC-02-E2E-04 is containment, following the mock
  and REQ-02-029; the detail header is asserted exactly as `Closed · cancelled`.
- **Note P5** — TC-02-INT-07's manager half runs create → rename → archive → restore on one
  topic.
- **The DS `Modal` has no keyboard dismissal** (`1_DS for dev/components/surfaces/Modal.jsx`
  closes on overlay click or an `aria-label="Close"` button, neither of which carries a
  testid). Two E2E steps that need to leave a modal open-but-unsaved navigate instead of
  pressing Escape. No testid was invented and no selector reaches past an id into a role.

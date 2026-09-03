---
id: "02"
title: Request Topics & Vocabulary
routes:
  - "/org/{orgId}/settings/request-topics"
  - "/org/{orgId}/requests"
api:
  - "GET/POST /api/organizations/{orgId}/request-topics"
  - "PATCH /api/organizations/{orgId}/request-topics/{topicId}"
  - "PATCH /api/organizations/{orgId}/request-topics/{topicId}/archive"
  - "PATCH /api/organizations/{orgId}/request-topics/{topicId}/restore"
  - "GET/POST /api/organizations/{orgId}/requests"
entities: [RequestTopic, Request, Organization]
tags:
  [request, topic, catalogue, preset, settings, vocabulary, status-label, seeding, audience]
depends-on: ["requests/01", "user-management/01", "organization/03"]
bundle:
  - 02-request-topics.contracts.md
  - 02-request-topics.cases.md
---

# 02 — Request Topics & Vocabulary

## Summary

An organization keeps its own catalogue of **request topics** — the presets a person picks
instead of typing a category. A topic belongs to one **audience**, `staff` or `client`; it
declares the request kind it produces, `access` or `question`; and an admin or manager creates,
renames, reorders and archives it in Settings. Raising a request means choosing a topic, and
the request keeps a snapshot of the topic's name forever after, so renaming or archiving a
topic never rewrites what an old request says it was about.

The structural decision that shapes everything below: **the topic is the only classifier a
caller supplies.** `type` keeps its meaning and is written by the server from the chosen topic;
`accessKind` is no longer accepted on the way in.

It also fixes the words the screens use for where a request stands — **Pending, In progress,
Completed, Closed** — over statuses that stay in the database exactly as they are, and gives
the requests list a filter by topic beside the status one.

Blast radius and backward compatibility for this spec are in [README.md](README.md).

## Actors & Preconditions

| Actor | Preconditions |
|---|---|
| **Curator** | An active member holding `manage-request-topics` (admin, manager). Signed in. Creates, renames, reorders, archives and restores topics. |
| **Requester** | An active member holding `create-request` (admin, manager, user). Reads the catalogue to fill the picker; may not change it. |
| **Organization** | Exists, and carries at least one active `staff` topic once seeded. |

There is no non-account actor. Every route is behind `SessionGuard` and `OrgScopeGuard`.

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| `manage-request-topics` — create, rename, reorder, archive, restore | ✅ | ✅ | ❌ | ❌ |
| Read the catalogue through `GET …/request-topics` | ✅ | ✅ | ✅ | ✅ |
| Choose a topic when raising a request | ✅ | ✅ | ✅ | ❌ |
| See the Settings › Request topics row | ✅ | ✅ | ❌ | ❌ |
| See a topic's snapshot name on a request | ✅ | ✅ | ✅ | ✅ |

Every check runs against `normalizeRole()` (`packages/validation/src/roles.ts`), so legacy
`member` maps to `user`.

## Functional Requirements

### The catalogue

#### REQ-02-001 — a topic belongs to one organization

THE SYSTEM SHALL scope every read and write of a `RequestTopic` by `session.organizationId`,
a required argument with no default on every method of the topics service.

#### REQ-02-002 — the audience and the read's status are closed sets

IF a create call or a catalogue read carries an `audience` outside `staff` and `client`, THEN
THE SYSTEM SHALL answer `400` with `REQUEST_TOPIC_MESSAGES.audienceUnknown`; a catalogue read
carrying a `status` outside `active`, `archived` and `all` answers `400` with
`REQUEST_TOPIC_MESSAGES.statusUnknown`, an omitted `status` meaning `active`.

#### REQ-02-003 — a topic declares the request kind it produces

THE SYSTEM SHALL store on every topic a `type` of `access` or `question`, which is the value
written onto a request raised under it.

#### REQ-02-004 — the audience and the kind are immutable

IF a rename call carries an `audience` different from the stored one, THEN THE SYSTEM SHALL
answer `400` with `REQUEST_TOPIC_MESSAGES.audienceImmutable`.

IF a rename call carries a `type` different from the stored one, THEN THE SYSTEM SHALL answer
`400` with `REQUEST_TOPIC_MESSAGES.typeImmutable`. A `type` equal to the stored value is
accepted and changes nothing, exactly as the stored `audience` is.

**Decided:** both are refused rather than dropped, as REQ-02-022 does at the other end: moving
a topic between audiences re-addresses every future request raised under it, and archiving and
re-creating leaves a trail. Rejected: answering `200` having ignored the field, which leaves a
caller believing the topic produces a kind it does not.

#### REQ-02-005 — the name

THE SYSTEM SHALL require a `name` of 1–60 characters after trimming and collapsing whitespace.

#### REQ-02-006 — one name per audience

IF a create or rename call would leave two topics of the same organization and audience with
names equal ignoring case, THEN THE SYSTEM SHALL answer `409` with
`REQUEST_TOPIC_MESSAGES.nameDuplicate`.

**Decided:** per audience — "Access" is a natural staff topic and the client default.

#### REQ-02-007 — curating requires the capability

IF a caller without `manage-request-topics` calls any topic write route, THEN THE SYSTEM
SHALL answer `403` with `REQUEST_TOPIC_MESSAGES.manageForbidden`.

#### REQ-02-008 — the catalogue is readable by every member

WHERE the caller holds an active membership of the organization, THE SYSTEM SHALL answer
`GET …/request-topics` with `200`.

#### REQ-02-009 — order is curated, not alphabetical

THE SYSTEM SHALL order topics by `sortOrder` ascending, then by name case-insensitively.

**Decided:** "Other" belongs at the bottom of a picker, which alphabetical order cannot say.

#### REQ-02-010 — archiving is the only removal

WHEN a curator archives a topic, THE SYSTEM SHALL set its `status` to `archived` and leave
every request raised under it untouched.

#### REQ-02-011 — an archived topic is not offered

WHILE a topic is `archived`, THE SYSTEM SHALL omit it from the response to
`GET …/request-topics?status=active`.

#### REQ-02-012 — restoring

WHEN a curator restores an archived topic, THE SYSTEM SHALL set its `status` to `active`.

#### REQ-02-013 — a repeated archive or restore is refused, not repeated

IF a topic is already in the status a call would set, THEN THE SYSTEM SHALL answer `409`
with `REQUEST_TOPIC_MESSAGES.statusUnchanged`.

#### REQ-02-014 — there is no delete

THE SYSTEM SHALL expose no route that removes a `RequestTopic` row.

**Decided:** the snapshot name makes archiving lossless, so a delete would only orphan rows.

### Seeding

#### REQ-02-015 — a new organization is born with a catalogue

WHEN an organization is created, THE SYSTEM SHALL write the default topics in the same
transaction as the `Organization` row.

#### REQ-02-016 — organizations that predate this spec

WHEN the backfill migration runs, THE SYSTEM SHALL insert the same default topics for every
organization holding no `RequestTopic` row.

#### REQ-02-017 — an audience with no active topic

WHILE the audience of the form's addressee has no active topic, THE SYSTEM SHALL render the
new-request form's topic picker as `REQUEST_TOPIC_MESSAGES.pickerEmpty` and draw no submit
control. That audience is `staff`, `member` being the only addressee kind a request may carry
as this spec ships (REQ-02-020); an empty `client` audience leaves the form usable.

**Decided:** an emptied catalogue gets a screen that says so, and the form reads one audience —
the addressee's. Rejected: emptying it when *any* audience is empty, which withdraws a working
staff picker over half a catalogue the form cannot reach.

### Raising a request under a topic

#### REQ-02-018 — the topic is required

IF `POST …/requests` carries no `topicId`, THEN THE SYSTEM SHALL answer `400` with
`REQUEST_MESSAGES.topicRequired`.

#### REQ-02-019 — an unusable topic

IF `topicId` names no active topic of the caller's organization, whether because it is
archived, because it belongs to another organization, or because it names no row at all, THEN
THE SYSTEM SHALL answer `400` with `REQUEST_MESSAGES.topicUnavailable`.

**Decided:** one answer for all three; a topic id names a word the organization publishes
inside itself, so a split would inform nobody.

#### REQ-02-020 — the audience must match the addressee

IF the chosen topic's audience does not match the addressee's kind, THEN THE SYSTEM SHALL
answer `400` with `REQUEST_MESSAGES.topicAudienceMismatch`.

`decision-table: keys=(topicAudience, assigneeKind) domains=(topicAudience: staff|client, assigneeKind: member)`

| topicAudience | assigneeKind | Outcome |
|---|---|---|
| staff | member | The request is created `201`. |
| client | member | `400`. A topic written for a client is not a topic to raise against a colleague, and `member` is the only addressee kind a request may carry as this spec ships. |

#### REQ-02-021 — the kind is derived, never supplied

WHEN a request is created, THE SYSTEM SHALL write `type` from the chosen topic's `type` and
write `accessKind` as `null`, including under a topic whose `type` is `access`.

THE SYSTEM SHALL NOT validate `type` or `accessKind` as body fields on `POST …/requests`, and
SHALL emit no message about the shape of either. REQ-02-022's absence check is the only reading
either name gets there; the kind is read from the topic after it.

#### REQ-02-022 — a supplied kind is refused

IF `POST …/requests` carries `type` or `accessKind`, THEN THE SYSTEM SHALL answer `400` with
`REQUEST_MESSAGES.classifierNotAccepted`.

**Decided:** refused rather than ignored — a silent drop turns a caller on a stale contract
into a request classified as something nobody chose.

#### REQ-02-023 — the label is snapshotted

WHEN a request is created, THE SYSTEM SHALL write the topic's name into the request's
`topicLabel` in the same transaction as the `Request` row.

#### REQ-02-024 — the topic cannot be changed afterwards

IF `PATCH …/requests/{requestId}` carries `topicId`, THEN THE SYSTEM SHALL answer `400` with
`REQUEST_MESSAGES.fieldImmutable`.

#### REQ-02-025 — the catalogue never rewrites history

WHEN a topic is renamed or archived, THE SYSTEM SHALL leave `topicLabel` on every existing
request unchanged.

### The list and the words on the screens

#### REQ-02-026 — filtering by topic

WHEN `GET …/requests` carries `topicId`, THE SYSTEM SHALL return only requests whose stored
`topicId` equals it.

#### REQ-02-027 — Closed is one filter value over two statuses

WHEN `GET …/requests` carries `status=closed`, THE SYSTEM SHALL return requests whose status
is `declined` or `cancelled`.

#### REQ-02-028 — the four words

THE SYSTEM SHALL render `open` as Pending, `answered` as In progress, `granted` as
Completed, and `declined` and `cancelled` both as Closed, from a single exported label map
that the list, the detail screen, its history entries and the filter control all read.

#### REQ-02-029 — which closure it was

WHILE a request's status is `declined` or `cancelled`, THE SYSTEM SHALL render the reason
for the closure beside the Closed label as `declined` or `cancelled` respectively.

**Decided:** collapsing them entirely is the one thing the shorter vocabulary would lose.

#### REQ-02-030 — the Settings row

WHERE the caller holds `manage-request-topics`, THE SYSTEM SHALL render the Settings ›
Request topics navigation row.

## State Machine

`decision-table: keys=(state, event) domains=(state: active|archived, event: archive|restore|rename|reorder)`

| state | event | Outcome |
|---|---|---|
| active | archive | `status` → `archived`, `archivedAt` and `archivedByAccountId` written. |
| active | restore | `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged`; nothing is written. |
| active | rename | The name is written; `updatedAt` moves. |
| active | reorder | `sortOrder` is written; `updatedAt` moves. |
| archived | archive | `409` `REQUEST_TOPIC_MESSAGES.statusUnchanged`; nothing is written. |
| archived | restore | `status` → `active`, `archivedAt` and `archivedByAccountId` cleared. |
| archived | rename | The name is written. An archived topic is still named on old requests, and correcting a spelling must not require restoring it. |
| archived | reorder | `sortOrder` is written. It takes effect if the topic is ever restored. |

Invariants:

1. `active` is the only status a topic may be created in.
2. Neither status is terminal; a topic moves between them without limit.
3. Every archive and restore re-reads the row with `FOR UPDATE` inside its transaction and
   evaluates the status guard against that read, never against a copy loaded earlier.
4. `topicLabel` on a `Request` is written once, at creation, and no topic write may alter it.
5. Writers of a `RequestTopic` row are the create, rename, reorder, archive and restore
   handlers plus the seed; each writer of an existing row takes the row lock.

## Out of Scope

- **Per-topic fields.** Every request keeps one free-text description instead.
- **Per-topic routing.** No rule says "VPN goes to ops"; the requester picks the person.
- **Per-topic service levels**, and **icons or colours**. A topic is a word and a kind.
- **Topic usage counts** in the catalogue screen — worth having, and not built.
- **Retiring `accessKind`.** The column and its values stay on requests that carry them.

## Known Gaps

| Gap | Why acceptable now | What closes it |
|---|---|---|
| The `client` audience can be curated but no request can be addressed to a client yet, so a `client` topic is unreachable from the new-request form | The audience is what makes the catalogue's second half worth seeding and manageable before it is needed, and the mismatch refusal is a live, tested rule rather than a dormant one | Spec 03, which makes a client an addressee and admits `client` topics to the picker |
| Existing requests carry no `topicId` and no `topicLabel` | The columns are nullable and the screens fall back to the request's stored `type` for those rows, so nothing is lost and no backfill guesses at a topic nobody chose | Nothing needs to. The set is closed the moment this spec ships |
| A topic's `type` cannot be corrected after creation | Changing it would make the type filter disagree with the requests already raised under the topic. Archive and re-create is the honest path | A migration that rewrites `type` on the topic and every request under it, if the need is ever real |
| The seeded staff set has no topic for two of the retired access kinds — `saas`, and an `access` topic for `other` — so an organization that classified a request either way has no seeded topic that produces the same kind | The seed is a starting catalogue, not a migration of the old vocabulary, and a curator adds a topic in one screen. An `access` topic named `Other` is in any case unreachable while the seeded `Other` holds the name: one name per audience (REQ-02-006) | A curator adding the topics the organization wants, or a later revision of the seed table |
| Ordering is a single integer per topic with no gap strategy | The catalogue is a handful of rows curated by hand; a move is one `PATCH` of one row's `sortOrder`, taking a value one past the neighbour it moved over, and repeated moves into one gap — or a move against a neighbour already holding `0` or `32767`, where the value clamps onto the neighbour's own — can leave two rows sharing a value, which falls to the name tiebreak and leaves the order as it was | A fractional or linked ordering, if a catalogue ever grows past what one screen shows |

## Acceptance Criteria

| # | Criterion | Observed by |
|---|---|---|
| AC-1 | A newly signed-up organization has a usable staff catalogue before anybody opens Settings. | TC-02-INT-01 |
| AC-2 | An organization that existed before this spec has the same catalogue after the migration, with no request rewritten. | TC-02-INT-02 |
| AC-3 | Two topics of one organization and audience cannot share a name that differs only in case. | TC-02-INT-05 |
| AC-4 | A `user` can read the catalogue and cannot change it. | TC-02-INT-07 |
| AC-5 | A request created under a topic carries the topic's kind, which the caller never sent. | TC-02-INT-10 |
| AC-6 | A request body carrying the retired classifier is refused rather than silently accepted. | TC-02-INT-11 |
| AC-7 | Renaming a topic leaves every existing request reading the name it was raised under. | TC-02-INT-14 |
| AC-8 | Archiving a topic removes it from the picker and leaves its requests readable and filterable. | TC-02-INT-15, TC-02-E2E-03 |
| AC-9 | A client-audience topic cannot be used on a request addressed to a colleague. | TC-02-INT-12 |
| AC-10 | `status=closed` returns exactly the declined and cancelled requests, and the five stored values still resolve. | TC-02-INT-17 |
| AC-11 | The list, the detail screen and the filter control show the same four words for the same request. | TC-02-UNIT-05, TC-02-E2E-04 |
| AC-12 | A closed request still says which way it closed. | TC-02-E2E-04 |
| AC-13 | Two concurrent archives of one topic produce one write and one refusal. | TC-02-INT-16 |
| AC-14 | A topic id from another organization is refused with the same answer as an archived one, and no request is created. | TC-02-INT-13 |
| AC-15 | A `user` opening Settings sees no Request topics row and the route answers 403 to their write. | TC-02-INT-07, TC-02-E2E-05 |
| AC-16 | An organization whose catalogue holds no active staff topic gets a form that says so instead of one that fails on submit. | TC-02-E2E-06 |

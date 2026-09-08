# pre_implement — portal/01 Home

Run `2026-09-08T08-37-11_portal-01-home` · spec `specs/portal/01-home.md` (bundle: contracts,
cases, mock) · shape `strict` · base `7a6e059`.

**Verdict: blocked.** Three findings, all addressed to `spec`. The handoff is written in full
anyway — the plan is executable the moment those three are settled, and two of the three sit
inside tasks that are otherwise ready, so the plan names where they land rather than routing
around them.

---

## What I read, and in what order

`run.json`; the three-file bundle and the mock; `specs/portal/README.md` (product decisions,
blast radius, backward compatibility, shared rules, related areas); `CLAUDE.md`;
`packages/ds/README.md` by way of `packages/ds/src/index.ts`. Then the code, before the plan:

- the guard stack — `session.guard.ts`, `org-scope.guard.ts`, `capability.guard.ts`,
  `allow-client-principal.decorator.ts`, `principal.ts`;
- `packages/validation/src/roles.ts` in full — the `Capability` union, `ROLE_CAPABILITIES`,
  `normalizeRole`, `capabilitiesForPrincipal`;
- the schema: `Account`, `Organization`, `Membership`, `MemberFinancials`, `Project`,
  `ProjectMember`, `Client`, `Holiday`, `TimeEntry`, `Request`, `Vacancy`;
- the four services the feed and the personal half read around — `reports.service.ts`,
  `requests.service.ts`, `holidays.service.ts`, `projects.service.ts`, `vacation.service.ts`;
- `test-fixtures.controller.ts` and `test-support/fixture-gate.ts`;
- the web side — `LoginForm.tsx`, `Sidebar.tsx`, `session-context.tsx`, `me.controller.ts`,
  the `app/org/[orgId]/` tree;
- `e2e/tests/helpers.ts`, `ui-invariants.ts`, and the 33 `**/members` waits;
- `infra/deploy.sh`, `PATCH-012`, `scripts/handoff-coverage.mjs`, `scripts/spec-lint.mjs`.

`node scripts/spec-lint.mjs specs/portal/01-home.md` is clean: 51 requirements, 33 cases, 6
routes, 10 messages, 25 testids. `node scripts/handoff-coverage.mjs` is clean.

---

## The three blockers

### P1 — the client contact and the settings pair: 404 or 403

REQ-01-004 is unconditional: *"IF a client contact requests any route in this spec, THEN THE
SYSTEM SHALL answer `404`."* TC-01-INT-01 signs in as a client contact, calls all four
organization routes, and asserts the settings route answers **403**
`TEMPLATE_MESSAGES.generic.forbidden`. Both are the spec. No implementation satisfies both.

It is not a wording slip that resolves in the contracts' favour, because the reason the
contracts give for the 403 is false for this principal. `OrgScopeGuard` (org-scope.guard.ts:44)
refuses a client principal a bare 404 on **every** `/api/organizations/:orgId` route that does
not carry `@AllowClientPrincipal()`, and it runs *before* `CapabilityGuard`. So
"`CapabilityGuard` has already proven the caller is a member of this organization" — the
contracts' and the README's shared rule — describes a member without the capability, not a
client contact, and reaching the 403 for a contact would mean adding
`@AllowClientPrincipal()` to the settings routes: opening a door this spec's own Security
section says is shut.

Which way it goes is a person's decision, and it is a real one — the settings pair leaking
"this organization exists and you are not allowed in" to a contact is a different disclosure
from leaking nothing. I will not settle it by preferring the requirement over the case.

### P2 — REQ-01-018 reinstates a country chain the product removed

REQ-01-018 makes a holiday reach the caller when its `countryCode` is null, **or** equals the
membership's country, **or** — where the membership states none — equals
`Organization.countryCode`. REQ-01-019 and TC-01-INT-07 both encode that third link. The
README presents it as a restatement: *"specs/time-off/ — owns the country-resolution chain the
holidays block uses: a country stated on the membership, falling back to
`Organization.countryCode`. `REQ-01-018` states that chain in full rather than pointing at it."*

That chain does not exist any more. `PATCH-012` — *"nobody inherits a country"* — removed it
product-wide, at the product owner's explicit direction, because a company registered in one
country whose people are all in another was paying and sourcing the wrong holidays.
`resolveMemberHolidayCountry` (packages/validation/src/reports.ts:566-573) reads the membership
and nothing else, and `holidays.service.ts:111-118` answers a member who states no country the
global rows only.

So the spec's stated premise is refuted by the code, and its rule, implemented, would give the
product two answers to "which country is this member in": the time-off calendar and Amounts
Owed would count a blank-country member for global holidays, and the portal would count them
for the organization's. The newest document does govern — but this one says it is restating,
not changing, and a change of this kind belongs to whoever took the PATCH-012 decision.

### P3 — `client-added` is derived, filtered and drawn, and nothing says what it says

The kind is fully specified on the way in: REQ-01-032 derives it from every `Client` at
`createdAt`, REQ-01-034 draws it for `admin` and `manager` and withholds it from `user` and
`viewer`, REQ-01-036 puts it in the Work group, TC-01-INT-10 asserts an admin is answered four
entries and a `user` three, and REQ-01-038 gives every entry a page.

Nothing specifies it on the way out. REQ-01-042 says what a vacancy's page carries, REQ-01-045
a person's, REQ-01-046 and REQ-01-047 a project's — and no requirement says what a
`client-added` page carries. `facts` is ordered by the server, so this is a server decision the
spec has to make and does not. The mock's nine states contain no `client-added` entry, the
contracts' feed example carries none, and every other kind's sentence exists only in the mock —
so the one string a reader of this feed will see for the kind is written nowhere at all.

Two implementations — a page naming the client and its creation date, versus one naming its
projects and its contacts — both satisfy every sentence in the bundle, and no case distinguishes
them. This is exactly the shape of a decision the spec owes: a single requirement and a single
sentence of copy, not another route, writer, lock or screen.

---

## What is *not* blocking, and why

Ten notes are in the handoff (`notes`). The four worth naming here:

- **The mock draws more than the contract answers.** A third "Yesterday" figure, a percentage
  bar per project, and a project row reading "Aurora — Northwind Ltd". None is answerable from
  the `GET .../portal/home` body, and no requirement asks for any of them. The contract and
  REQ-01-011/012/014 are complete on their own and the E2E case asserts only the two figures
  that exist, so this is a note and the plan builds to the contract. The Geometry & motion row
  that says "the two figures beside it" counts the mock's three; the layout rule it states —
  the figure grows rightwards into a fixed-gap band's slack — holds at two.
- **The entry response has no `detail`.** REQ-01-039 requires the page to be headed by the
  sentence the feed drew, and that sentence needs `jobTitle`, `years`, `clientName`. Composing
  it from `facts` on the page and from `detail` in the feed would be one value with two
  sources. T4 answers `detail` on the entry body as well — additive, contradicting nothing the
  contract states — and T7 writes one composer both screens import.
- **TC-01-E2E-08 names probes that do not exist.** `ui-invariants.ts` exports five, and none
  measures a shared left edge across rows or a shared right edge across cells. The case is
  still runnable, and the honest repair is to add the two probes where the case says they live.
  T10 does.
- **A panel that is a control is a design-system gap the spec's own table does not list.**
  `## Screens` requires each feed entry to be a `Card variant="panel"` that is an `<a>` and
  takes the hover a static card withholds; `Card` renders a `div`, has no `as` prop, and
  hovers nothing by design (Card.tsx:33-38, 52-77). H-15 puts it in `dsGaps`, which is where I
  have written it, with the interim shape stated so it is improvised once and recorded, not
  reinvented per screen.

I also declined to raise three things that look like findings and are not. A concurrency the
spec is silent on is planned with the lock the repository already uses — here the settings row
is a single-row upsert on a unique index and Edge case 18 settles the race as last-write-wins,
so no `FOR UPDATE` is invented. The settings screen's missing `## Screens` state and geometry
row is a note: its content is fixed copy and three switches, so no box on it is sized by data.
And the five other paths that still land a person on the members list (signup, invitation
acceptance, the wordmark, four unauthorized-visitor redirects) are left alone and recorded —
REQ-01-001 governs signing in, and moving the rest is a decision rather than a consequence.

---

## The shape of the plan

Ten tasks, globs disjoint except where a dependency makes them serial anyway.

| | Task | Files | Depends on |
|---|---|---|---|
| T1 | capabilities, `PORTAL_MESSAGES`, id/cursor codecs, anniversary maths, validators | `packages/validation/src/portal*.ts`, `roles*.ts`, `index.ts` | — |
| T2 | the migration — `OrganizationPortalSettings` | `schema.prisma`, one migration | — |
| T3 | the `/portal` group and the personal half | `apps/api/src/portal/{module,controller,home,types}`, `app.module.ts` | T1 |
| T4 | the projection, its visibility, the entry page | `apps/api/src/portal/{feed,entry,visibility}` | T1, T3 |
| T5 | the three switches, and the backdate fixture | `apps/api/src/portal/settings`, `test-fixtures.controller.ts` | T1, T2, T3 |
| T6 | integration cases | `apps/api/test/portal*.spec.ts` | T3, T4, T5 |
| T7 | the home screen | `app/org/[orgId]/page.tsx`, `src/portal/**` | T1 |
| T8 | the entry page and the settings screen | two `page.tsx` | T7 |
| T9 | the landing moves, the rail gains a row | `LoginForm.tsx`, `Sidebar.tsx`, 28 e2e files | — |
| T10 | e2e cases and two new probes | `portal.spec.ts`, `ui-invariants.ts` | T7, T8, T9 |

T1/T2/T9 have no dependencies and no overlapping files, so the first wave is three-wide. T9 is
the wide one: 33 `waitForURL('**/members')` waits across 28 e2e files, of which two
(`authentication.spec.ts:23,86`) are behavioural assertions to amend rather than scaffolding to
move. The reviewer will see a diff touching almost every e2e file in the repository, which is
why T9 carries the grep that enumerates them and the rule that decides each one.

**H-07's answer, written down.** `shippingSurfaces` has seven rows. Six carry a governing
requirement; the seventh is P3 — `client-added`, governed by nothing on the way out — and it is
`"planned": "blocked"` rather than a blank `governedBy`. The two new capability values force
all four `ROLE_CAPABILITIES` rows to be revisited by the type system; the new table has exactly
one writer and cascades with the organization; a backdated `joinedAt` is a value the column
already permits and no reader of it branches on its age; and the new route group is refused to
a client principal by a guard that already exists.

**H-11.** One migration, additive: one new table, no column added to an existing one, nothing
renamed, nothing dropped, no new `NOT NULL`. The order note is read from `infra/deploy.sh:27` —
migrations run before the Terraform rollout, on the new image — and not restated from `CLAUDE.md`.

**H-12.** Every authorization decision in the plan runs through `normalizeRole`, by way of
`hasCapability`, so a stored `admin`/`member` is judged as `admin`/`user` and the target set
`admin | manager | user | viewer` is what the tables are keyed by. A client principal holds no
role and is refused before any role-keyed helper is asked — which is `capabilitiesForPrincipal`'s
whole reason for existing, and why nothing in this plan calls `hasCapability` on a contact.

**H-13/H-14.** No external contract and no double: every route in this spec is this repository's
own, behind the session cookie, and the spec's own rehearsal ran with no credential beyond a
signed-up account.

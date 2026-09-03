# implement — attempt 3

Spec: `specs/requests/03-client-participants.md` (+ `.contracts.md`, `.cases.md`)
Commit: `301414e implement 3: a client-addressed request is not reassigned, and the shell
gates a contact (review 1 F1, F3, F4, F5)`, on top of attempt 2's `771451a`.

Four findings fixed. One — F2 — is a contradiction inside the bundle that no
implementation satisfies, raised as a `spec` finding rather than settled here.

## One line per finding

### F1 — reassign extended to client-addressed requests. **Fixed.**

The finding is correct in every part. `showReassign` was `!terminal && canViewAll`, so the
control was drawn for an admin on a client-addressed row; the route then cleared
`assigneeClientMembershipId`, and `previous` was read from `locked.assigneeMembershipId`
alone, so the `assignee_changed` event carried `oldValue: null` and `oldLabel: null`. The
request left the contact's inbox naming nobody it was taken from, and the row ended as a
client-audience topic with a member addressee — the pairing REQ-03-024 refuses at creation.

Fixed by *not* extending the route, which is what this spec asks for: "a reassign path that
accepts a client addressee" is the change its Known Gaps names as **not built**.

- `apps/api/src/requests/requests.service.ts` — `reassignRequest` refuses a locked row whose
  `assigneeKind` is not `member` with `409 { error: 'conflict', message:
  REQUEST_MESSAGES.invalidTransition }`, decided on the row read under the lock, before the
  body is looked at. The `assigneeClientMembershipId: null` write is gone, so the route
  touches nothing about a client addressee at all.
- `apps/web/app/org/[orgId]/requests/[requestId]/page.tsx` — `showReassign` now also
  requires `request.assignee.kind !== 'client'`. The comment beside the inactive banner
  that the finding calls out as asserting the opposite is now true of the code.
- `apps/api/test/client-participants.spec.ts` — a new case: reassigning a client-addressed
  request answers 409, the row keeps its kind, its contact and its null
  `assigneeMembershipId`, **no** `assignee_changed` event is written, the request is still
  in the contact's list, and a member-addressed request in the same organization still
  reassigns 200 — so the refusal is about the row and not about the route being broken.
- `e2e/tests/client-participants.spec.ts` — TC-03-E2E-04 now opens the client-addressed
  request it just raised **as the admin who raised it** (who holds `view-all-requests`, the
  capability that draws the control) and asserts the grant control is drawn and the reassign
  control is not. That is the finding's own witness, at the level it lives on.

One choice worth a reviewer's eye: the refusal reuses `REQUEST_MESSAGES.invalidTransition`
("This request cannot move to that state"). A client-addressed request could not exist
before this spec, so *any* answer here is new; the bundle's Error Messages table has no
sentence for it, and inventing one would be writing product copy no spec states. Reusing the
conflict message the route already answers with seemed the smaller deviation than a new key.
If the reviewer prefers a named message, it needs a line in the spec first.

### F2 — `user` may address a contact and cannot list one. **Contested as a spec finding, not fixed.**

The finding is correct and I am not settling it. Both statements are in the same bundle and
no implementation satisfies both:

- `specs/requests/03-client-participants.contracts.md:11` — "Raise a request, to a colleague
  or to a client contact | admin ✅ | manager ✅ | **user ✅** | viewer ❌".
- `specs/requests/03-client-participants.contracts.md:41` — the only route in the product
  that lists contacts, `GET /api/organizations/{orgId}/clients/{clientId}/contacts`, carries
  the guard `view-clients`.
- `packages/validation/src/index.ts`, the `user` row of `CAPABILITY_MATRIX`:
  `'create-request': true`, `'view-clients': false`, `'manage-clients': false`.

Every way out picks a side, and each is a product decision rather than an implementation
one: widen `view-clients` to `user`; add a route that serves addressable contacts to a
`create-request` holder (which the Routes table does not have); or withdraw the client
addressee kind from a `user`, contradicting the matrix. I flagged this as a note on attempt
2 and implemented neither side; the review has now raised it as blocking, which is the right
place for it to be decided. The modal is left exactly as it was — it claims nothing it
cannot show, and the server decides the addressee either way.

### F3 — manual contexts and `baseURL`. **Fixed.**

`e2e/tests/client-participants.spec.ts` now builds both contexts with
`browser.newContext({ baseURL: WEB_ORIGIN })`, importing `WEB_ORIGIN` from
`../environment` — the same module `playwright.config.ts` reads its own `baseURL` from, so
the two cannot drift, and the case no longer depends on what a hand-built context inherits.

One correction to the record, offered as evidence and not as a rebuttal: the case did run
and pass on attempt 2, twice — `✓ 4 [chromium] › …removal › removing a contact ends their
live session on the next call (20.6s)`, and again inside the 5-passed run — so in this
checkout the relative `goto` resolved rather than throwing. I have fixed it regardless,
because relying on that is relying on unspecified fixture behaviour, the neighbours the
finding cites all navigate hand-built contexts absolutely, and being explicit costs nothing.

### F4 — the members screen served chrome over a refused read. **Fixed, at the class level.**

The finding is right, and right that patching the members screen alone would leave the
class half-covered — which is what CR-18 is about. Gated once, in the shell:

- `apps/web/app/org/[orgId]/layout.tsx` — a resolved client principal on any path under
  `/org/{orgId}` that is not the requests area calls `notFound()`. This is the web's
  counterpart of the server's single choke point: a screen added later is refused by
  default, exactly as `OrgScopeGuard` refuses a route added later. Members, member detail,
  time tracking, documents, settings and anything else are all covered by the one gate;
  `/org/{orgId}/requests` and `/org/{orgId}/requests/{id}` remain theirs.
- `e2e/tests/client-participants.spec.ts` — TC-03-E2E-02 now asserts what its Expected
  Result says: on each of the three addresses, not only is the list absent but so is the
  chrome — `members-search-input`, `show-removed-checkbox`, `app-sidebar`,
  `projects-table`, `clients-search` — and the contact's own requests screen still renders,
  so the assertion proves a gate rather than a broken build.

### F5 — TC-03-UNIT-02's load-bearing assertion. **Fixed.**

The finding is exactly right: `can(normalizeRole(null), 'view-own-requests')` is true by
construction and asserts nothing. `packages/validation/src/roles.test.ts` now calls both
helpers with **the same absent role**, which is the input a client principal would arrive
with, and asserts the disagreement the spec states: `hasCapability(null, 'ViewOwnRequests')`
is `true` and `can(null as unknown as Role, 'view-own-requests')` is `false` (and `undefined`
likewise). Both assertions can fail: `can` answers false through
`CAPABILITY_MATRIX[role]?.[capability] ?? false`, so a change that made it grant an absent
role would break this case, which is precisely what it is for.

## Commands run

| Command | Result |
|---|---|
| `npm run test:unit` (root) | `Test Files 23 passed (23)`, `Tests 1098 passed (1098)` |
| `npx tsc --noEmit` in `apps/api` | clean |
| `npx tsc --noEmit` in `apps/web` | clean |
| `npm test -- test/client-participants.spec.ts test/request-notifications.spec.ts test/requests.spec.ts` (apps/api) | `Tests: 59 passed, 59 total` (58 before; the new reassign case is the extra) |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/client-participants.spec.ts tests/regressions.spec.ts` | `14 passed (51.0s)` |
| `… tests/app-shell.spec.ts tests/requests.spec.ts tests/members-list.spec.ts tests/clients.spec.ts tests/projects.spec.ts` | `28 passed (1.2m)` |

`members-list`, `clients` and `projects` were run because the shell gate sits in front of
all three; `requests` and `app-shell` because the reassign control and the sidebar are
theirs.

## Still standing from attempt 2

The DS `Modal` change (`1_DS for dev/components/surfaces/Modal.jsx` — a dialog caps at
`calc(100vh - 40px)` and scrolls its body) is unchanged and still belongs in this spec's DS
gaps table, which I cannot edit. Same for the two spec-01 assertions this spec supersedes,
and the note that a decline writes two outbox rows per recipient.

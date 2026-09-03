# implement — attempt 5

The delta this pass is one route and its reader: **T11** (`GET
/api/organizations/{orgId}/request-contacts`) and **T9**'s changed effect, the two tasks the
amended spec added as REQ-03-043 and TC-03-INT-36. Every other task in the handoff is marked
`shipped` and nothing in this pass names one, so nothing else was touched.

## Tasks

| Task | Files touched |
|---|---|
| T11 — the addressees a requester may choose from | `apps/api/src/requests/requests.controller.ts` (the `@Get('request-contacts')` handler, no `@AllowClientPrincipal`), `apps/api/src/requests/requests.service.ts` (`listRequestContacts`), `apps/api/src/requests/requests.dto.ts` (`RequestContactDto`, `RequestContactsDto`) |
| T9 — the contact picker reads the requester's own route | `apps/web/app/org/[orgId]/requests/NewRequestModal.tsx` (the contacts effect) |
| T10 — the cases | `apps/api/test/client-participants.spec.ts` (TC-03-INT-36) |

**T11.** The caller is resolved through the service's own `requireCaller` /
`requireMemberCaller`, so a client principal is answered the bare 404 `OrgScopeGuard` already
gives them and the two layers cannot disagree. A member without `create-request` gets a bare
`NotFoundException` — 404 with no message, the discipline the contacts routes use. The query
scopes by `session.organizationId` (never the path parameter) and returns active
`ClientMembership` rows whose client owns an **active** project the caller holds a
`ProjectMember` row on. Those are the create route's own boundaries: REQ-03-023's assignment,
with no admin carve-out; a removed contact would be `assigneeInactive` at creation and an
archived project `projectUnavailable`, so neither is offered. Rows are ordered by client name
then given name, so the picker is stable.

**T9.** The effect no longer reads `…/clients?status=active` and then one
`…/clients/{clientId}/contacts` per client — the loop that made the picker unfillable for a
`user`, since that route is guarded by `view-clients`. It makes one read of
`…/request-contacts` and maps the rows onto the existing `ContactOption` shape, so the
two-line `Select` label, the project narrowing that keys off `chosenContact.clientId`, the
field order and the errors are all unchanged. The guard `contacts.length > 0` is gone: the
read now runs on the modal's open cycle, the shape the topics effect already uses, so a
contact invited or removed elsewhere in the session is not offered stale.

## Test cases written this pass

| Case | Where |
|---|---|
| TC-03-INT-36 | `apps/api/test/client-participants.spec.ts` — 'offers a requester the contacts of the clients they work for, and no others' |

Two clients, each with a project and an active contact, plus a removed contact of the first.
A member holding `user` is assigned to the first client's project only: they are answered
`200` with that client's contact alone — the second client's contact and the removed one are
both absent — while the same caller is answered `404` by the client book, which is the point
of the route existing. The admin, assigned to no project, is answered `200` with an empty
list rather than the organization's client book. The `viewer` is answered `404`, and the body
is asserted byte-identical to the one an organization they have no part in answers, so the
refusal names no capability.

## The findings that sent this back

- **F1 — reassign clears a client addressee and writes a trail naming nobody.** *Fixed
  (attempt 3, commit `301414e`; verified standing this pass.)* `reassignRequest` refuses a
  locked row whose `assigneeKind` is not `member`, so a client-addressed request is never
  taken out of a contact's inbox and the `assignee_changed` event with a null `oldLabel` can
  no longer be written. The detail screen draws no reassign control on such a row
  (`showReassign` now tests `request.assignee.kind !== 'client'`) and the comment that
  asserted the opposite is gone. Covered by
  `apps/api/test/client-participants.spec.ts` — 'refuses to reassign a request addressed to a
  client contact, changing nothing', which passes in this pass's run.
- **F2 — the permission matrix grants `user` the client addressee kind while the only
  contacts route is guarded by `view-clients`.** *Fixed this pass.* The contradiction was
  resolved in the document, by a person, before this run's plan was built: REQ-03-043 and the
  Routes row for `GET …/request-contacts` guarded by `create-request`, with TC-03-INT-36. This
  pass implements exactly that — T11 above — and the modal reads it, so a `user` assigned to
  the client's project is offered the contacts the create route will accept from them and no
  others. TC-03-INT-36 exercises the `user` the finding named, which is the caller no case
  covered before.
- **F3 — TC-03-E2E-03's hand-built contexts carry no baseURL.** *Fixed (attempt 3; verified
  standing.)* Both contexts are created with `browser.newContext({ baseURL: WEB_ORIGIN })`,
  the same explicit origin every other manual context in the suite uses. The case runs and
  passes.
- **F4 — the members screen renders its chrome behind a 404 for a client principal.** *Fixed
  (attempt 3; verified standing.)* The gate is in `apps/web/app/org/[orgId]/layout.tsx`: a
  resolved client principal on any path under `/org/{orgId}` outside the requests area calls
  `notFound()`. One gate rather than one per screen, so a screen added later is refused by
  default — the web's counterpart of `OrgScopeGuard`. TC-03-E2E-02 asserts the chrome is
  absent, not merely the list.
- **F5 — TC-03-UNIT-02 asserts a normalized role where the case names the absent one.**
  *Fixed (attempt 3; verified standing.)* Both helpers are called with the same absent role
  and the disagreement the spec states is asserted: `hasCapability(null, 'ViewOwnRequests')`
  is `true`, `can(null, 'view-own-requests')` and `can(undefined, …)` are `false`. Each
  assertion can fail if either helper changes.

## Commands run

| Command | Result |
|---|---|
| `npx tsc --noEmit` in `apps/api` | clean |
| `npx tsc --noEmit` in `apps/web` | clean |
| `npm run test:unit` (root) | `Test Files 23 passed (23)`, `Tests 1098 passed (1098)` |
| `npm test -- test/client-participants.spec.ts` (`apps/api`) | `Tests: 30 passed, 30 total` (29 before; TC-03-INT-36 is the extra) |
| `npm test -- test/requests.spec.ts test/request-notifications.spec.ts` (`apps/api`) | `Tests: 30 passed, 30 total` |
| `E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/client-participants.spec.ts tests/regressions.spec.ts` | `14 passed (50.7s)` |
| `… npx playwright test tests/requests.spec.ts tests/clients.spec.ts` | `19 passed (56.9s)`, 1 flaky |

The flaky case is `requests.spec.ts:448` — 'the history lists creation, the status change and
the reassignment'. Its first run died on `apiRequestContext.post: read ECONNRESET` against
`POST /api/signup` in the fixture, before the browser opened; it passed on retry. That is the
transport, not the reassign path — the case drives a member-addressed request, which this
pass did not touch. `requests.spec.ts` and `clients.spec.ts` were run because the modal's
contact picker is on the first and the client book's own contacts route, which keeps
`view-clients`, is behind the second.

## Notes for the reviewer

- The reassign refusal (F1) answers `409` with `REQUEST_MESSAGES.invalidTransition`. Requests
  spec 03 names "a reassign path that accepts a client addressee" in Known Gaps as the thing
  that is not built, and states no status for the refusal; `invalidTransition` is spec 01's
  existing sentence for a move the request cannot make, and it is the narrowest answer that
  keeps the route from doing what no requirement asks.
- The DS `Modal` change from attempt 2 (`1_DS for dev/components/surfaces/Modal.jsx` — a
  dialog caps at `calc(100vh - 40px)` and scrolls its body) still stands and still belongs in
  this spec's DS gaps table, which I may not edit.

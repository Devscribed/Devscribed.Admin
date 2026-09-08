# pre_implement — portal/01 Home (attempt 3)

Spec: `specs/portal/01-home.md` (sha `45d79cf7…`, the bundle as commit `69bba60` left it)
Verdict: **blocked** — one finding, `spec`.

Attempts 1 and 2 blocked on six defects between them. Commit `69bba60` repaired the three that
were open, and I re-read the whole bundle from the top rather than diffing against the last plan.

**The three from attempt 2 are settled, and none is raised again.** Acceptance Criterion 5 now
says the four roles are answered the same entries and names the one field that differs, observed
by TC-01-INT-10 and TC-01-INT-15; the README's stale "Client entries — withheld from user and
viewer" row and its four-source projection sentence went with it. `holidays` has left `timeOff`
and is a sibling of it in the body, `portal-timeoff-figures` is the id that disappears when a
membership has no financials while `portal-timeoff-panel` stands, and the mock's state 2 was
redrawn to match — so TC-01-E2E-03's member can be answered both a missing reserve and a
no-country sentence. The four cases that counted feed entries as if the organization had no
members now each say what they mean: TC-01-INT-11 switches People and Hiring off before seeding,
TC-01-INT-14 asserts one `vacancy-opened` and no kind but `member-joined` beside it, TC-01-INT-10
asserts equality between four bodies rather than a count, and TC-01-E2E-07 switches all three
groups off.

What re-reading turned up instead is one defect, and it is in the row of §Error Messages nobody
looked past the export name of.

## The blocker

**P1 — the one message this spec does not own says something else.** §Error Messages states
`TEMPLATE_MESSAGES.generic.forbidden`'s text as *"You do not have permission to do that."* and
marks the row `New: no`, meaning the export already carries it. It does not:
`packages/validation/src/documents.ts:125` is `'You do not have permission to manage templates'`,
and that is the string `CapabilityGuard` puts in every 403 it raises
(`apps/api/src/auth/capability.guard.ts:63-66`).

Both readings break something the spec states:

- Emit the export as it stands — which is what §Routes asks for, naming
  `CapabilityGuard('ManagePortalSettings')` on both settings routes, and what TC-01-INT-13
  asserts, since it names the export rather than a literal. A manager refused the portal's
  settings then reads a sentence about templates.
- Change the export's text to the one §Error Messages states. Then every capability-guarded 403
  in the product changes its message, `apps/api/test/document-templates.spec.ts:576` and
  `packages/validation/src/documents.test.ts` both fail on the literal they assert, and both of
  the README's own guarantees go — §Blast Radius' "Nothing in the documents, hiring, requests,
  reports or time-off areas changes" and §Backward Compatibility's "Every existing route answers
  exactly what it answered".

The implementer cannot settle it, because the choice is between contradicting the spec's own
table and editing a message shared by every area the spec swears it does not touch. The third
answer — a `PORTAL_MESSAGES.forbidden` of this spec's own — is a real option and it is a
person's: it means the refusal is raised in the service rather than by the guard, which is what
the requests area already does where a spec names the message a refusal must carry
(`apps/api/src/requests/requests.controller.ts:30-35`), and it contradicts the `CapabilityGuard`
the Routes column names.

This is not growth. No route, column, lock, screen or concurrency case repairs it; one sentence
does.

Attempts 1 and 2 both marked H-09 `ok` on this row. Both checked that the export exists and that
`CapabilityGuard` emits it, and neither read the string.

## What compiled cleanly

Ten tasks, `files` given as explicit paths rather than directory globs so a parallel wave can
split them: T1 the shared vocabulary in `packages/validation`, T2 the one additive table, T3/T4/T5
the API in three services behind one controller, T6 the integration file, T7/T8 the two web
surfaces, T9 the landing and the rail, T10 the E2E file. All 51 requirements are named in a task's
`requirements` and all 33 live cases have an owner; `handoff-coverage` comes back clean.

**The route group needs strikingly little authorization code, and the plan records that as a
prohibition rather than leaving it to be discovered.** `OrgScopeGuard` already answers a client
principal a bare 404 on any `:orgId` route that has not written `@AllowClientPrincipal()`, and it
runs ahead of `CapabilityGuard` — so the first four rows of REQ-01-004's table are satisfied by
*not writing a decorator*, the settings pair included. T3 says so in those words, because the
defect this prevents is invisible: a decorator added for convenience turns four 404s into a 403
that confirms an organization exists.

**H-07 turned up nine shipping surfaces.** Two are widenings and both are the spec's own
decisions, argued in the README's Product decisions and in Acceptance Criterion 8: a `user` and a
`viewer` read a vacancy's description, categories, interview length, interviewer and booking link
through the entry page, which both hiring reads refuse them with a 403 the spec's own rehearsal
observed; and they read a project's name and start date for projects they are not on, where
`GET .../projects` answers a `user` an empty list and refuses a `viewer` outright. Both are
bounded — `clientName` is null unless the reader holds `view-clients` or is a `ProjectMember`, and
the roster is omitted unless they hold `manage-projects` or are one. A third that *looks* like a
widening and is not: a member entry page carries a name, a job title and a joining date, and
`view-list` is true for all four roles, so both already reach the member card that carries the
same three facts. It is in the table anyway, because somebody will ask.

**Concurrency is thin by construction.** Every route but one is a read and REQ-01-054 forbids
writing a row on one. The single writer is the settings upsert on a `@unique organizationId`,
which is itself the create-or-update atomicity REQ-01-051 asks for; Edge case 18 settles the race
as last-write-wins, and because all three booleans are required there is no partial body that
could interleave into a mixed state. No lock is added and none is needed.

The migration is one table and no change to any existing one, which is what makes the rollback
direction safe; T2's note states the order read from `infra/deploy.sh:27` rather than from
`CLAUDE.md`.

## Judgement calls recorded rather than raised

Twelve notes are in the handoff. Four are worth naming here.

*The README's enumeration of the landing move is short by a file.* §Blast Radius says the change
is "mechanical and enumerable" and that `grep -rn "waitForURL('\*\*/members'" e2e/tests` is the
whole list. It finds 33 lines in 28 files and misses `e2e/tests/client-participants.spec.ts:32`,
which waits `**/${destination}` and is called with `'members'` six times. It also does not
distinguish the two waits that must *not* move — `signup.spec.ts:16`, because the signup form
pushes its own destination, and `invitation.spec.ts:115`, because the accept screen does. T9's
`allCallSites` is the corrected enumeration, line by line, so the implementer never reads the
grep. A note rather than a blocker: the requirement is unambiguous and the plan carries the truth.

*Signing up still lands on the members list.* REQ-01-001 moves the post-sign-in destination and
Out of Scope names only `/`, so `SignupForm.tsx:101` and `AcceptInviteScreen.tsx:314` keep theirs.
A person who has just created an organization does not see the portal until their second session.
Determinate to build, and a product seam a person may want closed.

*The no-country sentence is drawn over holidays that reached the reader.* §Screens replaces the
holidays list with `PORTAL_MESSAGES.noCountry` whenever no country is stated, while REQ-01-019 and
the contract answer such a member the global rows. The states table decides what is built, so it
is not ambiguous — but on an organization with a global holiday the screen says "no holiday
calendar reaches you" and discards a row the body carried, and no case in the bundle distinguishes
the readings because every case with no country also has no global holiday.

*A panel that is a control.* §Screens requires each feed entry to be a `Card variant="panel"` that
is an `<a>` and hovers. `Card` renders a `div`, has no `as` prop and withholds hover on purpose
(`Card.tsx:33-38`). The spec's own DS gaps table does not carry it, so it is in the handoff's
`dsGaps` with the interim shape — an anchor around the card, existing tokens only — and the
improvisation is on the record rather than in the diff.

## Compile checklist

Every id is answered in `pre_implement.verdict.json#compiled`. `H-09` is the finding. Nineteen
others are `ok` or `n/a`; the two `n/a`s are the External Contracts pair, and the bundle has no
such section because every route in it is this repository's own, behind the session cookie.

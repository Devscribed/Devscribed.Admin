# pre_implement — portal/01 Home (attempt 2)

Spec: `specs/portal/01-home.md` (sha `e913c605…`, the bundle as commit `4e49f1f` left it)
Verdict: **blocked** — three findings, all `spec`.

Attempt 1 blocked on three defects. Commit `4e49f1f` repaired all three, and I re-read the bundle
from the top rather than diffing: REQ-01-004 is now a total decision table over principal and
capability and agrees with `OrgScopeGuard`; REQ-01-018/019 resolve the holiday country from the
membership alone, which is what `resolveMemberHolidayCountry` and `HolidaysService` already do
after PATCH-012; the `client-added` kind is gone from the derivation, the visibility table, the
groups and the mock. Those three are settled and are not raised again.

What the repair left behind, and what re-reading the whole bundle turned up instead, is below.

## The three blockers

**P1 — Acceptance Criterion 5 still describes the feed the repair deleted.** The criterion asks
for a `user` and an `admin` to be answered *different* feeds whose difference is *exactly the
client entries*. REQ-01-032 now derives no entry from a `Client` at all, REQ-01-034's table marks
every remaining kind Drawn for every reader, and TC-01-INT-10 — the case the criterion names as
its own observer — asserts that all four roles are answered the same set. Nothing can satisfy the
criterion and the requirement together, and this is not a stale pointer a reader can route around:
the acceptance criteria are what QA reads at the end of the run.

**P2 — the holidays block is inside the reserve block, and one E2E case needs it outside.**
`timeOff` in the home body carries `availableDays`… *and* `countryCode` *and* `holidays`;
REQ-01-016 and the contract make the whole object `null` when the membership has no
`MemberFinancials` row, and TC-01-INT-05 asserts exactly that. TC-01-E2E-03 then signs in a member
with no financials and asserts both that `portal-timeoff-panel` is absent in full **and** that
`portal-holidays-no-country` is visible — a message the screen has no field left to decide, drawn
inside a panel the same case has just removed. TC-01-INT-06 and TC-01-INT-07 read holidays without
saying financials exist, so they lean the same way. The question underneath is a product one — does
a member nobody has configured a salary for see the holidays that reach them? — and it is a
person's to answer, in the document.

**P3 — four cases count feed entries as if the organization had no members.** REQ-01-027 derives a
`member-joined` entry from every active `Membership`, and every organization in an E2E or
integration run has at least the admin who created it, plus one membership per role a case signs in
as. TC-01-INT-14 expects "exactly one entry, `vacancy-opened`"; TC-01-INT-11 expects five projects
to page 2/2/1; TC-01-INT-10 expects "the same three entries" from four role-callers; TC-01-E2E-07
expects `feedEmptyBody` exactly once while only Work and Hiring are switched off. None of the four
can pass. The repair is a decision about the cases — switch People off in the ones that count, or
restate the counts relative to the memberships present — and an implementer who quietly picks one
has rewritten the spec's own arithmetic.

None of the three is repaired by adding a route, a column, a lock or a screen, so none is growth.

## What compiled cleanly

The plan is ten tasks with disjoint file globs (T1 validation, T2 the migration, T3/T4/T5 the API
in three services behind one controller, T6 integration, T7/T8 the web screens, T9 the landing and
the rail, T10 e2e). All 51 requirements and all 33 live cases are assigned; `handoff-coverage`
comes back clean on 7/7 sections.

The route group needs strikingly little new authorization code. `OrgScopeGuard` already answers a
client principal a bare 404 on every `:orgId` route that does not carry `@AllowClientPrincipal()`,
and it runs ahead of `CapabilityGuard` — so REQ-01-004's first two rows are satisfied by *not
writing something*, which is recorded in T3 as a prohibition rather than left to be discovered.
The `member/notHeld` row is `CapabilityGuard`'s existing 403 with the existing message.

H-07 turned up seven shipping surfaces. Six are governed by requirements in this spec. The seventh
is the interesting one and is **not** a finding: the entry page answers a `user` and a `viewer` a
vacancy's title, description, categories, interviewer and booking link — facts both hiring reads
refuse them today with a 403 that the spec's own rehearsal observed. That widening is deliberate,
argued in the README's Product decisions and in Acceptance Criterion 8, and bounded to the five
fields REQ-01-042/043 name. It is written down as a surface so the next spec that narrows a vacancy
finds the second reader.

Concurrency is thin by construction: every route but one is a read, and REQ-01-054 forbids writing
on a read. The single writer is the settings upsert, keyed by the unique `organizationId`, and Edge
case 18 already settles its race as last-write-wins on a whole-record replacement.

The migration is one additive table and no change to any existing one, which is what makes the
rollback direction safe; the order is read from `infra/deploy.sh:27` and stated in T2's note.

## Judgement calls recorded rather than raised

Thirteen notes are in the handoff. Four are worth naming here.

*The mock draws more than the contract answers.* A third month figure ("Yesterday 5h 22m"), a
per-project percentage bar, a project row reading "Aurora — Northwind Ltd". No field behind any of
them, no testid for any of them, and the Geometry row counts the mock's three figures. Built to the
contract: two figures. This is a note because the contract and the testid table agree with each
other and only the drawing disagrees.

*"Open requests" means `status = 'open'`.* The requests area's own waiting-on-me counter spans
`['open','answered']`. The spec names the status the schema names, and TC-01-INT-08 seeds five rows
in that state, so an `answered` request is not drawn on this panel.

*The stale sentences the client removal left.* §Roles & Permission Matrix still says "what varies
is which entries the answer contains, and that is REQ-01-040's table" — wrong id, and after the
repair nothing varies; the area README still lists the projection as being over "Membership,
Vacancy, Project and Client" and still carries a "Client entries — withheld from user and viewer"
row; TC-01-INT-10 attributes the `clientName` difference to TC-01-INT-11, which covers paging.
None of them changes what is built, because the requirements they contradict are unambiguous. They
are in note N11 so one repair pass can take them with P1.

*A panel that is a control.* `## Screens` requires each feed entry to be a `Card variant="panel"`
that is an `<a>` and hovers. `Card` renders a `div`, has no `as` prop, and withholds hover on
purpose. That is a design-system gap the spec's own DS gaps table does not carry; it is in the
handoff's `dsGaps` with the interim shape (an anchor around the card, existing tokens only) so the
improvisation is on the record rather than in the diff.

## Compile checklist

Every id answered in `pre_implement.verdict.json#compiled`. `H-07` is `ok` this time — every new
value's shipping paths are listed with the rule that governs them. The findings sit on `H-02`
(three live cases that cannot pass as written) and on the Acceptance Criteria section.

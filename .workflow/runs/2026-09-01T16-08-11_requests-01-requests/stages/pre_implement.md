# pre_implement — requests/01, run 2026-09-01T16-08-11

Spec `specs/requests/01-requests.md` (sha256 `3906ab32…`), branch `spec/requests`,
diff base `f06c7d8`, HEAD `3d46cb3`.

## The situation this run inherits

The branch already carries a full implementation of this spec, written by five earlier runs
(`481a165`, `6f2dbb5`, `e17de7a`, `2d802e9`, `37b27c4`) — 7,314 insertions across 34 files
against the base commit. Then a person corrected the spec in `3d46cb3` in response to four
defects the last review raised. **The plan this run owes is therefore the delta between that
correction and the code, plus whatever of the carried findings is still true** — not a
re-statement of work already on disk. Every task below opens with `PRESENT at HEAD` or `OPEN`
and names the file and line that settles which.

## The two carried findings, verified first

Both were raised before the spec was corrected, so neither could be taken as a current fact.

**F1 — the detail page casts the raw session role. Still present.**
`apps/web/app/org/[orgId]/requests/[requestId]/page.tsx:46` still reads
`const role = session.role as Role`, feeds it to `can()` at `:47` and compares it to `'admin'`
at `:48`. Nothing about the corrected spec retires it: the amended requirement 36 narrowed the
reassign control to the detail screen, which is one of the two things `canViewAll` gates on that
very screen (`:192`). `can()` is still a bare table lookup with a `?? false` fallback
(`packages/validation/src/index.ts:716-718`) and `CAPABILITY_MATRIX` still has no `member` key,
so a legacy role reads false for every capability rather than being mapped to `user`. The two
sibling files written in the same task normalize —
`apps/web/app/org/[orgId]/requests/page.tsx:93` and
`apps/web/src/layout/requests-badge-context.tsx:41` — and the area README's Shared Rules table
carries "Capability checks on a staff role run against `normalizeRole()`", defined by this spec.
Planned as **T1**.

**F6 — `--no-carry` documented but not forwarded. Already fixed.**
`scripts/ship.mjs:393` now reads
`...(flag('no-carry') ? ['--no-carry'] : [])`, alongside the `--carry` spread at `:392`, so
`wf.mjs:393` sees the flag and initialises with `{ from: null, findings: [] }`. Fixed by
`3d46cb3`, whose diffstat includes `scripts/ship.mjs | 3 +-`. No task owed.

## The sweeps

**Contradiction.** The absolutes were taken one at a time against the call sites they forbid.
Requirement 36 ("the list row is unchanged") against requirement 45's exhaustive row contents:
`RequestRow.tsx` carries only the number, title, status, addressee, project and the two flags —
no banner, no reassign control. Consistent, and this is exactly the contradiction `3d46cb3`
resolved. Requirement 42's "unknown value is a 400, never a silent fallback" against every
caller of the retired vocabulary: all three named callers are changed, and
`parseRequestStatusFilter` (`packages/validation/src/index.ts:1957`) now has no caller in
`apps/` or `e2e/`. Requirement 47's "no outbound call of any kind" against `MailService`:
`git diff f06c7d8..HEAD -- apps/api/src/mail` is empty and `MAIL_MESSAGE_TYPES`
(`apps/api/src/mail/mail.service.ts:127-137`) still holds nine entries.

One near-miss, recorded as a note rather than a blocker: State Machine invariant 8 enumerates
the writers of a `Request` row as "the create handler, the four transition handlers, the edit
handler and the reassign handler", while requirements 19 and 32 require the **message** handler
to write `Request.lastActivityAt` — a sixth writer the enumeration omits. It does not block:
the two rules point at one implementation the moment `lastActivityAt` is read as the list's sort
key, the code writes it under the same row lock as everything else
(`apps/api/src/requests/requests.service.ts:448`, inside the transaction that locks at `:419`),
and no reader of the spec would build the other thing. It is in the verdict as a note so the
next edit of that invariant closes it.

**Premise.** Nine claims checked against the file that implements them, all recorded in
`premises`. The load-bearing one is the deploy order, read from `infra/deploy.sh` rather than
from prose about it: `:176-181` registers the migrate task definition on the **new** image with
a `-target` apply, `:184` runs `infra/migrate.sh`, and only `:188` applies the services — so the
schema is live while the **previous** image serves, which is what makes "additive" load-bearing
rather than stylistic. `:175` skips the whole block on a web-only deploy. Two stale line
citations found and not escalated: the spec cites `packages/validation/src/index.ts:1878` for
`parseRequestStatusFilter`, which is at `:1893` in the base commit and `:1957` now, and the area
README cites `:1746` for `REQUEST_MESSAGES`, correct at the base commit and `:1771` now. Both
name the symbol correctly, so neither can send anyone to the wrong place.

**External claims.** There are none. The spec's Verification Plan records that this feature
depends on no third-party system, no API key and no MCP server, and sends no mail; no credential
for it appears in any tracked file. The only double in the plan is the recording `MailService`,
and `doubleBehaviours` plans it from the one behaviour it must reproduce — recording zero sends —
asserted against `MAIL_MESSAGE_TYPES` rather than against the spec's sentence about itself.

**Call sites.** Requirement 28's "every transition" and invariant 3's "never against a copy
loaded earlier" are enumerated in T7's `allCallSites`: `postMessage` (`:410`), `transition`
(`:479`, the single path behind all four routes), `patchRequest` (`:587`) and `reassignRequest`
(`:701`), each entering through `lockRequest` (`:786-805`). T1's list enumerates the two
capability reads on the screen it fixes and the three siblings that already do it right.

**Writers.** Six writers of a `Request` row, all taking `SELECT … FOR UPDATE` on it, plus the
create handler which additionally locks the `Organization` row for the number
(`:355-358`). Recorded in the `concurrency` block of T6 and T7.

**Messages.** All 31 Error Messages rows exist on `REQUEST_MESSAGES`
(`packages/validation/src/index.ts:1803-1833`) and each is mapped in `messages` to the route or
validator that emits it. The four `notYours*` messages are one-per-route by construction — they
are fields of the four transition descriptors at `:94`, `:103`, `:109`, `:115` — which is what
makes AC-16's "no route answers both" checkable. No row's text exists nowhere, and no row is
answered by another spec's message.

**Verification.** Every row of the Verification Plan's state table says the route exists today,
and each was checked: the six helpers it names are all in `e2e/tests/helpers.ts`. The spec owes
no fixture, no helper and no environment value, so no task depends on one.

**Sections.** All 21 `##` headings answered by name in `sections`, including the `DS gaps`
section that `3d46cb3` added.

## What the corrections left open

Three things, and only three.

1. **T1**, above.
2. **T2 — `request-detail-decline-error`.** It is the only id in the spec's Required
   `data-testid` list that exists nowhere under `apps/web`.
   `DeclineRequestModal.tsx:154-166` renders the field error in a bare `<div>` while the modal's
   two other ids sit at `:102` and `:138`. TC-01-E2E-05 correspondingly asserts only
   `expect(request-detail-decline-reason).toBeVisible()` after the empty submit
   (`e2e/tests/requests.spec.ts:387`) — which is precisely the assertion the corrected case calls
   out as one that "would pass for a modal rendering no error at all". Both halves are one task,
   because fixing either alone leaves the guard meaningless.
3. **T3 — the DS-gap controls carry literals.** The new `DS gaps` section says the native
   textarea and date input ship "no hardcoded colours or sizes", and CLAUDE.md says the same.
   Every colour in those blocks is already a token; eight sizes are not — four `1.5px` border
   widths and four `12px` paddings, at `NewRequestModal.tsx:329,337,419,427`,
   `DeclineRequestModal.tsx:142,146` and `[requestId]/page.tsx:378,386`. Both substitutions are
   exact and change no pixel: `--sp-6` is 12px (`1_DS for dev/tokens/spacing.css:8`) and
   `--border-crisp` is 1.5px, described there as "the Meridian house border"
   (`1_DS for dev/tokens/radii.css:14`). Scope is fixed to these four files — the precedent the
   spec's own DS-gaps row names,
   `apps/web/app/org/[orgId]/members/[memberId]/RejectRequestModal.tsx:198`, carries the same
   literal and belongs to spec 09.

Requirement 42's spec-10 amendment is **complete** and owes no task: the spec now says so in
terms, and `specs/user-management/10-organization-requests-page.md` carries twelve
`Amended by requests/01` markers plus three `- **Retired.**` notes. Requirement 42's E2E edit is
also done — `e2e/tests/requests-page.spec.ts:144-148` selects the `Open` filter before approving,
so TC-10-E2E-01 still guards its rule under an `all` default.

## Coverage

`node scripts/handoff-coverage.mjs` returns **pass**: requirements 47/47, sections 21/21,
cases **0/0**.

That last figure is the tool, not the plan. `3d46cb3` rewrote the spec with CRLF line endings
(1,320 CRLF pairs, no bare LF), and the script's case regex requires `[: \n]` immediately after
the id — a `\r` sits there instead, so it matches nothing and reports a vacuous 0/0. The
requirement and section checks survive CRLF because `\r` lands at end-of-line for them and the
section heading is `.trim()`ed. Since the check that would have verified my `testCases` block is
blind on this file, I verified it directly instead: the spec has 41 `### TC-` headings, none
carrying `- **Retired.**`, and `testCases` claims exactly those 41 — set difference empty in both
directions. Raised as a note on this stage's own output so the human sees why the pass line is
weaker than it looks.

## Verdict

`pass` with two notes. Nothing in the spec resists compilation: the four defects the last review
found were fixed in the spec by a person, and the plan compiles cleanly against the corrected
text.

# What review cannot see, and twenty-three passes proving it

**2026-08-31.** Twenty-three automated review passes over one change found six defects. An
afternoon of using the same change against the real provider found **five more**, every one of
them a blocker but one, and each of four on its own made the feature inoperable.

## Ground truth

The change is `specs/documents/04-signature-providers`, 75 files and 11,448 lines. Two sources:

- The pipeline's own run, `.workflow/runs/2026-08-28T17-26-56_documents-04-signature-providers`
  — four review attempts, five implement attempts, `findingHistory` with six entries.
- Nineteen further review passes run as an experiment over the same commit, recorded in
  [2026-08-30-review-sharding.md](2026-08-30-review-sharding.md).

Everything below comes from those artefacts, from the API log of a manual session, and from
`specs/bugs/BUG-001` through `BUG-004`, which record the four manual findings in full.

## Why the six defects happened

The run produced exactly six findings. They have three different causes, and only one of them
is the implementer being wrong.

**The plan never asked.** The Infrastructure section was unimplemented because no task in the
handoff named `infra/terraform`. The pre-implementer says so itself, in the replan that added
T11: *"the omission was mine: no task named infra/terraform at all."* The implementer is
rule-bound to stay inside the handoff's file globs, so **a plan omission becomes an
implementation omission by construction**, not by carelessness.

**The implementer decided, and wrote its reasoning into the code.** The provider call inside a
transaction was deliberate. It weighed invariant 11 against requirements 9 and 10 and chose,
then left fifteen lines of comment at `signing.service.ts:386` arguing the exemption. The
instinct was right — those rules do contradict — and the handling was wrong: a contradiction
is a `target: spec` finding that halts for a human, not something to resolve unilaterally.

The comment then became an attractive nuisance. A later review shard enumerated the defect
correctly and cleared it on the strength of that comment, citing a spec carve-out that does
not exist. One unilateral decision cost three subsequent reviews.

**The mechanism was built and wired at the wrong point.** The orphan scan for a retried
`POST /documents` ran after the loop exhausted rather than between attempts, where requirement
26 puts it. The only ordinary implementation error of the three, and the most dangerous: it
creates a second live contract with a counterparty, silently.

## Why none of it was caught before review

The three defects share a property. **No automation before the review stage could have seen
any of them.**

| defect | why the gate is blind |
|---|---|
| Infrastructure absent | An absence. Nothing to compile, nothing to fail |
| Provider call in a transaction | The code runs correctly; only a written rule forbids it |
| Retry without reconciliation | Manifests only on a 5xx or timeout *after* a successful create — a path no test simulates |

Static gate, type check, unit and integration suites were structurally incapable, not merely
unlucky. This is the argument for the review stage existing, and against expecting tests to
substitute for it.

## The plan is the least-checked artefact in the pipeline

Stage order is `preflight → pre_implement → implement → static_gate → review → qa`. **There is
no gate between the plan and the implementation.** The pre-implementer graded itself `pass`.

The first thing to compare the plan against the spec was a code reviewer reading a diff —
which is the worst possible place to notice that an entire spec section produced no diff at
all. By then the run had spent **2,303 seconds and $34.40**: the whole of implement attempt 1,
the whole of review attempt 1, and then a replan.

The handoff carries what a check would need. Its tasks declare `requirements: [1, 22, 24, 29,
34, 35]` — 59 references across 11 tasks — and the final plan covers every numbered
requirement and puts eight files under `infra/`. Plan v1 put zero there. A script asserting
that every requirement and every area the spec names is claimed by some task would have caught
it **before a line was written**, in seconds, with no model and no prompt involved.

## What forty minutes of clicking found that twenty-three passes did not

The feature was brought up locally against the real provider. Two defects surfaced immediately,
neither of them raised by any review pass.

**A signer address the product accepts and the provider refuses.** `EMAIL_PATTERN` at
`packages/validation/src/index.ts:87` requires a Latin domain and permits any script in the
local part. `фывфывфыв@gmail.com` passes. SignWell answers `422`. The sender is shown
*"the provider is unavailable"* — wrong twice over, because the provider is up and the fault
is a field accepted two screens earlier. Recorded as BUG-002.

**SignWell materializes no fields from our text tags, so no envelope can ever be sent.**
Recorded as BUG-001, verdict `SPEC-DEFECT`. Nine probes were posted directly to the API and
deleted afterwards:

| probe | fields at create | after 20s |
|---|---|---|
| `{{Signature_1}}` — ours | 0 | 0, `Draft` |
| four other tag syntaxes | 0 | 0, `Draft` |
| no tag at all | 0 | 0, `Draft` |
| **explicit `fields` array** | **1** | **1, `Sent`** |

Requirement 13 records a sandbox observation — *"SignWell parses the file, materializes the
text tags into fields, and moves the document to `Sent` on its own"* — and requirements 14 and
38 are built on it. The first half reproduces. The second does not. The whole text-tag
translation module implements a premise that does not hold.

## Why no review pass could have found either

This is the part worth keeping.

**Both defects are agreements with a third party, and the diff does not contain the third
party.** A reviewer holding the spec and the code can check that the code does what the spec
says. It cannot check that the spec is right about what SignWell does. Requirement 13's
observation is quoted as fact in the spec, and every reviewer correctly treated it as the
authority it is.

**The double agreed with the spec rather than with the provider.** The E2E stub materializes
fields from tags, because it was written from the same observation. Seven integration suites
and a full E2E run pass green against a behaviour the provider does not have. A test double
built from a spec cannot falsify that spec — it can only confirm it.

**The email defect needed a real address and a real refusal.** Reviewers did read
`EMAIL_PATTERN`; nothing about it looks wrong until something downstream rejects what it
admits.

## All five, and the shape they share

This record was written after the first two. Three more followed the same way — a person using
the product — and none by anything automated. All five together, because the shape only became
clear once they could be read side by side.

| | what it was | what found it |
|---|---|---|
| [BUG-001](../../specs/bugs/BUG-001-signwell-text-tags-materialize-no-fields.md) | Text tags materialize no fields; every document stuck in `Draft` | A send that never completed |
| [BUG-002](../../specs/bugs/BUG-002-email-validation-looser-than-the-provider.md) | An address we accept the provider refuses, reported as an outage | A signer with a Cyrillic address |
| [BUG-003](../../specs/bugs/BUG-003-embedded-signing-url-refuses-framing.md) | The signing URL refuses framing until asked with an undocumented parameter | An empty grey rectangle |
| [BUG-004](../../specs/bugs/BUG-004-field-geometry-sent-in-points-not-provider-pixels.md) | Coordinates sent in points, placed in pixels; every signature a row too high | Looking at a signed page |
| [BUG-005](../../specs/bugs/BUG-005-recipient-completed-not-signed.md) | A signed recipient reads `completed`, not `signed`; the turn never closed and no second signer could ever be let in | Opening the second signer's link |

**All five are agreements with a third party, and the diff does not contain the third party.**
That was the lesson from the first two and it has held for three more without amendment.

BUG-004 sharpens it. The provider accepted our coordinates, stored them, echoed them back
unchanged, materialized the fields and sent the document. `GET /documents/{id}` returns
`"y": 136.7` — our own number, faithfully. There is no status, no warning and no validation
that could have said the number meant nothing. Every gate we have was green, and the signature
was drawn on the page's heading.

**The double cannot help, by construction.** A test double is written from what we believe.
Ours echoed the field list back, so it agreed with our units, our framing assumption and our
tag vocabulary in turn. Each time, seven integration suites and a full E2E run confirmed a
belief rather than testing it. A double built from a spec cannot falsify that spec, and a
double built from a *correct* spec still cannot falsify our arithmetic.

**BUG-005 is the one a spec review could have caught, and the reason it is worth naming.**
Requirement 39 wrote *"Observed values: `created`, `sent`, `waiting`"* and then, in the very
next sentence, mapped `viewed`, `signed` and `declined` "at face value" — three values that had
never been observed, in a list introduced by the word *observed*. Nobody had signed anything
when it was written, so `signed` could not have been seen; the requirement extended a verified
list with an unverified member and the seam is visible in its own prose. That is a defect a
careful reader can find **without** the provider, unlike the other four, and twenty-three
passes did not find it — because a reviewer checks code against the spec, and the code
implemented this requirement exactly.

**What did find BUG-004 was measurement, not inspection.** The page is drawn 794 px wide;
A4 at 96 dpi is 794 px; the signature's centre sat at 154 px and the field we sent had its
centre at 154.7. Two numbers from a screenshot and one from the API, and the cause is not a
matter of opinion. That is available to a reviewer only if the reviewer is running the thing.

## What follows

**QA has to exercise the thing, against a real environment, with a database under it, and
against the real third party where one exists.** Five defects, five caused by a belief about
somebody else's system, zero found by twenty-three review passes over the code that held the
belief. Not run the test suites — those are the implementer's, and they were green. These were
reachable only by using the product against the provider it integrates with, and four of the
five make the feature inoperable on their own.

**And QA has to reach the *end*.** BUG-005 sat behind a first signature: every earlier step
worked, the mail went out, the log read as a clean handover, and the failure was on the second
signer's screen. A pass that stops at "the widget loaded" would have missed it. The rule this
argues for is that a QA case walks a journey to its last actor, not to its first success.

**Mark an observation where it stops.** Requirements 13 and 39 both recorded something that was seen
and then continued past it in the same breath. The cheap discipline is a column: this value
came back from the API, that one we expect. BUG-005's corrected table has it, and the next
person to extend the list has to say which half they are adding to.

**A doubled dependency needs a witness that is not the spec.** The stub should be checked
against a recorded live response, or the observation it encodes re-verified, or both. As it
stands the stub, the suites and the spec form a closed loop that agrees with itself.

**The plan needs a cheap mechanical gate.** Sections and requirement numbers, computed and
handed over, the way `review-slice.mjs` hands over files. It costs seconds and depends on no
model.

## What this does not show

Twenty-three review passes is not twenty-three chances at these two defects: they all read the
same diff against the same spec, so they share the blind spot rather than sampling
independently. The correct reading is that **no amount of review of this kind can find a defect
of this kind**, which is a statement about the method and not about the count.

Nor does it show that review is a poor investment. The three defects it did find are all
invisible to every automated gate before it, and one of them — the retried create — is the
kind that reaches a counterparty silently.

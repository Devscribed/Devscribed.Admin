# What a shard can be asked

**Question.** The `sharded` refine shape never dispatched a child — five of six recorded rounds
report `shards: 0`. Forced to dispatch, does it find what a single opus pass finds, and faster?

## Ground truth

The same frozen text every other measurement in this pair of records uses: `0f20da7`, the commit
the refine loop admitted. Two defects in it are known and independently confirmed:

- **S-59 / `REQ-01-036`** — "a valid alpha-2 value" and "exactly 2 uppercase letters" are two
  membership tests that disagree on `XX`. Found by 4 of 5 solo opus passes; it is the one spec
  blocker that halted the ship review and predated admission.
- **S-10 / Routes → `REQ-01-046`** — the Routes table cites `REQ-01-046` as the source of the
  route's `404`, but REQ-01-046 states the `200` path; `REQ-01-047` is the refusal. **Found by no
  solo opus pass, no refine round and no code review.** Verified by hand against
  `01-vacation-calendar.md:339-350` and `contracts.md:11`.

A third, found only once: `REQ-01-046`'s Decided note says the route ships as
`api/organizations/:orgId/settings/signing` — a paste from another spec. Also real, also never
found before.

## Every arm

All on `sonnet` except where noted, all on the whole bundle, all through `scripts/lab-run.mjs`
from inside a worktree at `0f20da7`.

| arm | criteria | effort | enumerated | sec | turns | cost | S-59 | S-10 |
|---|---|---|---|---|---|---|---|---|
| member-1/2/3 (one bundle file each) | 19/28/21 | default | 88 total | 196 (parallel) | 20–28 | $1.48 | no | no |
| family-2 | 10 | default | 28 | 147 | 5 | $0.42 | no | no |
| family-2-strict (must read the code) | 10 | default | 20 | 133 | 11 | $0.47 | no | no |
| family-2 on **opus** | 10 | default | 70 | 673 | 27 | $3.30 | **yes** | no |
| deep-3 | 3 | default | 21 | 221 | 17 | $0.69 | no | no |
| deep-5 | 5 | default | 27 | 218 | 5 | $0.51 | no | **yes** |
| deep-5-high | 5 | high | 33 | 380 | 19 | $0.96 | no | **yes** |
| deep-10 | 10 | default | 24 | 317 | 26 | $1.00 | no | no |
| deep-10-high | 10 | high | 55 | 575 | 10 | $1.11 | no | **yes** |
| deep-10-xhigh | 10 | xhigh | 46 | — | — | — | no | **yes** |
| **deep-1 (S-59 alone)** | **1** | default | **6** | 285 | 14 | **$0.71** | **yes** | — |
| one-S-09…S-17, one per criterion | 1 each | default | 104 total | 285 (parallel) | — | $4.49 | — | no |
| one-S-10 | 1 | default | 16 | 494 | 6 | $0.55 | — | no |
| one-S-10-high | 1 | high | 25 | 235 | 11 | $0.55 | — | no |
| **one-S-10-xhigh** | **1** | **xhigh** | **47** | — | — | — | — | **yes** |

**No configuration found both.**

## What the numbers killed

**"Sharding does not work."** Killed. Forced to dispatch, shards found two real defects that five
solo opus passes, three refine loops and four review attempts all missed.

**"The split axis is the problem — a child given one bundle file cannot see a cross-file
contradiction."** Killed as the explanation. The family axis gives each child the *whole* bundle
and its own criteria family; the contradiction child had every file, every contradiction criterion
and S-59, and still missed S-59.

**"It is the model."** Killed. `sonnet` finds S-59 (`deep-1`) and finds S-10 (`one-S-10-xhigh`).
It is not a capability wall.

**"It is the prompt — the shard was never told to check against the code."** Killed as sufficient.
Making the code check an obligation changed the behaviour — 13 repository files opened against
almost none — and changed nothing about what was found. `family-2-strict` enumerated the exact
failing pair (*"ISO alpha-2 country format consistent across schema column, validation rule 9, both
error messages, both write requirements"*, citing `contracts.md:238` and `md:352-379`) and wrote
`ok=true`.

**"It is the size of the responsibility — ten criteria on a small model is the old job on a
smaller mind."** This was the most promising and it is **killed too**, by its own best test. The
narrow `one-S-10` shard, owning that one criterion and told to go deep, enumerated the defect as
item 12 of 16 — *"Routes table citing REQ-01-046 (a positive read rule) as the source of the
org-country refusal"* — wrote the correct test beside it, and cleared it.

**"Attention per subject = budget ÷ subjects enumerated."** Killed by the arm built to confirm it.
`one-S-10-xhigh` found the defect while enumerating **47** subjects, three times as many as the
default arm that missed it. More thinking produced more breadth *and* the finding, which the model
does not predict.

## What survives

**A pass is a sample, and this is as true of a narrow sonnet shard as of a whole-document opus
judge.** Twelve configurations over one frozen text: two known defects, no configuration found
both, and the same arm shape found different things on different runs. Narrowing the criteria and
raising the effort do not remove the variance — they **move** it, changing which class of defect
surfaces.

Two classes are visible in the results and they separate cleanly:

- **A deep semantic disagreement** — two English phrasings of one value domain that imply different
  membership tests. Found by the arm with the fewest subjects (`deep-1`, 6) and by opus. Every
  wide arm enumerated it and cleared it.
- **A citation or table error** — a row pointing at the wrong requirement. Found by wide arms and
  by `xhigh`. The narrow arms at default and `high` enumerated it and cleared it.

## What it costs

| | cost | wall clock |
|---|---|---|
| ten one-criterion sonnet shards, parallel | **$4.49** | **285 s** |
| one wide sonnet shard at `xhigh` | ~$1.10 | ~575 s |
| one solo opus pass over the whole bundle | $3.30–6.25 | 673–794 s |

A portfolio — several narrow shards plus one wide high-effort pass, unioned — is cheaper and
faster than one solo opus pass and covers both classes. That is the same principle as
`judgePasses`, applied across passes that differ rather than passes that are identical.

## Not settled

Whether any of this holds on a bundle other than this one. Whether the class separation above is
real or two anecdotes. Whether `xhigh` is reliably better than `high` for table-shaped defects or
was one lucky sample — the arms were run once each, and the whole point of the record is that one
run of anything is a sample.

## A harness defect found on the way

`scripts/lab-run.mjs` reported `NO VERDICT` on every one of the ~25 runs here, while the agent had
written its verdict exactly where the prompt asked. It looks for the file at a path of its own and
does not read the one it was told to name. Nothing was lost, but the log says the opposite of what
happened, which is worse than saying nothing.

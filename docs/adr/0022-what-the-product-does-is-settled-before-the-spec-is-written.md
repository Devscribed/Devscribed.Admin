# 0022 — What the product does is settled with a person before the spec is written

**Status:** current
**Date:** 2026-09-08

## The decision

`/spec` gains a stage between reconnaissance and the verification route: **the product behaviour,
the business logic and the shape of the experience are settled with a person before any of the
spec's text exists.**

Three parts, and only the first two cost a conversation.

1. **A test decides what goes to a person, and there is no list of questions.** A decision goes
   to them when it changes *what the product does* rather than how it is built, **and** is left
   open by the code, by the conventions in CLAUDE.md, and by every screen already shipped. Craft
   is the author's: what is drawn during a request, where focus lands, which status refuses,
   which component carries a control. Product is the person's: abandoned work, who else is
   affected, what can be undone, where a reader goes when the answer is nothing. The count of
   questions follows the spec — a surface that changes nothing about the product raises none.
2. **Where the spec draws a screen, the mock is built and looked at before the spec's text**, and
   `## Screens` is written from the mock rather than the mock from `## Screens`. It is one
   message — *here is the screen, say what is wrong with it* — not a second round of questions.
   Reading order, the level of a heading and where an explanation sits are settled by looking.
3. **The decisions are recorded with who made them.** `## Behaviour Walkthrough` in the cases
   file: the decision, what was decided, `human` or `agent`, and the requirement, edge case,
   contract row or mock state that carries the rule. `spec-lint` requires the section of a bundle
   that draws a screen and requires every row to name a decider.

**The gate checks the shape of the record and never its truth.** No script can know whether a
person was asked. What the record buys is that the omission is *written* rather than absent: a
table of nothing but `agent` is a spec whose product decisions nobody was consulted on, and it
reads as one at a glance.

## What it replaces

`/spec` step 2 asked for "the two to four genuine architectural forks". That is a bound on *shape*
questions — which store, which port, which model — and it is silent on product questions, which
are the ones a spec cannot recover from getting wrong. Those forks are not withdrawn; they are now
the same question under the same test, asked in the same round.

The mock was optional and unordered: nothing said it came before the spec's text, and
`spec-lint` skips a bundle that has none. It is still not required by the lint. What changed is
its place in the workflow — it is the surface the last conversation happens on, not an artefact
produced alongside the finished document.

**What was not adopted, and why.** Three heavier shapes were designed and rejected in the
conversation that produced this record:

- **A closed register of ~30 questions across three families** (journey, states, what is drawn),
  walked question by question. Rejected: a register sized for a new area is absurd against a
  modal, and the stage becomes an interrogation that its author routes around.
- **The same register indexed by surface kind** — a card of four questions for a modal, six for a
  reading screen, and so on. Better, and still a questionnaire; the cards were an inventory of
  states and composition, which `ui-invariants`, `## Geometry & motion` and the lint already hold
  without a person in the room.
- **A per-question ask policy** (`never` / `conditional` / `always`) written into each register
  row. This is the mechanism that survives — as a test the author applies, rather than as a
  column in a table nobody would keep current.

## The evidence

The corpus is the nineteen patch notes `PATCH-011` through `PATCH-029`, every one of them written
against the time-off release, read from `specs/patches/`.

- **Sixteen of nineteen** carry `surface: ui` or `api+ui`. Two are `api` alone and one is `infra`.
- **Nine of nineteen supersede an earlier patch.** Nearly half the patch traffic re-decided
  something a patch had already decided.

The superseding chains are the finding. Where the legend of the vacation calendar sits took three
notes — `PATCH-022`, then `PATCH-024` (*the key sits under the picture*), then `PATCH-028` (*the
key goes between the figures and the grid*). The transition of the calendar window took two,
`PATCH-025` then `PATCH-026`. The Holidays screen took `PATCH-011`, `PATCH-014`, `PATCH-015` and
`PATCH-016` before `PATCH-018` superseded three of them at once with *the Holidays screen reads
top to bottom*.

None of these is a defect a register catches. Each is a person looking at a running screen and
deciding it reads wrong — one round trip through implement, review and QA per decision.

**The specs were not thin.** `specs/time-off/01-vacation-calendar.contracts.md` carries a
`## UI Description` table with eight surfaces, a `## Geometry & motion` table and a `## DS gaps`
table with a `Decided:`/`Rejected:` block under it. The states were written down. What was never
written down is that anybody agreed with them.

**The mock is the other half of the pattern.** Of the five three-file bundles in `specs/`, one has
a mock: `specs/time-off/01-vacation-calendar.mock.html`. `specs/time-off/03-calendar-range-and-scope`
has none, and `PATCH-022` through `PATCH-028` — the whole legend and window chain — supersede
`time-off/01` and `time-off/03`.

## The hypothesis this killed

**That the eight-mechanism register would close the time-off defect class.** ADR 0021 landed
`ui-invariants` and threaded `UI-01`..`UI-08` through the spec template, both judges, the
implementer and QA. It holds: of the nineteen patches, `PATCH-016` (a box sized by its content),
`PATCH-021` (a name setting a header's height) and `PATCH-011`/`PATCH-015` (a wait drawn over
something worth keeping) are exactly its ids, and a spec written after it would carry rows
answering them.

It does not reach `PATCH-018`, `PATCH-023`, `PATCH-024` or `PATCH-028`. The register is explicit
that it holds nothing unmeasurable — *"Aesthetics. Nothing in this register is about whether a
screen looks good"* — and reading order, heading level and where a key sits are precisely that.
The belief that a closed register of measurable mechanisms would drain the patch track was wrong,
and the residue after it is drained is a class no measurement reaches and no agent can settle
alone.

## What it costs

- **Four bundles now report `walkthrough/missing`** if they are linted: `requests/02`,
  `requests/03`, `time-off/02` and `time-off/03`. They are frozen and are only re-linted by a
  `/refine` run against them. An exemption list in the script was rejected: it drifts, and it is
  a second place where the rule lives.
- **A spec that draws a screen now builds its mock earlier**, before the text rather than beside
  it. The work is not new; its position is.
- **The lint cannot enforce the stage, only its record.** This is stated in the skill, in the
  template and here, so that nobody reads a clean lint as evidence that a person was consulted.

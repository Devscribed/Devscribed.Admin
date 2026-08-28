---
name: spec
description: Write a functional specification for this repository — a numbered spec file in specs/<area>/ covering behaviour, API contracts, edge cases, blast radius, backward compatibility, acceptance criteria, and unit/integration/E2E test cases. Use when asked to spec a feature, write a specification, design a new area, or extend an existing spec. Also use before implementing anything non-trivial that has no spec yet.
---

# Writing specifications

This repository is spec-driven: `specs/<area>/NN-name.md` is authoritative and code is written to
match it. A spec is not a description of what you plan to build — it is the contract the
implementation and its tests are checked against.

## The coverage contract

Every spec covers all five. None is optional, and none is satisfied by a sentence.

| | What it means |
|---|---|
| **Edge cases** | A numbered table of specific situations and the exact behaviour for each. Not a paragraph of caveats. |
| **Blast radius** | What breaks *outside* this feature, with a mitigation per row. Listing what you add is not blast radius. |
| **Backward compatibility** | What guarantees existing data, routes, and deployments keep working, and what mechanism enforces each guarantee. |
| **Acceptance criteria** | Observable, checkable statements. Not a restatement of the functional requirements. |
| **Automated tests to E2E** | Numbered `TC-NN-UNIT-NN`, `TC-NN-INT-NN`, `TC-NN-E2E-NN` with preconditions, steps, expected results, and — for E2E — the `data-testid` selectors. |

## Workflow

### 1. Reconnaissance before writing

Never write a spec from the prompt alone. Read the code first and produce two explicit lists:

- **What already exists to build on** — with file paths. A spec that reinvents
  `apps/api/src/auth/reset-token.ts` when the pattern is already there is a bad spec.
- **What must be built from zero** — the honest list. This is usually where the real cost is, and
  it belongs in the spec, not in a surprise three weeks later.

Also read two or three existing specs in `specs/` first. Match their structure, their register, and
their level of detail.

### 2. Resolve the forks with the user

Identify the two to four genuine architectural forks — the ones where different answers produce
materially different specs. Ask them with `AskUserQuestion`, each option carrying its real
trade-off, and put your recommendation first with the reason.

Do not ask about things a careful colleague would just decide. Do not guess on things that change
the whole shape.

If the user's framing rests on a wrong premise, say so in a sentence and then answer what they
actually asked. (Example from this repository: a third-party e-signature vendor gives no stronger
legal standing than an in-house engine for contracts in Belarus, because a qualified signature
there requires a ГосСУОК certificate that no SaaS vendor issues. Worth one sentence; not worth
blocking on.)

### 3. Choose the shape

One spec per coherent surface. Past roughly 900 lines, split into numbered specs with an area
`README.md` index — see `specs/user-management/` (eleven files) and `specs/documents/` (three plus
an index). A single 2000-line file is not more thorough, it is less readable.

New area → create `specs/<area>/README.md` too, and add a "Related Areas" pointer from any area it
depends on.

### 4. Write

Follow `references/spec-template.md` for section order and content. Specs are written in English,
including in Russian-language conversations.

### 5. Self-check

Run every item in `references/checklist.md` before presenting the spec.

## Principles

**Every decision carries its reason, in the same breath.** "Signing is strictly sequential" is
half a spec. "Signing is strictly sequential, so the second party receives a document already
signed by the first" is a spec. Where a decision is contested, put it in a decisions table in the
area README with the alternative and why it lost.

**Cite what you reuse.** Name the file. `apps/api/src/auth/session.guard.ts`, not "the existing
auth guard".

**Put a port where a vendor might change.** Define the interface, ship one implementation, and add
the columns the future adapter needs (`ProviderKey`, `ProviderRef`) in the first migration. A port
that requires a migration to use is not a port.

**Migrations are additive.** New models, new nullable columns, new tables. No renames, no drops, no
new `NOT NULL` on an existing table. Then deploy order stops mattering and a code rollback needs no
database rollback — say this explicitly in the backward-compatibility section.

**Immutability is the backward-compatibility mechanism.** Pin versions, snapshot values, make
artifacts write-once. "Editing a template cannot alter a document already signed" is a guarantee
you can state and test; "we'll be careful" is not.

**Correctness must not depend on a scheduler.** Evaluate expiry, staleness, and eligibility lazily
on read, and let the cron job merely materialize what is already true. Then a failed schedule
degrades timeliness, never correctness. Say which one is the source of truth.

**A failure must not lose the irreplaceable thing.** If PDF rendering fails after both parties
signed, the envelope stays completed and the render retries — the signatures are the asset, the
PDF is derived. Identify the irreplaceable thing in your feature and protect it by name.

**Anything reachable twice must be idempotent.** Double-clicks, retries after timeout, queue
redeliveries, webhook replays. State the mechanism (a `UsedAt` set in the same transaction, a FIFO
group key) and write a concurrency test for it.

**Do not leak through error responses.** Unknown and unauthorized must be byte-identical, with no
timing signal. Spell this out where a public surface exists.

**Sanitize on write, not on read.** Store the cleaned value so that what the author saved is what
renders, and there is exactly one sanitization path to get wrong.

**Name the limitation instead of hiding it.** Every spec ends with Known Gaps: the gap, why it is
acceptable for this release, and what closes it. A magic link can be forwarded — write that down.
Reviewers trust a spec that admits its edges.

**Out of Scope is a section, not a shrug.** List what a reader would reasonably expect and will not
get, so nobody discovers it during review.

**Error messages live in one table.** The business spec owns validation messages and behaviour; a
paired `.design.md` owns headings, placeholders, and micro-copy. Neither restates the other. Shared
rules go in the area README, not duplicated per spec.

**The `data-testid` list is a contract.** Every id in the selectors section appears in an E2E case,
and every selector an E2E case names appears in the list.

## Infrastructure sections

When a spec introduces infrastructure:

- **Terraform, two environments (`dev`, `prod`)**, one root module composed per environment through
  `-backend-config` and `-var-file`. **No workspaces** — separate state files make a
  wrong-environment apply impossible to do silently.
- **A table of every input that differs between environments**, presented as a contract: anything
  differing beyond that table is a bug. Hold behaviour-affecting values (memory, timeouts,
  defaults) identical, so dev remains a test of prod.
- **No secrets in `.tfvars`.** Terraform creates the secret containers and the IAM policies; values
  are set out of band. Terraform never reads a secret, so no secret reaches the state file.
- **State backend on S3 with native locking**, versioned, bootstrapped once out of band as the only
  hand-created resource.
- **`apply-prod` is manual and approval-gated**; roles assumed via OIDC, no static keys.
- Say what dev is *for*. Tests stay hermetic on local drivers; the dev environment exists to
  exercise the real services and catch what only appears against them — IAM gaps, identity
  misconfiguration, cold starts, presigned-URL expiry.
- Note lead-time items (SES production access, domain verification) as lead time, not as deploy
  steps.

Reference a sibling repository's pattern only after judging it. `meetwave-serverless-lambda` has a
good module layout and commits plaintext API keys in its `.tfvars` — take the first, name the
second as something not to reproduce.

## Anti-patterns

- Writing the spec before reading the code.
- "TBD", "we'll figure this out later", or a requirement whose behaviour is not stated.
- Edge cases as prose instead of a numbered table with exact behaviour.
- A blast-radius section that lists only additions.
- Acceptance criteria that restate the functional requirements in different words.
- Test cases that only cover the happy path — every edge case worth listing is worth a test.
- Silently narrowing scope because part of it is hard. Deliver the whole spec and mark what is
  blocked.
- Inventing a mechanism that already exists three directories away.
- Copying an infrastructure pattern from another repository without judging it.

## Reference files

- `references/spec-template.md` — section order, frontmatter, and what belongs in each section.
- `references/checklist.md` — the pre-presentation self-check.

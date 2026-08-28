# implement — attempt 1

Run `2026-08-28T08-08-40_ds-infobanner-tokens` · branch `spec/ds-infobanner-tokens` · base `623453a`
Handoff: `.workflow/runs/2026-08-28T08-08-40_ds-infobanner-tokens/handoff.json`
First attempt — there are no prior findings to answer.

## What changed

Seven files, exactly the seven the handoff's tasks name. Six modified, one new. Nothing else
in the working tree is mine (`.claude/skills/ship/SKILL.md`, `package.json`, `scripts/wf.mjs`
and `scripts/ship.mjs` were already dirty when this attempt began).

| Task | Files touched | Result |
|---|---|---|
| T1 | `1_DS for dev/tokens/colors.css` | Five raw scale steps added: `--violet-100`, `--success-50`, `--success-300`, `--error-50`, `--error-300`. Each `oklch(...)` string copied character for character out of `InfoBanner.jsx` — no re-rounding, `0.8` stayed `0.8`. Inserted in each block's descending-lightness order. The `[data-theme="dark"]` block is untouched. |
| T2 | `1_DS for dev/tokens/colors.css` | Twelve `--banner-{info,warning,error,success}-{bg,border,ink}` semantic tokens appended to the light semantic block after `--status-inactive-dot`, as one commented group. Every one is a `var()` alias — no literal. `--violet-400`, `--amber-300`, `--amber-100` are aliased, not duplicated. `--banner-info-ink` aliases `--accent` (not `--violet-700`), so it keeps following the dark redefinition of `--accent` exactly as the component did. No dark override added for any of the twelve (requirement 7). |
| T3 | `1_DS for dev/components/feedback/InfoBanner.jsx` | The `tones` map only. Props, `InfoGlyph`, `padding: '12px 14px'`, `gap: 10`, `border 1px`, radius and font are byte-identical. `InfoBanner.d.ts` and `InfoBanner.prompt.md` needed no change — the public API did not move. **Acceptance met:** `grep -rn "oklch(" "1_DS for dev/components/"` exits 1 with no output. |
| T4 | `1_DS for dev/_adherence.oxlintrc.json`, `1_DS for dev/_ds_manifest.json` | Seventeen names into each of the three registries. `x-omelette.tokens` in alphabetical position, `x-omelette.tokenKinds` in definition order beside its scale neighbours (all `"color"`), `_ds_manifest.json` `tokens[]` in file-then-definition order with the existing record shape; the semantic twelve store the `var(...)` string, matching `--status-active-bg`. **All three now enumerate the same 179 names** (were 162). Insertions only — verified below. |
| T5 | `1_DS for dev/_ds_bundle.js` | The inlined `tones` map got the same change as T3 (`grep -c "oklch(" _ds_bundle.js` is now 0). The stale `"components/feedback/InfoBanner.jsx":"1a6fd57449af"` entry was deleted from the `@ds-bundle` header's `sourceHashes`, matching how every other hand-edited component in that bundle carries no entry. The header still parses as JSON. `Select`'s pre-existing bundle drift was left alone, as instructed. |
| T6 | `e2e/tests/ds-info-banner-tones.spec.ts` (new) | `TC-DS-BANNER-E2E-01`. Not added to `regressions.spec.ts`. |
| T7 | `1_DS for dev/README.md` | One bullet under *Intentional additions*, phrased like the `AuthLayout` / `Spinner` ones: the five scale steps, the twelve semantic tokens, values preserved exactly, no dark override, and the note that `_ds_bundle.js` was hand-edited so a regeneration must re-import that source. **No file under `specs/` was touched** — see the last section. |

## Test cases

| id | file | what it pins |
|---|---|---|
| `TC-DS-BANNER-E2E-01` | `e2e/tests/ds-info-banner-tones.spec.ts:80` | (a) all twelve `--banner-*` tokens resolve non-empty on a real route, and each resolves to the *same colour the component applied before the promotion*; (b) the rendered `login-error-message` banner's computed `background-color` and `border-top-color` equal `var(--banner-error-bg)` / `var(--banner-error-border)` read back in the same browser. |

Test ids used: `login-error-message` (existing, from `apps/web/app/login/LoginForm.tsx`).

Two design points, because both were named as risks in the handoff:

- **No hand-typed `rgb()` string anywhere.** Every comparison paints two values on a probe
  element and compares what *this* browser computed, so the test fails on a colour regression
  and not on a Chromium serialisation change.
- **The expected side is the pre-refactor source**, verbatim (`EXPECTED` in the file). That is
  what lets the test catch the "snap it to the nearest existing step" mistake rather than
  merely asserting that the component uses some token.

## Verification actually run

| Check | Result |
|---|---|
| `npm run test:unit` | 14 files, **806 passed** |
| `npm run test:int` | 25 suites, **323 passed** (see the environment note below) |
| `tsc --noEmit` — `apps/web` | clean |
| `tsc --noEmit` — `apps/api` | clean |
| `tsc --noEmit` — `packages/validation` | clean |
| `tsc --noEmit --strict` — the new e2e spec | clean |
| `npx playwright test ds-info-banner-tones authentication` | **12 passed**, including `TC-DS-BANNER-E2E-01` and the existing `TC-02-E2E-02`, which renders the same banner |

**The new test was mutation-checked twice and reverted both times** — a guard nobody has seen
fail is not a guard:

- `--banner-error-bg:var(--error-50)` changed to `var(--error-100)`, the exact "snap to the
  nearest step" mistake: **fails** with `--banner-error-bg must still be oklch(0.96 0.03 25)`,
  `Received: "oklch(0.95 0.04 25)"`.
- `--banner-error-bg` deleted entirely, i.e. a token a route never loads: **fails** on the
  empty entry in the resolved list.

`git diff -- "1_DS for dev/tokens/colors.css"` after the revert is the 21-line insertion and
nothing else.

**Integration-suite environment note.** `npm run test:int` fails on this machine at
`globalSetup` with `P1000: Authentication failed` before a single test runs: host port **5433
is occupied by a different Postgres** — a local Windows install, which answers with a
localized auth error — and it shadows the `devscribed-postgres` container's mapping. That same
container also publishes **5434**, and `docker exec … psql` inside it is healthy. So the suite
was run as
`TEST_DATABASE_URL=postgresql://devscribed:devscribed@localhost:5434/devscribed_test npm run test:int`
and passed 323/323. A local port collision, not a defect, and unrelated to this diff — which
contains no API code, no schema and no migration.

## Requirements

| # | Requirement | Evidence |
|---|---|---|
| 1 | No raw colour left in `InfoBanner.jsx` | `grep -rn "oklch(" "1_DS for dev/components/"` returns nothing, exit 1. All twelve slots are `var(--banner-*)`. |
| 2 | All four tones render identically, both themes, exact sRGB | Every new token's value is the old literal unchanged; the three that already existed are aliased. Resolved and checked: `#F5F3FF`, `#CEC7F3`, `#FFEED5`, `#E7BC82`, `#FFEBE8`, `#F8A49D`, `#E1F8EB`, `#90CEAC` — all eight equal the handoff's reference values. `TC-DS-BANNER-E2E-01` pins it in a browser, and its mutation run proves it would notice. Dark is preserved by construction: no `[data-theme="dark"]` entry is added, and `--banner-info-ink` follows `--accent`, the only one of the twelve whose source is redefined in dark. |
| 3 | Missing values go into the DS and are recorded | Added to `tokens/colors.css`, never per-screen; recorded in `1_DS for dev/README.md` and in the handoff's DS-gaps table. |
| 4 | The three registries agree, 162 to 179 | `x-omelette.tokens` 179, `x-omelette.tokenKinds` 179, unique names in `_ds_manifest.json tokens[]` 179 (198 records; the extra 19 are the unchanged dark-theme redefinitions), and the three sets are **identical**. Every `--*` name defined in the `:root` block of `colors.css` is in the registry. |
| 5 | Consumers unchanged, still through `@ds` | No file under `apps/` is in the diff. `apps/web/src/ds.ts` and `1_DS for dev/index.js` are untouched; `apps/web/src/toast.tsx` and `LoginForm.tsx` benefit with no edit. |
| 6 | Nothing under `specs/` edited | `git status --porcelain -- specs` is empty. The two mockups still describe what renders, because no value changed. |
| 7 | Light theme only | The `[data-theme="dark"]` block of `colors.css` is not in the diff; no `--banner-*` override exists. |

## Nothing was weakened

The diff adds a test and adds registry entries. No test was skipped, deleted, loosened or
marked `.only`; no `@ts-ignore`, `as any` or `eslint-disable` was introduced. In
`_adherence.oxlintrc.json` no rule, selector, message or existing entry was removed, reordered
or relaxed — a JSON-level comparison confirms every one of the previous 162 `tokenKinds`
entries survives with its original value, and the diff is 34 lines, all insertions. The
`_ds_manifest.json` change is a single minified line, so it is verified structurally instead:
every other top-level key is byte-identical, and all 181 previous `tokens[]` records survive
in their original order with 17 records added.

## One thing the next stage will see, and it is not from this attempt

`node scripts/static-gate.mjs --base 623453a` reports one blocker,
`pipeline/spec-immutable` on **`specs/bugs/README.md`**. That file is not in my diff and I did
not touch it:

- `git status --porcelain -- specs` is empty — there is no working-tree change under `specs/`
  at all;
- `git log --oneline 623453a..HEAD -- specs/bugs/README.md` gives `d4b6afc Document the
  pipeline and open specs/bugs/`, authored by a person at 2026-08-28 08:11 UTC, which is
  **before this stage started** (`pre_implement` did not write its verdict until 08:23 UTC),
  and whose other two files are `CLAUDE.md` and `docs/ai-workflow.md`;
- the file is *new* in that commit — 44 lines describing how bug reports are written. It says
  nothing about `specs/user-management/README.md`, the spec this run is checked against.

The run's `baseRef` points one commit behind `HEAD`, so the gate's `git diff base -- specs`
picks up that unrelated commit. Raised here rather than contested, because the gate has not
yet made a finding and a contest halts the run for a person. If it is routed back to this
stage, the counter-witness is the three commands above.

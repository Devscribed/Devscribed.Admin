# pre_implement — ds-infobanner-tokens

Run `2026-08-28T08-08-40_ds-infobanner-tokens`
Spec `specs/user-management/README.md` (sha256 `995df58…3fc601`, matches `run.json`)
Chore, verbatim, from the Design Layer section (line 60):

> `InfoBanner` hardcodes its four tone triplets as literal `oklch(...)` values rather than tokens.
> Spec 02 uses all four; promoting them to tokens is the outstanding design-system chore before
> spec 03 adds more banners.

No numbered requirements, no `TC-*` list. Requirements 1–7 in `handoff.json` are synthesised from
`CLAUDE.md` and this section's own rules; `TC-DS-BANNER-E2E-01` is minted by the handoff.

---

## What already exists to build on

| What | Where |
|---|---|
| Three of the eight literals already exist as **exact** tokens: `--violet-400` = `oklch(0.85 0.06 292)` (info border), `--amber-300` = `oklch(0.82 0.09 74)` (warning border), `--amber-100` = `oklch(0.96 0.04 74)` (warning bg) | `1_DS for dev/tokens/colors.css` lines 33, 42, 41 |
| The four **inks are already tokenised** — `var(--accent)`, `var(--amber-800)`, `var(--error-500)`, `var(--success-700)`. Only 8 of the 12 triplet slots are literal | `1_DS for dev/components/feedback/InfoBanner.jsx` lines 4–7 |
| The semantic tone-triplet naming precedent: `--status-active-bg` / `-ink` / `-dot` and `--status-inactive-*`, each a `var()` alias of a raw scale step | `1_DS for dev/tokens/colors.css` lines 87–92 |
| Precedent for a semantic token holding a literal instead of an alias (`--tracker-bg: oklch(0.78 0.14 74 / 0.1)`) — the fallback shape if the new raw steps are rejected | `1_DS for dev/tokens/colors.css` line 84 |
| A `50` step in a scale has precedent (`--paper-50`) | `1_DS for dev/tokens/colors.css` line 6 |
| The manifest record shape to copy, including how an aliasing token stores `"var(--success-100)"` as its value | `1_DS for dev/_ds_manifest.json`, `tokens[]` |
| Token CSS is already loaded on every route — one import, root layout | `apps/web/app/layout.tsx` line 4, `import '@ds/styles.css'` |
| The single client barrel every consumer goes through, so **no consumer file changes** | `apps/web/src/ds.ts` |
| An already-rendered error-tone banner with a stable testid, so the e2e guard needs no fixture page | `apps/web/app/login/LoginForm.tsx` lines 128–137, `data-testid="login-error-message"` |
| `registerOrganization` / `signIn` / `uniqueEmail`, and the failed-login flow the guard drives | `e2e/tests/helpers.ts`, `e2e/tests/authentication.spec.ts` |
| The byte-level acceptance reference — the four triplets written out verbatim | `specs/user-management/02-authentication-login.mock.html` lines 102–109 |
| The specimen page that renders `InfoBanner` from the bundle and links `styles.css` | `1_DS for dev/components/feedback/feedback.card.html` lines 3, 9, 28–31 |
| A second consumer that already renders `InfoBanner` in two tones and benefits from named per-tone tokens | `apps/web/src/toast.tsx` |

## What must be built from zero

- **Five raw scale steps** that have no existing equivalent: `--violet-100`, `--error-50`,
  `--error-300`, `--success-50`, `--success-300`.
- **The whole `--banner-*` semantic namespace** — twelve tokens. Nothing banner-scoped exists.
- **Seventeen entries in each of three registries** — 51 insertions, and all three must land on the
  same 179 names.
- **`e2e/tests/ds-info-banner-tones.spec.ts`.** No test in the repo asserts a computed colour or a
  resolved CSS custom property today, so there is no in-repo pattern for the assertion itself.
- **A README bullet** under `1_DS for dev/README.md` → "Intentional additions".

Nothing else. No component API change, no consumer change, no validation message, no API route,
**no Prisma migration**, no authorization code — `normalizeRole()` and org scoping are untouched by
this run.

---

## The token-mapping question — the crux

I resolved each of the eight literals in OKLab and converted to sRGB, so the comparison is a number
and not an impression.

| Slot | Literal in `InfoBanner.jsx` | sRGB | Nearest existing token | Its sRGB | Verdict |
|---|---|---|---|---|---|
| info **border** | `oklch(0.85 0.06 292)` | `#CEC7F3` | `--violet-400` `oklch(0.85 0.06 292)` | `#CEC7F3` | **exact — reuse** |
| warning **bg** | `oklch(0.96 0.04 74)` | `#FFEED5` | `--amber-100` `oklch(0.96 0.04 74)` | `#FFEED5` | **exact — reuse** |
| warning **border** | `oklch(0.82 0.09 74)` | `#E7BC82` | `--amber-300` `oklch(0.82 0.09 74)` | `#E7BC82` | **exact — reuse** |
| info **bg** | `oklch(0.97 0.02 292)` | `#F5F3FF` | `--violet-200` `oklch(0.95 0.035 292)` | `#EEEBFF` | **new** — off by 7/8/12 |
| error **bg** | `oklch(0.96 0.03 25)` | `#FFEBE8` | `--error-100` `oklch(0.95 0.04 25)` | `#FFE5E1` | **new** — off by 0/6/7 |
| success **bg** | `oklch(0.96 0.03 160)` | `#E1F8EB` | `--success-100` `oklch(0.95 0.04 160)` | `#D9F7E5` | **new** — off by 8/1/6 |
| error **border** | `oklch(0.8 0.1 25)` | `#F8A49D` | `--error-400` `oklch(0.7 0.12 25)` | `#DF7F78` | **new** — no near neighbour |
| success **border** | `oklch(0.8 0.08 160)` | `#90CEAC` | `--success-500` `oklch(0.58 0.11 160)` | `#308E63` | **new** — no near neighbour |

**Three map exactly. Five do not.** Two of the five (the error and success borders) have nothing
even close — the palette simply has no light-border step for red or green. The interesting three are
the info / error / success backgrounds: each sits one small nudge away from a `100`-level step,
close enough that "just use `--error-100`" is the tempting move and far enough that it changes what
renders.

### Why the near misses are preserved rather than snapped

1. **The stated acceptance says so.** The visual result must be unchanged unless a change is
   explicitly justified. Nothing in the chore justifies a tint shift; it asks for *promotion*, which
   is a rename of a value, not a revision of it.
2. **The mockups are the acceptance target and cannot be edited.**
   `specs/user-management/02-authentication-login.mock.html` lines 102–105 and
   `specs/user-management/01-organization-creation.mock.html` line 92 spell out the same eight
   literals, and spec 02's design file calls its mockup "the visual acceptance target for this
   spec". `scripts/static-gate.mjs` rule 1 blocks any diff under `specs/`, so an implementer who
   snapped the values could not bring the mockup back into line — the component and its own
   acceptance target would disagree, and the run would have no legal way to fix it. This is what
   turns a matter of taste into a settled question.
3. **6–12 sRGB units on a full-width banner fill is visible**, not sub-threshold, particularly
   against the mockup side by side.

The cost of preserving them is honest and recorded: the palette gains `--error-50` next to
`--error-100`, and `--success-50` next to `--success-100`, pairs a designer may well want collapsed.
That is a design decision, so it goes back to the human as a **note**, not a guess made inside a
refactor. It is `dsGaps[1]` in the handoff and a `severity: "note"` finding in the verdict.

### Why two layers rather than one

Raw steps alone would leave every caller picking scale numbers; semantic tokens alone would put
literals into the semantic block, which is otherwise 18-of-19 pure aliasing. So:

```
raw:       --violet-100  --error-50  --error-300  --success-50  --success-300     (5 new)
semantic:  --banner-{info|warning|error|success}-{bg|border|ink}                  (12 new)
component: var(--banner-<tone>-<slot>)                                            (12 slots)
```

`--banner-info-ink: var(--accent)` deliberately aliases `--accent`, not `--violet-700`: the
component uses `var(--accent)` today, and `--accent` is redefined under `[data-theme="dark"]`.
Aliasing `--accent` reproduces today's behaviour in both themes exactly. The other three inks
(`--amber-800`, `--error-500`, `--success-700`) are not redefined under dark, so they are unchanged
either way.

### Dark theme

No `[data-theme="dark"]` override is added. Today the banners render their light tints on charcoal;
after the change they still do, because the tokens carry one value. That is arguably a bug, but it
is a *pre-existing* one, and fixing it would change what renders — the exact thing requirement 2
forbids, and out of scope under "Light theme only this release". The semantic layer is what makes it
a twelve-line fix later, in one place. Recorded as `dsGaps[0]`.

---

## The registry question

The task asked whether `x-omelette.tokens` / `tokenKinds` must be updated, and whether anything is
generated from anything else. Measured, not assumed:

```
x-omelette.tokens               162 names
x-omelette.tokenKinds           162 keys
_ds_manifest.json tokens[]      181 records → 162 unique names
                                (the extra 19 are the [data-theme="dark"] redefinitions)
set difference between all three: empty
```

**Nothing is generated from anything else.** `_adherence.oxlintrc.json`, `_ds_manifest.json` and
`_ds_bundle.js` are three parallel exports of one upstream (Claude Design) source; the bundle's
header comment carries a `sourceHashes` map for exactly that reason. They agree today only because
they were emitted together, and they drift the moment one is hand-edited. So **yes** — adding a
token requires updating all three lists, or the design system starts lying about its own vocabulary.
All three must read **179** after this run.

Two ordering details worth stating so the diff is reviewable: `x-omelette.tokens` is sorted
alphabetically; `tokenKinds` and the manifest's `tokens[]` are in file-then-definition order.

Note that nothing enforces this today: `oxlint` is not a dependency of any workspace and there is no
`lint` script in `package.json`. The adherence file is documentation with a future as a gate — spec
01's and spec 02's design files both say it needs a native-attribute allowance "before the linter
can be switched on without noise". That is why `TC-DS-BANNER-E2E-01` exists: it is the only
executable check this chore can leave behind.

### `_ds_bundle.js`

The bundle carries its own inlined copy of the component (lines ~292–311 hold the same literals) and
is what the `*.card.html` specimen pages load. Two precedents pull in opposite directions:

- the Select `max-height` fix — recorded as **"fixed"** in the area README — never reached the
  bundle, so the bundle is *already* stale for `Select`;
- but the README's "Intentional additions" section says `_ds_bundle.js` "was hand-extended to match"
  for `AuthLayout` / `IconButton` / `Eye` / `Input trailing` / `Button loading`, and every one of
  those hand-edited components has **no `sourceHashes` entry**.

I chose to sync it (T5) and to delete the now-wrong
`"components/feedback/InfoBanner.jsx":"1a6fd57449af"` hash rather than leave a hash that no longer
describes the file. Dropping the entry is the established signal for "hand-edited, re-import on
regeneration"; the hash algorithm is not in this repo, so recomputing is not an option. The `Select`
drift is left alone and recorded as a risk rather than silently swept into a colour-token run.

---

## Deliberate non-goals, with the evidence

- **The px literals in `InfoBanner`** (`padding: '12px 14px'`, `gap: 10`, `border: 1px`) stay, even
  though `--sp-6`, `--sp-7`, `--sp-5` and `--border-hair` match them exactly and the adherence
  config's own `/\b\d+px\b/` selector flags the padding string. Reason: on colour, `InfoBanner` is
  the **only** offender in the whole design system — `grep -rn "oklch(" "1_DS for dev/components/"`
  returns four lines, all in `InfoBanner.jsx`. On spacing it is one of nine — `Button`, `IconButton`,
  `Table`, `Badge`, `Checkbox`, `Input`, `Radio`, `SearchField` and `Select` all carry px literals.
  Fixing one makes it the outlier and turns a colour diff into a spacing diff.
- **`'#fff'` in `Button.jsx` line 32 and `Checkbox.jsx` line 22** — a separate raw-colour smell
  (`--on-accent` exists). Out of scope; not part of the four tone triplets.
- **`AvatarInitials.tsx`** builds `oklch(...)` from a computed hue — after this run it is the last
  raw-colour site in app code, and it needs a design decision, not a token swap. `dsGaps[4]`.
- **`foundations/colors-semantic.card.html`** does not enumerate the new steps; its header declares
  `viewport="700x200"` and the lower grid is fixed at six columns, so adding swatches means
  re-laying out the card. `dsGaps[2]`.

## Blast radius

`InfoBanner` has **30 call sites across 19 files** in `apps/web` (login, signup, forgot-password,
reset-password, accept-invite, account settings and both its modals, confirm-email, members table,
member detail, invite modal, contract details, outbox, the templates editor, the envelope detail,
signers tab, fill form, the public signing page, and the toast layer). Every one of them goes
through `apps/web/src/ds.ts`, passes only `tone`, and applies no colour of its own. **Zero consumer
files change**, and requirement 2 is what keeps all 30 rendering identically.

## Verdict

The chore compiles. The one place it could have hidden an unforced visual change — the three
backgrounds that sit near an existing token — is closed by the stated acceptance and, decisively, by
the mockups being both the acceptance target and off-limits to this run. No blocker. One
`severity: "note"` finding goes to the human about the near-duplicate scale steps, because whether
`--error-50` and `--error-100` should both exist is a designer's call, not a refactor's.

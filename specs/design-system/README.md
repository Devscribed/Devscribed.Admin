# Design System: Yellow to Blue

The decision record for moving `apps/web` off **yellow** (Teammerly Meridian, the prototype skin)
and onto **blue** (Teammerly Original DS, the system measured from the live Teamplay/Teammerly
product). Source PRD: [Yellow to Blue](https://claude.ai/code/artifact/077c6e3b-aa7b-451b-b84a-cf12ba27b548).
Phased plan: [`plans/yellow-to-blue-migration.md`](../../plans/yellow-to-blue-migration.md).

This file exists so no phase re-derives a decision. Every later phase cites it; the divergence
[ledger](ledger.md) and in-code shims cite its decision numbers as `§Dn`.

## What blue is, and why it wins

Blue is not a style export. It is a reverse-engineered, evidence-verified reproduction of the
shipping product — production source, screenshots at 1440 CSS / 2x, and a three-round verification
procedure. That is why it has no `Toast` and no `Tooltip`: the live app has none, so there was
nothing to measure.

Yellow describes itself as *"a warm, editorial reskin of the Teamplay 2.0 product"*. Moving
yellow → blue moves the hiring module **back onto the shipping skin**.

The consequence that matters everywhere: **blue is a measurement, not a design.** Where blue made a
choice, it wins. Where blue merely failed to write something down, it is silent, not authoritative.
D1 and D2 below are that distinction, and between them they settle most questions this migration
raises.

## Decisions

Numbered because the ledger and in-code shims cite them.

| | Decision | Why |
|---|---|---|
| **D1** | Blue is the source of truth, **including layout**. | Where blue has an answer, blue wins — even when it moves elements. This overrides any "don't touch positions yet" framing, which now applies only to page composition blue gives no guidance for. |
| **D2** | Blue is **not** authoritative on its own omissions. | Missing prop forwarding, missing accessibility, missing keyboard handling are artifacts of blue being a *measurement*. Blue's `Modal` has no focus trap because prod never wrote one. These get added, logged in the ledger, and pushed upstream. |
| **D3** | Edit the vendored copy in place; keep a divergence ledger. | The app compiles blue's `.jsx` directly via `externalDir`, so in-place editing is the only fast loop. The failure mode is not editing — it is editing *silently*. Today 10 yellow components exist in the repo and not in `_ds_manifest.json`, and nothing warns you. |
| **D4** | Where blue has a pattern, change our code to use it. | Six components go away rather than get repainted: `SectionLabel`, `Skeleton`, `Toast`, `Tooltip`, `Pagination`, `Toggle`. Cheaper to remove once now than to repaint and remove later. |
| **D5** | Snap to blue's type scale. | Poppins at 15px is not IBM Plex at 15px in advance width or cap height — adopting the family reflows every string regardless. Preserving yellow's 13-step scale would buy a type system belonging to neither. |
| **D6** | Blue's shell dimensions, hiring's nav content. | Sidebar 290px, navbar 80/60px, breakpoint 1200px, hamburger + `MenuDrawer`. But Teamplay's nav items are prod **content**, not design language — and blue's `Sidebar` has no API to pass items, so that API is an omission filled under D2. Same split for icons: blue's icon *style*, hiring's own glyphs. |
| **D7** | Big bang on a branch; TypeScript is the safety net. | E2e is red for the duration, so it cannot guide the work. Writing `apps/web/types/ds.d.ts` against blue *first* makes `tsc --noEmit` enumerate every broken call site — a generated checklist that shrinks toward zero. |
| **D8** | No CI changes. All four suites green locally. | CI is owned elsewhere and stays as-is (it only runs migrations). The bar is a clean `npm run build` plus `test:unit`, `test:int` and `test:e2e` passing by hand — which is what makes D2's prop-forwarding rule load-bearing. |

Two decisions inherited from the current tree, unchanged by this migration:

- **Vendoring.** Blue replaces yellow in place at `1_DS for dev/`. The `@ds` alias,
  `experimental.externalDir` in `next.config.mjs`, and the `tsconfig.json` paths stay exactly as
  they are. `_ds_bundle.js` is not consumed by the app and will go stale — expected, not a defect.
- **Client boundary.** `apps/web/src/ds.ts` remains the single `'use client'` re-export barrel.
  The DS uses hooks and ships no directives, so this stays one file rather than a directive
  sprinkled across pages.

**Theme.** Light only. Blue has no dark palette and the app has no toggle, so the
`[data-theme="dark"]` problem this migration might have had does not exist.

## Token map

46 distinct tokens are used across `apps/web/app` and `apps/web/src`. Spacing is 145 of 148 uses
value-identical; typography is the only place the scales genuinely collide.

### Spacing — 145 of 148 uses are value-identical

| Yellow | px | Blue | px | Uses | Note |
|---|---|---|---|---|---|
| `--sp-2` | 4 | `--space-1` | 4 | 12 | identical |
| `--sp-3` | 6 | `--space-2` | 6 | 9 | identical |
| `--sp-4` | 8 | `--space-3` | 8 | 36 | identical |
| `--sp-5` | 10 | `--space-4` | 10 | 3 | identical |
| `--sp-6` | 12 | `--space-5` | 12 | 26 | identical |
| `--sp-7` | 14 | `--space-7` | 20 | 3 | ✅ **settled in Phase 1** — neither 12 nor 16. `TextInput` pins its message *below* the field rather than pushing it, so a field needs 16px of clearance underneath; 20px is the first step that gives it, and it is blue's own form rhythm. All 3 uses were on the signed-out screens and are gone. |
| `--sp-8` | 16 | `--space-6` | 16 | 26 | identical |
| `--sp-10` | 20 | `--space-7` | 20 | 20 | identical |
| `--sp-12` | 24 | `--space-8` | 24 | 4 | identical |

### Typography — the only real collision

| Yellow | px | Blue | px | Uses | Note |
|---|---|---|---|---|---|
| `--fs-12` | 12 | `--font-size-xs` | 12 | 17 | identical |
| `--fs-14` | 14 | `--font-size-s` | 14 | 35 | identical |
| `--fs-16` | 16 | `--font-size-base` | 16 | 1 | identical |
| `--fs-24` | 24 | `--headline-4-size` | 24 | 2 | identical |
| `--fs-11` | 11 | `--font-size-xs` | 12 | 3 | +1px |
| `--fs-13` | 13 | `--font-size-s` | 14 | 14 | +1px |
| `--fs-15` | 15 | `--font-size-base` | 16 | 11 | +1px |
| `--fs-22` | 22 | `--headline-5-size` | 20 | 1 | −2px |
| `--fs-27` | 27 | `--headline-4-size` | 24 | 1 | −3px |
| `--fs-34` | 34 | *none* | — | 2 | ⚠ no counterpart — decide per site |
| `--fs-21` | — | `--headline-5-size` | 20 | 1 | ⚠ never defined in yellow either — live bug, see below |
| `--font-display` | — | `--font-family-base` | — | 17 | Poppins; blue has one family |
| `--font-text` | — | `--font-family-base` | — | 3 | collapses with the above |
| `--lh-normal` | 1.4 | `--line-height-base` | 1.5 | 5 | looser |

### Color, surface, radius, effect

| Yellow | Blue | Uses | Note |
|---|---|---|---|
| `--text` | `--text-primary` `#1B1B1B` | 17 | |
| `--text-sub` | `--text-tertiary` `#54595E` | 20 | |
| `--text-muted` | `--text-secondary` `#64748B` | 48 | |
| `--text-faint` | `--text-secondary` | 4 | ⚠ blue has 3 text levels, yellow has 4 — collapses |
| `--accent` | `--action-primary` `#007AFF` | 14 | |
| `--accent-soft` | `--color-blue-light` `#EFF6FF` | 2 | |
| `--accent-border` | `--color-blue-lighter` `#E8F2FE` | 1 | |
| `--hover-bg-tint` | `--color-row-hover` | 2 | ⚠ yellow tints hover violet; blue's row hover is neutral grey |
| `--error-500` | `--status-error` `#D80027` | 5 | |
| `--amber-500` | `--status-warning` `#FFD02B` | 2 | ⚠ confirm each site is a warning. Both remaining uses are Phase 8's public surfaces. The third caller — `/login`'s deactivation banner, which reached amber through `InfoBanner tone="warning"` — was settled in Phase 1: see reversal 9. |
| `--tracker` | `--color-tracker-blue` `#2AA7FF` | 1 | both systems reserve a tracker hue |
| `--bg` | `--surface-page` | 3 | the well is `#f8fafc`, set in `AppShell` |
| `--bg-panel` | `--surface-card` | 1 | |
| `--bg-panel-2` | `--surface-sunken` `#EEF2F5` | 4 | ⚠ check each — may want the `AppShell` well instead |
| `--border` | `--border-default` `#E7E7E7` | 5 | |
| `--divider` | `--border-subtle` | 3 | |
| `--radius-sm` | `--radius-l` | 1 | 8px both |
| `--radius-md` / `--radius-lg` | `--radius-l` | 2 | 10 → 8; blue's workhorse radius |
| `--radius-pill` | `--radius-pill` | 1 | 20px both |
| `--shadow-card` | *remove* | 1 | ⚠ blue: static cards use a border, shadow only on hover |
| `--shadow-pop` | `--shadow-popover` | 1 | |
| `--duration-base` | `--duration-fast` | 1 | 150ms both |
| `--fw-semibold` | `--font-weight-semibold` | — | blue also has 450 / 500 / 550 |

### The seven rows that need a human call

`--fs-34` (2 uses, no counterpart) · `--fs-13` / `--fs-15` / `--fs-11` (28 uses, ±1px) ·
~~`--sp-7`~~ (**settled in Phase 1** → `--space-7`, 20px) · `--text-faint` (4 uses, collapses) ·
`--bg-panel-2` (4 uses, sunken vs. the well) · `--amber-500` (2 uses left, both Phase 8) ·
`--hover-bg-tint` (2 uses, violet → neutral).

Every other row is scriptable. Do the script first, then walk these by hand.

### A live bug this map exposes

`apps/web/src/layout/Sidebar.tsx:158` sets `fontSize: 'var(--fs-21)'`. Yellow's
`tokens/typography.css` defines 11/12/13/14/15/16/18/20/22/24/27/34/40 and **never defines
`--fs-21`**, so the sidebar wordmark silently inherits its size today. Maps to
`--headline-5-size` (20px). Fixed in passing in Phase 2, which owns the shell.

## Component inventory

Yellow's `index.js` has **33 exports**. Every one is accounted for below —
10 + 6 + 8 + 6 + 3 = 33, verified against the file rather than asserted.

### Build — 10 exports, 8 units of work

`Card` (34 uses), `IconButton` (6), `Eye` + `EyeOff` (6), `AuthLayout` (8), `BookingLayout` (6),
`Calendar` (1), `FileInput` (2), `BoardCard` + `BoardColumn` (2).

Two different kinds of work hide in that list, and the distinction survives all the way to the
upstream push:

- **Packaging, not invention.** `Card`, `IconButton` and `Eye`/`EyeOff` are already specified in
  blue's readme — `Card` is white, 1px `#E7E7E7`, `--radius-l`, no shadow until hover; `IconButton`
  is modelled on blue's `Modal` close button (13×13 glyph, `--text-secondary`, `scale(1.1)` on
  hover over 0.3s); blue's icon rules are explicit (geometric, filled, `currentColor`, 12–24px, no
  icon font). Only the components were never promoted. `NavigationCard` is a dashboard tile with no
  `children` and is not a substitute for `Card`.
- **No production precedent.** `AuthLayout` (prod has no login screen), `BookingLayout` (prod has
  no public surface at all), `Calendar` (blue's `DateField` is a 140px text field holding
  `"Mar 18, 2026"`; model the grid on `react-datepicker` defaults, which is what prod actually
  renders), `FileInput` (no CV upload in a time-tracker), `BoardCard` + `BoardColumn` (no kanban in
  prod). These must be marked **designed, not measured** when pushed upstream.

### Delete — 6, replaced by blue's pattern (D4)

| Yellow | Uses | Blue's pattern | Cost |
|---|---|---|---|
| `SectionLabel` | 13 | headings / `PageTabs` / `FieldLabel` | Blue captions nothing; `PageTabs` is its only uppercase. Needs a heading decision per screen. |
| `Skeleton` | 9 | `Preloader` — 3-dot loader, `overlay` mode | Content pops in rather than resolving in place. |
| `Toast` | 5 | `InfoBanner` | Transient becomes persistent; needs a slot on 5 screens. |
| `Tooltip` | 3 | native `title` | Not the free swap it looks like — see *Reversals* below. |
| `Pagination` | 1 | infinite scroll | New scroll handler plus the documented `Preloader size=8 margin=5` load-more row. |
| `Toggle` | 1 | `ToggleButton` | Switch becomes a labelled two-value segmented pill. |

### Rename — 8

| Yellow | Blue | Uses | Note |
|---|---|---|---|
| `Input` | `TextInput` | 16 | needs `id`, `name`, `required`, `aria-describedby` added (D2) |
| `Spinner` | `Preloader` | 6 | arc becomes three bouncing dots |
| `Combobox` | `Select isSearchable` | 5 | capability already exists; prod just never enables it |
| `Textarea` | `TextArea` | 4 | case change only |
| `Menu` | `Popover` | 3 | `items[]` shape |
| `SearchField` | `SearchInput` | 2 | |
| `Tabs` | `PageTabs` | 1 | labels become uppercase |
| `NavItem` | `Sidebar` | 1 | a whole component, not an item — see the relayout below |

### Open and remap props — 6

`Button` (62 uses), `InfoBanner` (20), `Badge` (13), `Modal` (10), `Select` (8), `Table` (3).

**Blue's components are closed, and this is the first task after vendoring.** `Button` destructures
exactly seven props with no `...rest`, so `data-testid`, `ref`, `aria-*`, `className` and `style`
all vanish silently — that is 81 attributes feeding 632 e2e selectors. It also hardcodes
`width: '100%'`. Yellow forwards rest props in 28 of its 31 components. Opening blue changes no
pixels and unblocks the entire test suite.

### Unchanged — 3

`Checkbox`, `Radio`, `RadioGroup`. Blue has equivalents; nothing to do beyond the token rewrite and
whatever D2 opening they need.

## The one deliberate relayout

| | Now | After |
|---|---|---|
| Sidebar width | 252px | 290px |
| Top bar height | 68px | 80px desktop / 60px mobile |
| Breakpoint | 1024px | 1200px |
| Narrow viewport | collapses to a 68px glyph rail | hamburger + `MenuDrawer` |
| Page well | `--bg`, warm `#F7F3EC` | `#f8fafc`, 25px padding, set by `AppShell` |

- **Blue's `AppShell` does not wire the breakpoint itself** — it renders `Sidebar` unconditionally.
  The drawer, the hamburger asset, `--shadow-drawer` and `--layout-navbar-height-mobile` all exist;
  only the switch is missing. Filled under D2.
- **Blue's `Sidebar` has no nav-items API** and hardcodes Timesheets / Projects / People / Reports /
  Time off / Organization. Add the API, keep hiring's items (D6).
- **Ledger this:** `#f8fafc` is hardcoded in blue's `AppShell.jsx` and absent from
  `tokens/colors.css`, while blue's `CLAUDE.md` records prod's off-token hardcode as `#f8f8f8`. Two
  different values, neither tokenised.

## Decisions this migration reverses

Adopting blue overturns things the current tree decided deliberately and wrote down. They are
listed here so the phase that hits one **makes a call rather than rediscovering the argument** —
and so a reviewer can tell a considered reversal from an accident.

1. **`Pagination` → infinite scroll deletes an answer, not just a control.** `README.md` records
   that the candidate database is paginated *precisely because* infinite scroll cannot answer
   "how many match?", and that bounds are disabled rather than hidden so Next never slides under
   the cursor. D4 still applies — blue's pattern wins — but **Phase 4 must re-home the match
   count** (the filter bar is the obvious place). Dropping the control silently drops the count.

2. **`Tooltip` → native `title` is free only for a pointer.** The PRD calls this a free swap; it is
   not. Yellow's `Menu` + `Tooltip` are a deliberate pair: a blocked action is *disabled rather
   than hidden*, because a missing action is indistinguishable from a bug — and that only works
   because the disabled item keeps `tabIndex` and `aria-disabled` instead of the `disabled`
   attribute, and because the bubble stays in the accessibility tree at all times so
   `aria-describedby` always resolves. Native `title` is not keyboard-reachable in any major
   browser. **Phases 3, 5 and 6 must decide** per site: visible text, a visually-hidden node
   wired to `aria-describedby`, or an accepted regression. Whichever is chosen, it is a ledger
   entry, not a silent swap.

3. **`BoardCard`'s `cancelledTooltip` is an accessible *name*, not a description.** The badge is
   deliberately truncated to a first name because a board card is a glance, so the tooltip carries
   the whole fact and is the badge's accessible name rather than what is drawn. A native `title`
   on an element that already has text content is a *description* — the text content still wins the
   name computation. **Phase 7 needs `aria-label`**, not `title`, to preserve that behaviour.

4. **`Toast` → `InfoBanner` changes the affordance, not just the component.** Transient becomes
   persistent, so five screens need both a slot and a dismissal story. Phase 3 sets the pattern the
   other four follow.

5. **`SectionLabel` → headings orphans `Table hideHeader`'s rationale.** `hideHeader` exists because
   My interviews' two groups are "already named by the `SectionLabel` above them". Remove
   `SectionLabel` and Phase 4 must supply the replacement heading, or `hideHeader` loses the reason
   it was added.

6. **`Card` must be built with `clip` from the start.** Yellow's `Card` gained `clip` (default
   `true`) because cards clip to their radius — which is what rounds an edge-to-edge `Table`'s
   corners, and also cut `Select` and `Combobox` popovers off at the card's edge. Four surfaces
   pass `clip={false}` today: the candidate database's filter bar, the candidate card's application
   section, and the two library cards on hiring settings. **Phase 2 builds `Card`; Phases 3, 4 and
   6 consume popovers inside it.** A `Card` built without `clip` regresses all four in a way that a
   click-based test still passes — the existing regression test hit-tests the option's own
   coordinates for exactly this reason.

7. **`--text-faint` collapsing flattens a hierarchy.** Yellow has four text levels, blue has three.
   Wherever faint and muted sat adjacent to signal a difference, that difference disappears.

8. **`--shadow-card` is removed, not remapped.** Blue separates static surfaces with a border and
   reserves shadow for hover. Anywhere yellow used elevation to stack surfaces needs a border.

9. **`/login`'s two error tones collapse into one.** `LoginForm` painted a deactivated account
   amber and a wrong password red, because amber says "retrying will not help" where red invites
   another guess. Blue's `InfoBanner` has two measured variants, `info` and a red one, because
   that is all prod has; amber exists in the palette but has never been a banner, so keeping the
   distinction meant inventing a treatment and calling it measured. **Settled in Phase 1: the tone
   is gone.** The argument for dropping it was in the note that introduced it — *the wording
   carries the full meaning on its own; the tone is reinforcement, never the sole signal*. The
   only test for it (TC-02-E2E-04) is skipped pending spec 04, so nothing was silently loosened.
   Full reasoning in [`02-authentication-login.design.md`](../user-management/02-authentication-login.design.md).

## Phase map

Full detail in [`plans/yellow-to-blue-migration.md`](../../plans/yellow-to-blue-migration.md).

| Phase | Surface | Lands |
|---|---|---|
| 0 | *no app code* | This record, the ledger, the drift check, README + spec-README reconciliation |
| 1 | `/login`, `/signup`, `/forgot-password`, `/reset-password` | Vendor blue · `types/ds.d.ts` · open blue's components (D2) · `AuthLayout`, `IconButton`, `Eye`/`EyeOff` |
| 2 | signed-in frame, `/org/{orgId}/members` | The relayout (290/80/60/1200, `MenuDrawer`) · `Card` · `Table` remap · the `--fs-21` fix |
| 3 | vacancies list + detail, `VacancyDialog` | First deletions: `Toast`, `SectionLabel`, `Skeleton`, `Menu` |
| 4 | candidates, my interviews, reschedule/cancel | `Calendar` · `Toggle`→`ToggleButton` · `Pagination`→infinite scroll |
| 5 | candidate card | `Tooltip`→`title` · `TextArea` trailing slot · `Button as="a"` for CV download |
| 6 | hiring settings, `CriterionDialog` | `ConfirmDialog` · `Select isSearchable` |
| 7 | vacancy board | `BoardCard` + `BoardColumn` fresh, *designed not measured* |
| 8 | `/book/{slug}`, `/manage/{slug}/{token}` | `BookingLayout` · `FileInput` · `globals.css` breakpoints |

Phase 1 goes first because `app-shell`, `org-scope`, `signup` and `hiring-my-interviews` all
authenticate through `/login` — most of the suite is blocked until those four screens work.

## Governance

### The ledger

[`ledger.md`](ledger.md) records every component and prop added to the vendored copy. It continues
the house rule the repo already states at
[`00-app-shell.design.md:111`](../user-management/00-app-shell.design.md) — *"DS gaps go into the
DS"* — rather than inventing a convention. The numbering rules live in that file.

The 10 existing `## DS gaps` tables across the design specs are already gap ledgers, and they seed
this one as each phase rewrites its spec. Numbers are assigned when the code lands, not in advance,
so the ledger starts empty on purpose. What it will hold, roughly, from the yellow-era additions
that must be re-created on blue:

- Rest props, `ref` and `aria-*` on every opened component; `Button`'s `width: '100%'` removed
- `Modal`: `role="dialog"`, `aria-modal`, `Escape`, focus trap, focus return, `initialFocusRef`
- `Button`: `as="a"` (a CV download through `onClick` loses middle-click, copy-address and the
  browser's own download handling)
- `TextInput`: `errorId`, and `id`/`name`/`required`/`aria-describedby`
- `TextArea`: a real `<label for>`, and the `trailing` slot in the *label row* — yellow put it
  there rather than inside the field because a multi-line field has no unambiguous place for it,
  and it is what lets the autosave indicator change without moving the field below it
- `Select`: a scrolling popover (a time-zone picker is hundreds of rows); `SelectOption`
  `disabled`, `hint`, `testId` so an ineligible interviewer shows disabled with its reason
- `Table`: `busy`, `hideHeader`, `rowHref`, `rowTestId`
- `Card`: `clip` — see *Reversals* §6
- `Sidebar`: a nav-items API (D6); `AppShell`: the breakpoint switch
- The 10 build-list components, each flagged *packaging* or *no prod precedent*

### The drift check

`npm run ds:drift` (`scripts/ds-drift.js`) diffs `index.js`'s exports against
`_ds_manifest.json`'s component list and exits non-zero when they disagree. It is a local check;
CI is unchanged (D8).

Today it reports 23 declared upstream against 33 exported here, and names the 10 that the design
project cannot see: `BoardCard`, `BoardColumn`, `BookingLayout`, `Calendar`, `FileInput`, `Menu`,
`Skeleton`, `Textarea`, `Toast`, `Tooltip`. That is the state D3 exists to make loud — it is
expected to fail for the length of the migration. The bar at the end is not that it passes, but
that **every disagreement carries a ledger number**.

### Upstream

One batched `DesignSync` push once the reskin is stable. The ledger *is* the push list.

Blue's `readme.md` invites it — *"Tell me if you'd like any of them promoted into the component
library"* — but two of its claims stop being true the moment we push, and the push must carry a
companion section separating **measured** from **designed**:

> "Every token, color, spacing value, shadow and component pattern was read directly from the
> codebase's .scss/.tsx source — nothing was invented or approximated."

> "### Intentional additions — None of the above were invented."

## Definition of done

- `npm run build` clean across all workspaces
- `test:unit`, `test:int` and `test:e2e` green locally — all 632 selectors resolving
- No `var(--sp-*)`, `var(--fs-*)`, `var(--paper-*)`, `var(--ink-*)`, `var(--violet-*)` or
  `var(--amber-*)` anywhere in `apps/web`
- `npm run ds:drift` passes, or every disagreement carries a ledger number
- No spec, README or comment still *describes* Meridian, Space Grotesk, IBM Plex or 252px as
  current. This record and the ledger name them as history, which is the point of them
- One batched `DesignSync` push staged, with the two `readme.md` claims above replaced by a section
  separating measured components from designed ones

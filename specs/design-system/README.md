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
| `--fs-16` | 16 | `--font-size-base` | 16 | 1 | ✅ **settled in Phase 5** — and not onto that row. The one use was the application panel's heading, which is now a real `<h2>` at blue's headline-6: also 16px, but with the weight, line and tracking that make it a heading. The third row to leave the map by becoming a component's own type rather than by being remapped |
| `--fs-24` | 24 | `--headline-4-size` | 24 | 2 | identical |
| ~~`--fs-11`~~ | 11 | `--font-size-xs` | 12 | 3 | ✅ **settled in Phase 6, and never once remapped.** 1 closed in Phase 3 into `FieldLabel`; Phase 5 closed one by deletion (the archived marker is part of the chip label's line and takes its 14px). Phase 6's last one went the way Phase 3's did — the criterion dialog's uppercase micro-caps became `FieldLabel`, in sentence case, with blue's own type. **No use left** |
| ~~`--fs-13`~~ | 13 | `--font-size-s` | 14 | 14 | ✅ **settled in Phase 6.** 1 closed in Phase 3 into `InfoBanner` (12px, so **−1px**); Phase 4 closed 3, none a remap; Phase 5 closed 2, both remapped as written. Phase 6's last three: the category usage count remapped up to 14px as the table says, and the dialog's two hand-built error lines became `InfoBanner` and `TextInput error`, arriving with their own type. **No use left** |
| `--fs-15` | 15 | `--font-size-base` | 16 | 11 | +1px — 1 closed in Phase 3, snapped; Phase 4 closed 1 more into `Calendar`'s own header type. Phase 5 closed 2, both snapped; Phase 6 closed 2, both snapped (a category's name and a criterion's). Phase 7 closed 2 — the empty-board sentence snapped, and the board card's name became `BoardCard`'s own type. **4 left, all Phase 8** |
| `--fs-22` | 22 | `--headline-5-size` | 20 | 1 | −2px |
| `--fs-27` | 27 | `--headline-4-size` | 24 | 1 | ✅ **settled in Phase 2** — the page header is blue's `PageTitle`, whose type steps 16 → 20 → 24px with the viewport rather than holding one size. The single use is gone. |
| `--fs-34` | 34 | *none* | — | 2 | ⚠ no counterpart — decide per site |
| `--fs-21` | — | *none* | — | 1 | ✅ **settled in Phase 2** — never defined in yellow either. Deleted rather than remapped, see below |
| `--font-display` | — | `--font-family-base` | — | 17 | Poppins; blue has one family |
| `--font-text` | — | `--font-family-base` | — | 3 | collapses with the above |
| `--lh-normal` | 1.4 | `--line-height-base` | 1.5 | 5 | looser — Phase 5 closed 1, on the candidate's own note |

### Color, surface, radius, effect

| Yellow | Blue | Uses | Note |
|---|---|---|---|
| `--text` | `--text-primary` `#1B1B1B` | 17 | |
| `--text-sub` | `--text-tertiary` `#54595E` | 20 | |
| `--text-muted` | `--text-secondary` `#64748B` | 48 | |
| ~~`--text-faint`~~ | `--text-secondary` | 4 | ✅ **settled across Phases 3–6.** Blue has 3 text levels, yellow had 4. The pattern is Phase 3's: a shown-but-unavailable thing is `--text-secondary`. Phase 4 closed 2 by inheriting it, Phase 5 a third. **Phase 6's last one is the case the pattern was named for** — a blocked `Delete` — and it needed one addition: `--text-secondary` is also what an *available* secondary control paints, so the button carries `opacity: .6` as well, which is blue's own disabled treatment on `Button`. Recede by one level and dim, rather than inventing a fourth ink. **No use left** |
| `--accent` | `--action-primary` `#007AFF` | 14 | |
| `--accent-soft` | `--color-blue-light` `#EFF6FF` | 2 | |
| ~~`--accent-border`~~ | `--action-primary` | 1 | ✅ **settled in Phase 7, and not onto the row it was written for.** The one use was Meridian's board — the held card's edge and the drop placeholder's dashed outline — and `#E8F2FE` on a `--surface-sunken` well is invisible. Both are the *current* thing on a board that shows one mark at a time, which is what blue spends `--action-primary` on. **No use left** |
| ~~`--hover-bg-tint`~~ | `--color-row-hover` | 2 | ✅ **settled across Phases 2 and 6.** Yellow tinted hover violet; blue's row hover is neutral grey. The top bar's logout row went in Phase 2 onto blue's own popover hover; `.library-row:hover` went in Phase 6, straight onto `--color-row-hover`. A list of settings is not where the product should acquire an accent it has nowhere else. **No use left** |
| `--error-500` | `--status-error` `#D80027` | 5 | |
| `--amber-500` | `--status-warning` `#FFD02B` | 2 | ⚠ confirm each site is a warning. Both remaining uses are Phase 8's public surfaces. The third caller — `/login`'s deactivation banner, which reached amber through `InfoBanner tone="warning"` — was settled in Phase 1: see reversal 9. |
| ~~`--tracker`~~ | `--status-warning` `#FFD02B` | 1 | ⚠ ✅ **settled in Phase 7 — and this is the one row in the table that must not be taken as written.** Both systems reserve a tracker hue, but Meridian's is *amber* and its single use is the board's missing-conclusion mark, drawn amber because amber was Meridian's warning colour. Blue's is `#2AA7FF` and belongs to the floating tracker widget alone — *"intentionally different from the primary blue, not a mistake to normalize away"*. Mapping by name would paint a warning in the one hue blue has spoken for, on a product with no tracker. Full argument in the [ledger](ledger.md). **No use left** |
| `--bg` | `--surface-page` | 3 | the well is `#f8fafc`, set in `AppShell` |
| `--bg-panel` | `--surface-card` | 1 | |
| `--bg-panel-2` | `--surface-sunken` `#EEF2F5` | 4 | ✅ **settled across Phases 2, 4 and 5.** Two went to `--surface-card` in Phase 2 — blue's shell is white panels around a `#f8fafc` well, not the reverse. The candidates filter bar went the other way in Phase 4, to `--surface-sunken`, because a control surface is neither a white panel nor the well. **Phase 5's is the last, and it follows Phase 4:** the candidate card's scheduling history is a log inset into the panel it belongs to, which is a recessed surface rather than a second white card floating inside a white one |
| `--border` | `--border-default` `#E7E7E7` | 5 | |
| `--divider` | `--border-subtle` | 3 | |
| `--radius-sm` | `--radius-l` | 1 | 8px both |
| `--radius-md` / `--radius-lg` | `--radius-l` | 2 | 10 → 8; blue's workhorse radius |
| `--radius-pill` | `--radius-pill` | 1 | 20px both |
| `--shadow-card` | *remove* | 1 | ✅ **settled in Phase 2** — `Card` was built with a border and no shadow at all (ledger §12). Blue's hover shadow belongs to `NavigationCard`, which is a control; a static container must not claim a click |
| `--shadow-pop` | `--shadow-popover` | 1 | ✅ **closed in Phase 7**, straight across, on the one thing in the app that floats without being an overlay: a board card held by the keyboard |
| `--duration-base` | `--duration-fast` | 1 | 150ms both — ✅ **closed in Phase 7 and not by this row.** The one use was the board card's own transition, which is now `--transition-card-hover`, blue's measured card motion at `--duration-quick`. A third row that left the map by the element becoming a component with its own values |
| `--fw-semibold` | `--font-weight-semibold` | — | blue also has 450 / 500 / 550 |

### The seven rows that need a human call

**Five of the seven are closed.** `--fs-34` (2 uses, no counterpart — both Phase 8) ·
~~`--fs-13`~~ / ~~`--fs-11`~~ (**both settled in Phase 6**, and between them only one use was ever
a remap) · `--fs-15` (5 uses left, ±1px, all Phases 7–8) · ~~`--sp-7`~~ (**settled in Phase 1** →
`--space-7`, 20px) · ~~`--text-faint`~~ (**settled in Phase 6**, on the blocked control the pattern
was named for) · ~~`--bg-panel-2`~~ (**settled across Phases 2, 4 and 5**) ·
`--amber-500` (2 uses left, both Phase 8) · ~~`--hover-bg-tint`~~ (**settled across Phases 2
and 6**).

Only `--fs-34` and `--amber-500` still need a human call, and both wait on Phase 8's public
surfaces. `--fs-15` is the one remaining ±1px row and D5 already decides it — snap up.

**Phase 7 closed five more rows and only one of them was a remap**, which is the pattern Phase 3
named and every phase since has repeated: `--shadow-pop` went straight across, and `--accent-border`,
`--tracker` and `--duration-base` all left the map by meaning something the mapping did not.
`--tracker` is the only row in the whole table that is actively **wrong** if taken as written, and
it is flagged in place.

**No Phase 3–7 file carries a yellow token**, and neither do the candidate card's, the libraries'
or the board's rules in `globals.css`. The two files that still do are Phase 8's — `BookingScreen`
and `ManageScreen` — plus that phase's own rules in `globals.css`.

Two rows left the map entirely in Phase 2 rather than being remapped: `--fs-27` and `--fs-21`,
both because the element that carried them is now a design-system component with its own type.

**Phase 3 says that is the rule, not the exception.** It closed one use each of `--fs-11`,
`--fs-13` and `--fs-15`, and only *one of the three was a remap*: `--fs-15` snapped up to
`--font-size-base` as D5 says. The other two left the map the way `--fs-27` did — the uppercase
micro-label became `FieldLabel` and the hand-built error line became `InfoBanner`, each arriving
with its own type. `--fs-13` is the one that shows why this matters: mapped by the table it would
have gone *up* to 14px, and the component it actually became draws at 12. The ±1px rows shrink
fastest by being deleted, so **walk them last, after the component swap** — several will not
survive to need a call.

Every other row is scriptable. Do the script first, then walk these by hand.

### A live bug this map exposed

`apps/web/src/layout/Sidebar.tsx:158` set `fontSize: 'var(--fs-21)'`. Yellow's
`tokens/typography.css` defines 11/12/13/14/15/16/18/20/22/24/27/34/40 and **never defined
`--fs-21`**, so the sidebar wordmark silently inherited its size.

**Fixed in Phase 2 by deletion, not by remapping.** The wordmark was typography — `Team` in ink,
`merly` in accent, an amber pin — because yellow had no logo file and said so ("There is no logo
file; never draw one"). Blue has one: the mark the shipping app draws, already inlined in
`Sidebar.jsx` and in `AuthLayout` since Phase 1. Adopting it takes the type declaration with it,
so there is no size left to get wrong. The 20px this row would have mapped to is what the
*headline* scale uses, and the wordmark was never a heading.

### A second live bug, found in Phase 3

`1_DS for dev/components/forms/` held **`Textarea.jsx` and `Textarea.d.ts`** — yellow's casing —
while `index.js` imported `./components/forms/TextArea.jsx` and `apps/web/types/ds.d.ts` mapped
`@ds/components/forms/TextArea`. Phase 1 renamed the component and not the file, and macOS's
case-insensitive filesystem hid it: every local build resolved, and the same import would have
failed on any case-sensitive one. Fixed in Phase 3 by a two-step `git mv`, which is the only way
to record a case-only rename from a filesystem that cannot tell the two apart.

Worth a check rather than a habit: `index.js`'s import paths should be diffable against
`git ls-files`, and nothing else in the vendored copy disagrees today.

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

  `Calendar` landed in Phase 4 as [§30](ledger.md), and the instruction above turned out to be
  better than it looked: blue **already contains** the react-datepicker measurement, in
  `DateRangePicker`, so the grid was reproduced from blue's own file rather than from the library's
  documentation. Only three things are genuinely designed — the Monday week start, the blank
  adjacent-month cells, and the keyboard grid — and all three are argued in the ledger's note.

  `BoardCard` and `BoardColumn` landed in Phase 7 as [§42](ledger.md) and [§43](ledger.md), and the
  same thing happened a second time: the card is `Card`'s surface (§12) wearing `NavigationCard`'s
  measured hover, and the column is a `Card` whose body is a `--surface-sunken` well — which is
  `AppShell`'s own well-and-panel arrangement one level down. What is genuinely without precedent
  is smaller than the components: the **held** card state, the **travelling placeholder**, and the
  **slot index** that counts cards and not gaps. Nothing in blue does any of those, because nothing
  in blue drags. The ledger's note on §42 sets out the three strengths `designed` has meant across
  this migration, so the upstream push can claim *composed from measured parts* where that is true
  and *invented* only where it is.

### Delete — 6, replaced by blue's pattern (D4)

| Yellow | Uses | Blue's pattern | Cost |
|---|---|---|---|
| `SectionLabel` | 13 | headings / `PageTabs` / `FieldLabel` | Blue captions nothing; `PageTabs` is its only uppercase. Needs a heading decision per screen. Phase 7 spent that uppercase deliberately — the board's column names are sentence-case `<h2>`s *because* the narrow board's tab strip is the `PageTabs`. **2 left, both Phase 8** |
| `Skeleton` | 9 | `Preloader` — 3-dot loader, `overlay` mode | Content pops in rather than resolving in place. Phase 6 took two on an internal screen and this row said the board's was the last; it was wrong by one. Phase 7 took the board's. **1 left, on `ManageScreen` — Phase 8** |
| ~~`Toast`~~ | 5 | `InfoBanner` | ✅ **gone in Phase 7.** Transient became persistent, which needed a slot and a dismissal story on five screens; Phase 3 set both and the four after it followed without reopening either. Phase 6's slot also absorbed its screen's separate error banner — one press, one answer, one place. See *Reversals* 4. |
| ~~`Tooltip`~~ | 3 | *nothing, a `Popover` row, and an `aria-describedby` target* | ✅ **gone in Phase 6**, and never once as native `title`. Three sites, three different answers — see *Reversals* 2. |
| ~~`Pagination`~~ | 1 | infinite scroll | ✅ **gone in Phase 4.** `Table footer` ([§34](ledger.md)) holding prod's own `.loadNextTableIndicator` at `Preloader size=8 margin=5`, fetched by an `IntersectionObserver`. The match count never moved — see *Reversals* 1. |
| ~~`Toggle`~~ | 1 | `ToggleButton` | ✅ **gone in Phase 4.** Yellow's was already a segmented pill, so the swap was the prop shape (`value1`/`value2`/`selectedValue`) plus [§31](ledger.md), which made two buttons one `radiogroup`. |

### Rename — 8

| Yellow | Blue | Uses | Note |
|---|---|---|---|
| `Input` | `TextInput` | 16 | needs `id`, `name`, `required`, `aria-describedby` added (D2). Phase 6 took the last on an internal screen |
| `Spinner` | `Preloader` | 6 | arc becomes three bouncing dots |
| ~~`Combobox`~~ | `Select isSearchable` | 5 | ✅ **gone by Phase 5**; Phase 6 verified both library autocompletes against 06 §04.21 and found `allowCreate` offering a create row for a *prefix* — see the ledger's note on §29 |
| `Textarea` | `TextArea` | 4 | case change only |
| ~~`Menu`~~ | `Popover` | 3 | ✅ **gone in Phase 6.** `items[]` shape, and §22's `description` is what the narrow blocked delete needed |
| `SearchField` | `SearchInput` | 2 | |
| ~~`Tabs`~~ | `PageTabs` | 1 | ✅ **gone in Phase 7**, and blue's had the same defect Meridian's did — `<a href="#">` for a control that swaps a panel. [§45](ledger.md) makes it a real `tablist` and adds the object form; the labels become uppercase because `PageTabs`' own CSS does it |
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
- **Landed in Phase 2**, as ledger §12–§18. Two things the table above does not say, and the phase
  had to decide: blue's `Sidebar` offers a collapsible-submenu form as well as a flat link, and
  hiring uses the flat one — every hiring destination is one level deep, and the link form is the
  one that keeps its own glyph. And the drawer is the rail itself, repositioned, rather than a
  second copy of the navigation inside a real `MenuDrawer`; the reasoning is under the ledger's
  Open table.

## Decisions this migration reverses

Adopting blue overturns things the current tree decided deliberately and wrote down. They are
listed here so the phase that hits one **makes a call rather than rediscovering the argument** —
and so a reviewer can tell a considered reversal from an accident.

1. **`Pagination` → infinite scroll deletes an answer, not just a control.** `README.md` records
   that the candidate database is paginated *precisely because* infinite scroll cannot answer
   "how many match?", and that bounds are disabled rather than hidden so Next never slides under
   the cursor. D4 still applies — blue's pattern wins — but the match count had to survive it.

   **Settled in Phase 4, and the count did not have to move.** It was never part of the pagination
   control: it is its own `aria-live` node above the table, it already read `12 of 128 candidates`,
   and it still does. What pagination actually carried was *position*, and the in-table load-more
   row carries that instead — rows below the fold mean more to come, and no row means the list is
   complete. Blue's own list screens work this way (`ProjectsTable`, `ToDosTable`, `ClientsTable`),
   and the indicator is prod's `.loadNextTableIndicator` at the `Preloader size=8 margin=5` the
   readme measures. Full detail in [`03-candidate-database.design.md`](../hiring/03-candidate-database.design.md).

2. **`Tooltip` → native `title` is free only for a pointer.** The PRD calls this a free swap; it is
   not. Yellow's `Menu` + `Tooltip` are a deliberate pair: a blocked action is *disabled rather
   than hidden*, because a missing action is indistinguishable from a bug — and that only works
   because the disabled item keeps `tabIndex` and `aria-disabled` instead of the `disabled`
   attribute, and because the bubble stays in the accessibility tree at all times so
   `aria-describedby` always resolves. Native `title` is not keyboard-reachable in any major
   browser. **Phases 3, 5 and 6 must decide** per site: visible text, a visually-hidden node
   wired to `aria-describedby`, or an accepted regression. Whichever is chosen, it is a ledger
   entry, not a silent swap.

   **Phase 3 took visible text**, on the vacancy's blocked delete: the reason is drawn in the
   menu row under the label and wired as that row's `aria-describedby`, and the row keeps
   `aria-disabled` and its place in the keyboard walk ([§22](ledger.md), which carries the
   argument). Native `title` was never available there — the whole point of showing a blocked
   action is that its reason can be read.

   **Phase 5 took the accepted regression, on the candidate card's cancelled badge, and it cost
   almost nothing.** The bubble drew the whole cancellation; the badge's `aria-label` already
   *was* the whole cancellation, and the truncated `Cancelled by Pat` is only what is painted. So
   the `aria-label` stays and the bubble goes. It also found the thing this reversal did not
   anticipate: on an element that already has a name, native `title` becomes the accessible
   **description**, so adding one would have read the same sentence twice.

   ✅ **Settled in Phase 6, and native `title` was never used once.** Phase 5 called itself the
   second of three and left "the last site" to Phase 6; the count of three was of the component's
   uses, and Phase 6 held **two** of them — the vacancies menu §22 answered was a `Menu` `tooltip`
   *prop*, not a `<Tooltip>`. Both are settled, and between them the three sites used all three of
   the answers this reversal offered, once each:

   | Site | Phase | Answer |
   |---|---|---|
   | Vacancy's blocked delete (a menu row) | 3 | Visible text, drawn in the row ([§22](ledger.md)) |
   | Candidate card's cancelled badge | 5 | Accepted regression — the `aria-label` was already the whole fact |
   | Criterion's blocked delete, ≥ 768px | 6 | Accepted regression — same reason, and `hiring-libraries.spec.ts` asserts that name |
   | Criterion's blocked delete, < 768px | 6 | Visible text in the `Popover` row — the same site, in the shape it takes below the breakpoint |
   | Scale value's blocked remove | 6 | The middle answer, unused until now: the reason drawn under the chip list and wired as the cross's `aria-describedby` ([§39](ledger.md)) |

   **What decided every one of them was not the component but whether the screen already had
   somewhere to say it.** The vacancies menu had nowhere and had to draw one; the candidate card
   draws the cancellation in its history log; the criterion row draws the count on its second line
   and the alternative as the `Archive` button beside it; the scale editor draws nothing, so it had
   to. That is the rule this reversal was actually looking for, and it is worth more than the
   three-way choice it started with.

   **Phase 7 found the one place a native `title` is not a regression, and it is the exception
   that proves the rule the other three sites established.** The board's missing-conclusion marker
   is a glyph with **no accessible name of its own** — it is `aria-hidden` decoration inside a
   `role="button"` whose name the caller supplies. So `title` there cannot shadow a name or be
   read as a second sentence after one; it is a pointer affordance and nothing else. A reader gets
   the middle answer instead, a visually-hidden node the card points `aria-describedby` at, which
   a board card needs because three lines have nowhere to put a sentence. `title` is not a
   *substitute* for that — it is a free addition on top of it, which is precisely what the PRD
   thought the swap was everywhere and what it turned out to be nowhere else.

   Item 3 below is the board's *other* mark, and it goes the opposite way: `aria-label`, never
   `title`, because that element does have a name.

3. **`BoardCard`'s `cancelledTooltip` is an accessible *name*, not a description.** The badge is
   deliberately truncated to a first name because a board card is a glance, so the tooltip carries
   the whole fact and is the badge's accessible name rather than what is drawn. A native `title`
   on an element that already has text content is a *description* — the text content still wins the
   name computation. **Phase 7 needs `aria-label`**, not `title`, to preserve that behaviour.

   ✅ **Settled in Phase 7 exactly as written**, and it turned out to be the smallest of the three
   tooltip calls, because Phase 5 had already reached the same conclusion on the same fact from the
   other side: the candidate card's cancelled badge takes `aria-label` for identical reasons, and
   `cancelledBadgeLabel` / `cancelledTooltip` are one pair of helpers serving both surfaces. Two
   screens, one component, one answer. The board's *other* mark went the other way — see the note
   at the end of reversal 2 — and the two together are what makes the rule legible: **`title` is
   harmful exactly when the element already has a name, and harmless exactly when it does not.**

4. **`Toast` → `InfoBanner` changes the affordance, not just the component.** Transient becomes
   persistent, so five screens need both a slot and a dismissal story. Phase 3 sets the pattern the
   other four follow — and it is: **directly under `PageHeader`, above the page body**, because
   the announcement is about the page and was raised from the header above it, and in flow it
   pushes content down rather than covering it. It goes away by being dismissed
   (`InfoBanner onDismiss`, [§24](ledger.md)) or by being replaced — a new notice overwrites the
   old one, so they never stack. **Nothing auto-dismisses**: a banner that removed itself after a
   few seconds would be a toast wearing a different component, which is the thing blue does not
   have. Full detail in [`01-vacancies.design.md`](../hiring/01-vacancies.design.md).

   ✅ **Closed in Phase 7 on the fifth screen, and no phase reopened the pattern.** That is the
   result worth recording: of the four reversals that named a decision rather than a component,
   this is the only one where the first phase's answer held unmodified at every later site. The
   board is also the site with the strongest case for covering content instead — a toast over a
   kanban does not push five columns down — and it still takes the slot, because the alternative
   is a notice floating over the column somebody is looking at while they try to drag in it.

5. **`SectionLabel` → headings orphans `Table hideHeader`'s rationale.** `hideHeader` exists because
   My interviews' two groups are "already named by the `SectionLabel` above them". Remove
   `SectionLabel` and the replacement heading has to name the table, or `hideHeader` loses the
   reason it was added.

   **Settled in Phase 4: the group's name is the `Card`'s own title**, at `titleAs="h2"`
   ([§27](ledger.md)), wrapping the `Table hideHeader` ([§34](ledger.md)). That is stronger than
   the caption it replaces — a card title names the table *inside its own surface* rather than by
   proximity — and it puts the group in the `<h2>` outline under `PageTitle`'s `<h1>`, which is
   the answer Phase 3 already gave for captions. The `<section aria-label>` around each group went
   with it: a real heading and a same-named region announce the group twice.

6. **`Card` must be built with `clip` from the start.** Yellow's `Card` gained `clip` (default
   `true`) because cards clip to their radius — which is what rounds an edge-to-edge `Table`'s
   corners, and also cut `Select` and `Combobox` popovers off at the card's edge. Four surfaces
   pass `clip={false}` today: the candidate database's filter bar, the candidate card's application
   section, and the two library cards on hiring settings. **Phase 2 builds `Card`; Phases 3, 4 and
   6 consume popovers inside it.** A `Card` built without `clip` regresses all four in a way that a
   click-based test still passes — the existing regression test hit-tests the option's own
   coordinates for exactly this reason.

   **Phase 3 did not exercise it.** Its two popovers open from a `Modal` (the category and
   interviewer pickers) and from `PageHeader` (the actions menu), neither of which is a `Card`.

   **Phase 4 proved it.** The candidates filter bar is the first of the four surfaces, it passes
   `clip={false}`, and `hiring-candidates.spec.ts` has the regression test this reversal was
   written for — it hit-tests the last criterion's own coordinates with `elementFromPoint`, because
   a clipped popover keeps its layout geometry and scrolls into view inside the card that hides it,
   so a click-based test passes either way. It is green. The three remaining surfaces are the
   candidate card's application section (Phase 5) and the two library cards (Phase 6).

   **Phase 5 is the second surface.** The candidate card's application section passes
   `clip={false}` because its header holds the status `Select` and its body holds a value control
   per criterion, and both drop a list into the card. The two library cards on hiring settings are
   the last, in Phase 6.

   Phase 4 also found the other half of this problem, which `clip` does not solve: blue's `Select`
   kept a multi-select's menu **open** after a choice, so picking the one position left an emptied
   `No options` list covering the category row beneath it. That is [§36](ledger.md) — a divergence
   from react-select's own default rather than anything measured.

   Phase 5 found a third face of it, inside a component rather than a card:
   [`Chip`](ledger.md)'s label span ellipsises to one line, so a value control put there is
   clipped and one that opens a list is cut off at the chip's edge. The answer is the same shape —
   a slot outside the box that hides things ([§37](ledger.md)).

7. **`--text-faint` collapsing flattens a hierarchy.** Yellow has four text levels, blue has three.
   Wherever faint and muted sat adjacent to signal a difference, that difference disappears.

   Phase 3 settled the pattern and **Phase 4 applied it twice** without needing to reopen it: a
   past interview's date and a character count are *receded*, which is the same reading as a
   shown-but-unavailable option, so both take `--text-secondary`. **Phase 5 applied it a third
   time** — a scheduling-history row's timestamp, beside the fact it dates — for the same reason.

   ✅ **Closed in Phase 6**, on the case the pattern was actually named for: a `Delete` that is
   blocked. One addition was needed. `--text-secondary` is also what an *available* secondary
   control paints, so on a control it is not by itself a signal — the button takes `opacity: .6`
   with it, which is blue's own `Button` disabled treatment. Recede one level and dim, rather than
   invent the fourth ink back.

   **Phase 7 met a fifth site after the closure, and it is the only one where the collapse would
   have erased a distinction rather than a nuance.** The four uses this reversal counted were in
   `apps/web`; Meridian's `BoardCard` had another, inside the design system. It matters because
   the arithmetic is different: everywhere else something receded *from `--text-primary`*, so
   dropping to `--text-secondary` still left a step. On a board card the date is already receded —
   Meridian drew it `--text-muted` and its past variant `--text-faint` — so mapping both
   mechanically lands them on one ink and 05 §05.18's *"the date reading as past"* becomes nothing
   at all. Blue's three inks run `--text-primary` → `--text-tertiary` → `--text-secondary` (tertiary
   is `#54595E`, darker than secondary's `#64748B`, which the names invert), so the card reads
   primary / tertiary / secondary down its three lines and a past date steps tertiary → secondary.
   The pattern is unchanged — **recede by one level** — and it survives at a level the reversal had
   not been applied at. Argued in the [ledger](ledger.md).

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
| 3 | vacancies list + detail, `VacancyDialog` | First deletions: `Toast`, `SectionLabel`, `Skeleton`, `Menu`, `Combobox` · `Select` opened into a real combobox · `Chip` · ledger §19–§29 |
| 4 | candidates, my interviews, reschedule/cancel | `Calendar` · `Toggle`→`ToggleButton` · `Pagination`→infinite scroll |
| 5 | candidate card | `Tooltip` deleted, not replaced · `TextArea` trailing slot consumed (§33) · `Chip trailing` §37 · `Button as="a"` §38 |
| 6 | hiring settings, `CriterionDialog` | Last of `Tooltip`, `Menu`, `Toast`, `Skeleton`, `Input` · `ConfirmDialog` §40/§41 · `Chip leading` §39 · reversal 2 settled · §8 and §29 corrected |
| 7 | vacancy board | `BoardCard` + `BoardColumn` §42/§43, *designed not measured* · `FlagIcon` §44 · `PageTabs` made a real `tablist` §45 · last of `Toast` and `Tabs` · reversals 3 and 4 settled |
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

On the day it was written it reported 23 declared upstream against 33 exported here, and named the
10 that the design project could not see: `BoardCard`, `BoardColumn`, `BookingLayout`, `Calendar`,
`FileInput`, `Menu`, `Skeleton`, `Textarea`, `Toast`, `Tooltip` — every one of them yellow's. That
is the state D3 exists to make loud, and it is expected to fail for the length of the migration.

**As of Phase 7 it reports 65 against 76, and names 11 — a different 11.** `AuthLayout`,
`BoardCard`, `BoardColumn`, `Calendar`, `Card`, `Chip`, `CrossIcon`, `Eye`, `EyeOff`, `FlagIcon`,
`IconButton`: not one is a leftover, and each carries a number in the [ledger](ledger.md). That is
the bar — not that the check passes, but that **every disagreement it reports is a deliberate
addition somebody wrote down**.

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

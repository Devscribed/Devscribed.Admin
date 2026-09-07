# Design System Specifications

`packages/ds` is the Teammerly Meridian design system — the components every screen in this product
is drawn from. Most of what it does needs no specification: a component's own file carries its
argument, and [`decisions.md`](decisions.md) indexes the numbered decisions the code cites.

This area exists for the rules that **span components** and therefore belong to no component file.
A rule about how the frame behaves at 360px is not `AppShell`'s, `Navbar`'s or `Sidebar`'s; it is
all three at once, plus a stamp on `<html>` that none of them owns.

## Spec Index

| # | Spec | Design | Tags |
|---|------|--------|------|
| 01 | [Responsive & Pointer](01-responsive.md) | — | responsive, breakpoints, viewport, pointer, touch, hover, drawer, sheet, tabs |
| — | [Decisions](decisions.md) | — | the numbered reference every component cites as `§n` |

`decisions.md` is a **reference, not a spec**: it carries no requirements, no test cases and no
acceptance criteria. A numbered decision is assigned when the code lands, never reserved. ~~Specs
in this area add to it from §96.~~ — **overruled by §96–§98**, which a spec in *hiring* assigned.
`decisions.md` indexes every numbered decision in `packages/ds` whoever wrote the code, and the
first three past §95 came from [hiring 01's](../hiring/01-vacancies.design.md) responsive
revision: `Table.hideBelow`, `RecordCard` and `RecordList`. The rule that survives is the one
about the numbers — assigned on landing, never reused, cited from the code — not a rule about
which area is allowed to add one.

## Product Decisions

| Decision | Choice | Rationale | What lost |
|---|---|---|---|
| What a breakpoint measures | The viewport | It can be read before paint, needs no observer per screen, and gives the same answer everywhere at the same width | A container query per screen: it needs a `ResizeObserver`, cannot be read before paint, and answers differently at one viewport depending on whether the rail is drawn |
| How JavaScript learns the width | A pre-paint stamp on `<html>` | The first painted frame is already right, and every consumer reads one attribute rather than opening its own `matchMedia` | A hook that starts `false` and settles after mount — which is what ships today, and what draws a phone the desktop board with every card draggable for one frame |
| How touch is detected | One axis, `data-pointer`, from `(hover: hover) and (pointer: fine)` | All three pointer rules — hover, target size, drag — need the same split | Two axes, hover-capability and pointer-precision apart: more precise, and no rule this product has would use the extra precision |
| Where the ladder's numbers live | Three times — `base.css`, `breakpoints.ts` and the `--layout-breakpoint-desktop` token — with a drift check in `ds:check` | CSS cannot read a JavaScript constant, so the duplication is structural; a check is what makes it safe | A CSS custom property per breakpoint: a custom property cannot appear in a media query, so it would be a token that lies about being usable |
| Whether a screen may add a breakpoint | No | Six rungs are already more than any one screen uses, and a seventh is a number the next reader cannot place | Per-screen freedom; the one survivor is `880` on the public booking page, which keeps its number because a measurement defends it |

## Shared Rules

| Rule | Defined in | Referenced by |
|------|-----------|---------------|
| Six named rungs; the minimum supported width is 360 | 01 | every `.design.md` with a `## Responsive` section |
| The viewport decides, never a container | 01 | hiring 01–07 |
| `data-bp` / `data-pointer` / `data-motion` are stamped before first paint | 01 | hiring 05 (board drag), hiring 03 (filters panel) |
| A design-system control reports hover only to a fine pointer | 01 | all |
| Under a coarse pointer every drawn control is at least 44 × 44 | 01 | all |
| An overlay panel below `sm` is a sheet; a `Popover` menu never is | 01 | hiring 01, 03, 04, 06 |
| A `Tooltip`'s content is never the only carrier of its information | 01 | hiring 01, 06; user-management 04 |
| A screen chooses its overlay by meaning, never by width | 01 | all |

## Cross-Spec Side Effects

The other five areas carry this section because a trigger in one of their specs lands in another.
Here the direction is inverted: this area triggers, and every other area is a target. The rows are
therefore one spec's, and they are listed rather than left to the spec's own Amendments table so a
reader of the index can see the reach.

| Trigger | Source | Effect | Target |
|---------|--------|--------|--------|
| The rail becomes a left drawer over a painted scrim | 01 | The app shell's Responsive section describes the opposite edge | user-management 00 |
| `.page-title` loses its 16/24 step | 01 | Every screen's `<h1>` grows below 768, public pages included | user-management 00, and every area |
| An overlay panel becomes a sheet below `sm` | 01 | The `Modal` full-screen-drawer gap, recorded as open in seven documents, is closed — at 576 rather than 480, and as a sheet rather than a drawer | user-management 07, 09, 10, 12, 14, and the area README |
| A bottom sheet becomes the system's own form | 01 | Four specs forbid bottom sheets and sticky bottom bars outright, on the grounds that they collide with the browser chrome. The form wins and the objection is answered: the footer clears `env(safe-area-inset-bottom)` | user-management 11, 12, 13, 15 |
| A `Popover` menu stays anchored at every width | 01 | Two "bottom-sheet select" treatments are withdrawn — a menu is not a panel, and a screen may not pick an overlay by width | organization 01, 03 |
| `MenuDrawer` traps focus below `sm` | 01 | The candidate database's "focus is not trapped" holds only from `sm` up | hiring 03 |
| Board drag follows the pointer, not the width | 01 | The board's "below 768px drag is not attempted" is replaced by a pointer test | hiring 05 |
| `PageTabs` stops wrapping | 01 | Nine call sites in five sections change shape where they used to wrap | hiring, documents, user-management, organization |
| The ladder is set | 01 | Twenty-nine width statements in eleven documents are grandfathered until each screen's spec is revised | hiring 01–04, 07; organization 01, 03; reports 01; user-management 11, 12, 14, 15 |
| `ds:check` gains two hard failures | 01 | CLAUDE.md's deep-import sentence becomes true of the script | CLAUDE.md, this README |

## Dependency Graph

```
                 design-system/01-responsive
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
 user-management/00   hiring/01 … 07      organization, reports
 (app shell design)   (.design.md each)   (inherit the shell only)
```

Nothing in this area depends on another area. Every other area depends on it, which is why an
amendment here is applied statement by statement in the documents it overrules rather than
announced in a banner.

## Blast Radius

| Surface | What contact breaks |
|---|---|
| Shared code | `packages/ds` is imported by 111 lines in `apps/web`, all from the package root. A component whose props change breaks compilation everywhere at once, which is the intended failure — a deep import would let one caller drift, and `npm run ds:check` refuses those. |
| Every section | A rule here reaches documents, projects, members, clients, reports and time tracking, none of which have a responsive design of their own. A change that is not a no-op above `xl` under a fine pointer is a change to six sections nobody asked to touch. |
| The E2E suite | It runs at 1280 × 720 with a fine pointer, so it cannot observe a rule below `xl` or under a coarse pointer. That makes it safe against regression and useless as proof — a rule about touch needs a context that emulates one. |
| The public pages | `/book/{slug}`, `/manage/{slug}/{token}` and `/sign/{token}` render outside `AppShell`. They inherit tokens and `base.css` and nothing else, so a shell rule must never be written as if it reached them. |

## Backward Compatibility

1. **This area introduces no schema, no endpoint and no migration.** Deploy order cannot matter and
   a rollback needs no database change.
2. **A design-system change is source, not a build.** `packages/ds` ships TypeScript that Next
   compiles through `transpilePackages` (`apps/web/next.config.mjs:69`), so there is no version to
   pin and no artifact that can be stale against the app.
3. **A numbered decision is never renumbered and never reused**, so a `§n` cited from a component
   file keeps resolving after a decision is revised or reversed.
4. **A component's public surface is its export from the package root.** Anything else is internal
   and may move; `npm run ds:check` is the mechanism that keeps it that way, and it now fails the
   build rather than printing a note. The package publishes **three** entries: the root,
   `./styles.css`, and `./breakpoints` — the responsive ladder, which is data rather than a
   component and must be readable from a server component, where the root's `'use client'` turns
   every export into a client reference.

## Known Gaps

| Gap | Why it is acceptable now | What closes it |
|---|---|---|
| No unit-test project in `packages/ds` | `npm run test:unit` runs `@devscribed/validation` alone, and until spec 01 nothing in the design system was a pure function worth testing | Spec 01 adds a vitest project and extends the root script to both workspaces |
| No automated check for overlap, clipping or bad truncation | A selector can say a column is absent; it cannot say two things sit on top of each other | The five-width screenshot pass, run by a person each phase |
| Dark theme | Light only this release | A second token file and a `data-theme` axis on the same stamp spec 01 introduces |

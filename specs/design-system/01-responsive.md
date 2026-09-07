---
id: "01"
title: Responsive & Pointer
routes: ["every route inside AppShell", "/book/{slug}", "/manage/{slug}/{token}", "/sign/{token}"]
api: []
entities: []
tags: [responsive, breakpoints, viewport, pointer, touch, hover, drawer, sheet, tabs, accessibility, hit-target, design-system]
depends-on: []
---

# 01 — Responsive & Pointer

## Summary

The design system draws one layout at one width. This spec gives it a **ladder** of six named
widths, a **pre-paint stamp** that lets JavaScript read the current rung without guessing, and a
**pointer axis** that is independent of width — so a mouse in a 900px window keeps its hover and a
tablet at the same width does not. It also gives the three overlay panels a phone form: below `sm`
a `Modal`, a `ConfirmDialog` and a `MenuDrawer` rise from the bottom as a sheet rather than
floating in the middle. `Popover`'s menu is the fourth overlay and stays anchored to its trigger at
every width.

The structural decision that shapes everything here: **the viewport decides, never a container.**
The alternative — measuring the well a screen lives in — was rejected because it needs a
`ResizeObserver` per screen, cannot be read before paint, and answers a different question at the
same viewport depending on whether the rail is drawn.

This spec owns the mechanism. What each screen does with it is that screen's own `.design.md`,
revised in place. Numbered outcomes join
[`decisions.md`](decisions.md) from §96.

**Depends on:** nothing. It is the first numbered spec in this area.

## Actors & Preconditions

| Actor | Precondition |
|---|---|
| A signed-in member on a phone | A session; any route under `/org/{orgId}`. The rail is a drawer at their width. |
| A signed-in member on a desktop | A session. The rail is in view and nothing in this spec changes what they see. |
| A signed-in member on a touch tablet | A session, and a coarse pointer at a width that used to be treated as desktop. |
| A candidate on a phone | No session. `/book/{slug}` and `/manage/{slug}/{token}` render in `BookingLayout`, outside `AppShell`, so for them the viewport *is* the container. |

Preconditions that must already hold: `AppShell` accepts `menuOpen` / `onMenuClose`
(`packages/ds/src/components/appLayout/AppShell.tsx:24-26`), `Navbar` renders a hamburger when
given `onMenuClick` (`packages/ds/src/components/appLayout/Navbar.tsx:54-59`), and the app wrapper
owns the open state (`apps/web/src/layout/AppShell.tsx:25`). All three ship today.

## Roles & Permission Matrix

**This spec changes no permission and reads no role.** Every rule is a function of viewport width
and pointer type, both of which are properties of the browser rather than of the account. The
matrix is deliberately absent; `OrgScopeGuard`, `InterviewerScopeGuard` and
`CandidateDatabaseGuard` are untouched, and no rule below may be expressed as "an admin sees the
wide form".

## Functional Requirements

### §01 The ladder

1. The system has six named widths. They are the only width names **`packages/ds` and any document
   revised on or after this spec** may use — a class, a media query or a JavaScript constant alike.

   They are **not** retroactive. Twenty-nine width statements in eleven documents predate this
   ladder, and requirement 3 says what happens to the numbers behind them. An unqualified "every
   document" would be an invariant this spec ships already violated, which is a standard nobody can
   hold. The documents are grandfathered until the spec that owns each screen is revised, and each
   revision is a phase of its own.

   | Name | Applies from | Written in CSS as |
   |---|---|---|
   | `xs` | 0 | `(max-width: 575px)` |
   | `sm` | 576 | `(min-width: 576px)` / `(max-width: 767px)` |
   | `md` | 768 | `(min-width: 768px)` / `(max-width: 991px)` |
   | `lg` | 992 | `(min-width: 992px)` / `(max-width: 1199px)` |
   | `xl` | 1200 | `(min-width: 1200px)` / `(max-width: 1439px)` |
   | `xxl` | 1440 | `(min-width: 1440px)` |

2. **The minimum supported width is 360px.** Below it nothing is verified and no rule is promised.
   360 is chosen because it is the narrowest viewport in common use, not because a control measures
   it.

3. **No new breakpoint may be introduced by a screen.** A screen that wants a seventh number
   amends the table above instead.

   Every non-ladder number that exists today is named here with what becomes of it, in code and in
   prose, because a rule that says "the six names are the only names" and leaves counter-examples
   unaddressed is a rule the next reader disproves in one grep.

   | Number | Where in code | Verdict, and the document that executes it |
   |---|---|---|
   | `879` | `globals.css` — the booking page's two-panel fold | **Survives** as the one exception, because a measurement defends it rather than a spec claiming it. ~~The measurement is in `specs/hiring/02-booking-page.design.md:33`: 880 is where the calendar and the slot list stop fitting side by side.~~ **Corrected by [02 design §Responsive](../hiring/02-booking-page.design.md#responsive)**, which took it: line 33 was the column cap described as "wide enough", and the two Cards go on fitting down to **818**, where a day cell reaches `--control-height`. The verdict is unchanged and the reason is now a range — 818–991 is legal and **no ladder number falls inside it**, `md` being 767 (cell 39.9) and `lg` 991 (173px of room to spare). That absence is what earns the exception. |
   | `599` | `globals.css` ×3 — the booking page's stack, and the manage page's two action rows | **Retired to `575`**, the `xs`/`sm` boundary. 600 was never measured; it is one off the ladder and reads as a different decision when it is the same one. **Executed** in `specs/hiring/02-booking-page.design.md` and `07-manage-booking.design.md`; `04-candidate-card.design.md:511`, which also stated a 600, was struck rather than retired — its subjects had moved into a kebab. |
   | `1023` | `globals.css:347`, `:778` — the candidate card | **Retired to `991`**, the `md`/`lg` boundary. `specs/hiring/04-candidate-card.design.md`. |
   | `1023` | `apps/web/app/org/[orgId]/hiring/candidates/page.tsx:77` — `const NARROW = '(max-width: 1023px)'`, a **constant**, not CSS | **Retired to `991`**. Owned by `specs/hiring/03-candidate-database.design.md`, not the candidate card — this is the database list. Requirement 11 moves `useMediaQuery` and deliberately does not touch the query passed to it, so this survives Phase 1. |
   | `767` | `VacancyBoard.tsx:24` — `const NARROW = '(max-width: 767px)'` | **Already on the ladder**: `md` minus one. Nothing to do. |
   | `1024`, `768` | prose in `specs/hiring/01-vacancies.design.md:491` `:503`, `03-candidate-database.design.md:627`, `04-candidate-card.design.md:508` `:509`, and in `organization/01-clients.md`, `organization/03-holidays.md`, `reports/01-reports.md`, `user-management/11-projects*`, `12-time-tracking*`, `14-task-collaboration.design.md`, `15-time-tracking-tasks.design.md` | **Grandfathered.** Each retires to `991`/`992` when the spec that owns its screen is revised. None is revised here, and requirement 1 does not govern them until then. |
   | `520` | the signed-out shell — `user-management/02-authentication-login.design.md:298`, `01-organization-creation.design.md:132`, `06-account-settings.design.md:408`, `03-user-invitation.design.md:237` | **Grandfathered, and possibly permanent.** `AuthLayout` is a 480px card on an empty page and shares nothing with the shell. Whether 520 earns an exception like 880 needs a measurement nobody has taken. |
   | `480` | the open `Modal` full-screen-drawer gap — `user-management/README.md:68` and six more | **Superseded**, not retired: requirement 49 puts the sheet at `sm` — 576, not 480, and a sheet rather than a drawer. Amended in each of the seven; see the Amendments table. |

   Until each owning document is revised, its number is live and off the ladder. That is stated
   rather than hidden: this spec sets the ladder, and the screens move to it in the specs that own
   them.

4. The ladder's numbers exist in **three** files: `packages/ds/src/base.css` as media-query
   literals, `packages/ds/src/breakpoints.ts` as a constant JavaScript can read, and
   `packages/ds/src/tokens/spacing.css` where `--layout-breakpoint-desktop: 1200px` already names
   the `xl` rung. **CSS cannot read a JavaScript constant**, so at least two of the three are
   structural rather than careless. All three are defended by requirement 5.

5. `npm run ds:check` fails when the three disagree — every media-query number in `base.css`, the
   constant in `breakpoints.ts`, and the token's value. A drifted ladder is a bug, not a matter of
   style, and neither `tsc` nor a screenshot catches it.

   **This spec also repairs the gate itself.** CLAUDE.md states, under *Design system*, that
   "`npm run ds:check` fails on a deep import", and `specs/design-system/README.md` repeats it. The
   script does not: `scripts/ds-adherence.js` holds exactly one `process.exit(1)`, at `:231`,
   inside the malformed-substitution branch at `:229`, and a deep import is reported to stderr at
   `:225-227` with the run still exiting 0. So a deep import passes the gate today while two
   documents say it cannot.

   The documents win and the script is corrected: **deep imports, malformed substitutions and
   ladder drift all exit non-zero.** All three are bugs rather than style, which is the line the
   script's own comment already draws for the token count it deliberately does not gate on. There
   are zero deep imports in the tree today
   (`node scripts/ds-adherence.js` → `0 values outside the token vocabulary, 68 exempted`, exit 0),
   so this cannot break a build that passes now. The token-adherence count stays advisory,
   unchanged.

6. `--layout-breakpoint-desktop` keeps its value and its name, and **no further breakpoint is
   added as a CSS custom property**. A custom property cannot appear in a media query, so a second
   one would be a token that lies about being usable. The one that exists is documentation with a
   drift check on it, which is why requirement 5 covers it rather than exempting it.

### §02 The stamp

7. The root layout writes, on `<html>` and **before first paint**, three attributes:
   `data-bp` (one of the six rung names), `data-pointer` (`fine` or `coarse`) and `data-motion`
   (`full` or `reduced`).

8. The stamp is a synchronous inline `<script>`, **the first child of `<body>`**. It must not be
   deferred, and it must not be a React effect: an effect runs after paint, which is what produces
   the wrong first frame this requirement exists to remove. The application's
   Content-Security-Policy permits it — `script-src` carries `'unsafe-inline'` with no nonce and no
   `strict-dynamic` (`apps/web/next.config.mjs:121-129`) — and that policy applies only to
   `/sign/:path*`, where the stamp is equally welcome.

   **Not `<head>`, and that is measured rather than preferred.** A `<head>` element rendered by an
   App Router root layout is discarded by Next along with its children: the script appeared nowhere
   in the served HTML and none of the three attributes was ever set. The body's first child runs
   during parsing, while `document.documentElement` already exists and before any content has
   painted, which is what this requirement actually asks for.

   **It reads the ladder from `@devscribed/ds/breakpoints`, a third published entry point**, not
   from the package root. The root carries `'use client'`, so a server component importing through
   it receives a client-reference stub rather than the values — the layout threw
   `RUNGS is not iterable` and every page 500'd. The ladder is data, not a component, so it gets an
   entry of its own rather than a deep import, and `scripts/ds-adherence.js` carries it in a named
   allow-list beside `styles.css`. This is the only new entry point, and requirement 5's drift
   check is what keeps it honest.

9. `data-pointer` is `fine` when `(hover: hover) and (pointer: fine)` matches, and `coarse`
   otherwise. CSS spells the coarse branch `@media (hover: none), (pointer: coarse)`. **The two
   spellings are equivalent by De Morgan's law**, not by coincidence, and TC-DS01-UNIT-03 tests that
   they stay so. One axis rather than two, because all three pointer rules below need the same
   split: hover is for a pointer that can hover, a 44px target is for one that cannot, and drag is
   for one that is precise.

10. All three attributes update when their media query changes — on resize, on a pointer change,
    and on a reduced-motion change. The listeners are installed by the same inline script.

11. `useMediaQuery` moves from `apps/web/src/hiring/useMediaQuery.ts` into the design system and is
    exported from the package root. It **seeds itself from the stamp** rather than from `false`.
    Its current contract — "it starts `false` and settles after mount, so every caller must treat
    the wide layout as the default" — is what makes a phone's first client render draw the desktop
    board with every card draggable, and requirement 11 is what retires it.

12. The design system exports `useBreakpoint()`, `usePointer()`, `useHoverable()` and `useMotion()`
    beside it. Each reads the stamped attribute and subscribes to its change. **A component may not
    call `matchMedia` directly**; `BoardCard`'s own reduced-motion reader
    (`packages/ds/src/components/data/BoardCard.tsx:51-64`) is replaced by `useMotion()` and is the
    reason `data-motion` is stamped at all rather than a fourth reader being added later.

    **The fallback, and the only degradation path this spec has.** A hook that finds no stamped
    attribute — the script stripped, blocked, or failed — reads `matchMedia` itself on mount and
    subscribes there instead. That is today's behaviour, so the failure mode is the one that ships
    now: the wide form for one frame, then correct. The prohibition above is on a *component*
    reaching for `matchMedia`; inside the hook it is the floor, and there is exactly one
    implementation of it for all five hooks to share. Nothing throws, and no rule in this spec is
    lost — every CSS rule here is a media query the browser evaluates whether or not any script
    ran.

### §03 The shell below `xl`

13. Below `xl` the rail leaves the flow and becomes a drawer **against the left edge**, entering
    from the left. It is 340px wide, `max-width: 100%`, hangs from the navbar's current height, and
    slides with `transform: translateX(-105%)` → `translateX(0)`.

    > ~~"hangs from the navbar's current height"~~
    > **Corrected by the design review of 2026-09-07**, recorded here because this requirement is
    > where the number lives. The drawer starts at **`top: 0`** and covers the navbar.
    >
    > Hanging from the bar was the geometry `MenuDrawer` already had (§51), taken for the rail
    > because both are panels. They are not the same panel. `MenuDrawer` opens *beside* a screen
    > that stays live behind it; the rail **replaces** the screen — every route in it leaves the
    > page you are on — and a navigation panel that stops 60px short of the top leaves the bar of
    > the screen it is replacing standing above it, reading as the frame around a drawer that is
    > not inside that frame. Nothing else moves: 340px, `-105%`, `--shadow-drawer-left` and the
    > 0.3s are unchanged, and `bottom: 0` now gives the panel the whole height rather than the
    > height minus a bar.
    >
    > `MenuDrawer` is **not** amended with it. It keeps `--layout-navbar-height-*`, because the
    > reason above is the reason: a filter panel beside a list the reader is still looking at
    > wants the app's own bar in view.

14. The drawer enters from the left **because the hamburger that opens it is on the left**
    (`packages/ds/src/components/appLayout/Navbar.tsx:54-59`, `marginRight` on the button, first
    child of the bar). A panel that opens from the opposite edge to its control makes the reader's
    eye cross the screen to find what they just asked for.

15. `-105%` rather than `-100%`, so the panel's own shadow is off-screen too while it is closed.

16. The drawer's shadow is `--shadow-drawer` **mirrored**: it falls to the right, away from the
    left edge it hangs on. `--shadow-drawer` itself is unchanged and stays with `MenuDrawer`, which
    is still a right-edge panel.

    **One token is introduced: `--shadow-drawer-left`**, in
    `packages/ds/src/tokens/effects.css` beside `--shadow-drawer: -4px 4px 16px rgb(0 0 0 / 10%)`
    (`:14`), carrying the same blur and the same alpha with the offset mirrored. Two tokens rather
    than one because the two panels hang on opposite edges and a single shadow would fall under one
    of them; they are named for the edge their panel hangs on, and the token file carries that
    reason on the line. This is the only token this spec adds — requirement 25 refuses the other
    one it was tempted by.

17. The scrim is **painted** `--color-overlay-scrim` (`packages/ds/src/tokens/colors.css:40`, 60%
    black). Today it is a transparent click target
    (`packages/ds/src/base.css` `.ds-app-shell-scrim`), which is why a reader on a phone gets no
    signal that the page behind the drawer is inert.

    > **Extended by the design review of 2026-09-07.** While the drawer is open the page behind it
    > **does not scroll**.
    >
    > "Inert" is what the wash claims, and a page that still answers the wheel and the thumb is
    > not inert — it is a second scroller under the same finger as the drawer's own. The rule
    > lives in `base.css` inside the `max-width: 1199px` block, off `data-menu-open` on the shell
    > root, for the reason requirement 21 gives about the scrim: above `xl` the rail is in the
    > flow, `menuOpen` may still be true, and there is nothing to lock. A media query re-evaluates
    > on resize; a lock taken in an effect does not, and crossing `xl` with the drawer open would
    > leave the well shut on a screen with no drawer — which is edge case 4's own scenario.

18. ~~The scrim hangs from the navbar and does not cover it. Focus returns to the hamburger when the
    drawer closes (requirement 20), and a control focus is handed back to must not be sitting under
    a 60% wash. This matches `.ds-menu-drawer-scrim`, which already hangs from the navbar.~~

    > **Reversed by the design review of 2026-09-07.** The scrim starts at **`top: 0`** and covers
    > the navbar with everything else.
    >
    > The argument above was sound and its premise is now false. It said a control that focus
    > returns to must not sit under the wash — but focus returns *when the drawer closes*, and the
    > scrim is unmounted by the same state change that closes it (`menuOpen`). There is no moment
    > where the hamburger is focused and washed. What the exemption actually bought was a 60px
    > strip of live-looking chrome above an inert page, which is the opposite of what a scrim is
    > for: while the drawer is open the navbar is inert too, and it now says so.
    >
    > The hamburger is under the panel rather than under the wash in any case, once requirement 13
    > puts the panel at `top: 0` — 340px from the left edge, and the hamburger is at 16.
    >
    > `.ds-menu-drawer-scrim` is **not** amended with it, for the same reason `MenuDrawer` keeps
    > its own top: the list behind that panel is still live, and so is the bar above it.

19. The drawer closes on the scrim, on `Escape`, on the sidebar's own close button, and on choosing
    a section. All four already work (`packages/ds/src/components/appLayout/AppShell.tsx:62-73`,
    `apps/web/src/layout/AppShell.tsx:32`) and this spec changes none of them.

    > **Extended by the design review of 2026-09-07.** The close button draws a **close mark**,
    > `CloseIcon` — the glyph every other dismissable overlay in the system already closes with
    > (`Modal`, `ConfirmDialog`, `MenuDrawer`, all three through `.ds-dialog-close`).
    >
    > It draws `MenuIcon` today (`packages/ds/src/components/navigation/Sidebar.tsx`) — the same
    > three bars as the hamburger that opened it. Two controls, opposite jobs, one glyph: the mark
    > that means *open this* is being used to mean *close this*, in the one place where both are on
    > screen within 300ms of each other. Its accessible name has always said `Close sidebar`; only
    > the drawing disagreed, which is why nothing about the name, the test route or requirement 21
    > moves.

20. Focus moves into the drawer when it opens and returns to the hamburger when it closes. Already
    true; stated here because requirement 18 depends on it.

21. At `xl` and above the hamburger and the scrim are **not visible** and the rail is in the flow.
    Not visible, not absent from the document: both are hidden by a media query in `base.css`, the
    same way `.ds-navbar-menu` is `display: none` above the breakpoint today
    (`packages/ds/src/base.css:102`). A React condition on the rung would read better in a DOM
    dump and would put the switch back into JavaScript, which [§14](decisions.md)'s "width alone
    decides it" exists to prevent — the server and the hydrated client must agree at every size.
    The scrim keeps being rendered on `menuOpen` alone
    (`packages/ds/src/components/appLayout/AppShell.tsx:83`); above `xl` it paints nothing and
    catches no click.

### §04 The well and the navbar

22. The content well's padding is **16px below `md` and 25px at `md` and above**. It is
    `var(--space-9)` at every width today, set inline
    (`packages/ds/src/components/appLayout/AppShell.tsx`), so the value moves to a class — a media
    query cannot be an inline style, which is why `.page-title` and `.ds-navbar` are already
    classes.

23. The navbar's horizontal padding steps with it, 16 → 25 at `md`. Measured today as 25px at
    every width down to 360.

24. 16px rather than the 12px this pattern came from, because 16 is already the padding inside a
    list card and inside a public page's panel: the margin to the screen edge and the margin inside
    a block then read as one measurement instead of two.

25. The two values are `var(--space-6)` and `var(--space-9)` directly. **No `--layout-well-padding`
    token is introduced**: both steps already exist on the spacing scale, they are consumed in one
    file, and a token whose value is another token adds a name without adding a reader.

    > **Added by the design review of 2026-09-07.** The well's scroller is
    > **`overflow-x: hidden`**. It scrolls vertically, and only vertically.
    >
    > It has always been `overflow-y: auto` with nothing said about the other axis, and CSS
    > resolves that for you: an `overflow` of `visible` beside an `auto` computes to `auto`, so the
    > frame has been a horizontal scroller nobody chose. What that costs is not a stray scrollbar —
    > it is that anything wider than the well drags **the page header and the toolbar** sideways
    > with the content, so the reader loses the controls while chasing the row.
    >
    > It was reported on the candidates screen and the mechanism is the closed `MenuDrawer`: at
    > rest the panel is `translateX(105%)`, which parks a 340px box **357px past the right edge**
    > of that scroller with nothing clipping it. `position: fixed` normally keeps it out of the
    > scroller's overflow — until any ancestor gains a `transform`, `filter`, `contain` or
    > `will-change` and becomes its containing block, which browsers also do on their own for
    > fixed descendants of a scrolling ancestor. Measured: give the scroller `translateZ(0)` and
    > its `scrollWidth` goes 768 → **1125**, the overhang exactly.
    >
    > Hiding the axis is the fix rather than moving the panel, because the panel is not the only
    > way in — a wide table, a long unbroken string, or the next overlay parked off-screen all
    > reach the same place. **Nothing pays for it today:** swept at 360, 768 and 1440 across all
    > 19 shell routes, no screen's well scrolls sideways, and the one thing on the product that is
    > legitimately wider than its box — the board's five columns — already carries its own
    > `.board-scroll` (`globals.css`) for exactly this reason. A fixed descendant is not clipped by
    > it either: the drawer, every `Modal`, and `Popover`'s portalled menu hang from the viewport,
    > outside the well's containing block.
    >
    > Acceptance criterion 16 and TC-DS01-E2E-11 measure `document.documentElement` and would not
    > have caught this — the document never scrolled; the well inside it did. Both now read the
    > well too.

    > **Added by the same review.** The scroller is **`position: relative`** — the page's own
    > coordinate space.
    >
    > Reported as *two scrollbars side by side* on the candidate card, and that is exactly what it
    > was: the well's, and the **document's**. Left `static`, the scroller is not a containing
    > block, so a box a screen positions `absolute` resolves against the initial containing block
    > instead — it is not clipped by the overflow, it is not carried by the scroll, and it
    > stretches the document down to its own static position. Measured at 485 × 1213: the document
    > wanted **1293px** for a **1px** box.
    >
    > That box is `card-conclusion-announcer`, the candidate card's visually-hidden live region —
    > `position: absolute`, 1px, `clip` — and **eighteen files carry that pattern**. On any page
    > long enough to scroll, one of them lands below the fold, which is why the card showed it and
    > a short screen did not. Fixing them one at a time is the same defect eighteen times and does
    > nothing for the nineteenth; a containing block here answers all of them.
    >
    > `fixed` descendants are untouched, which is what the nav drawer, `Modal`, `Popover`'s portal
    > and `Select`'s list all depend on: they hang from the viewport, not from this box.

### §05 The page title

26. **Every screen inside the shell keeps its `<h1>` at every width.** The page title is not moved
    into the shell and is not hidden at any rung.

27. This departs from the source design, which draws the title only below `xl` on the grounds that
    a visible rail already says where you are. That reasoning holds for a prototype whose screens
    carry no heading of their own. It does not hold here: eighteen screens render `PageHeader`
    (`apps/web/src/layout/PageHeader.tsx:36`) and five render `PageTitle` directly, so hiding the
    title at `xl` would leave those screens' `<h2>` card captions with no heading above them —
    breaking the outline `Card`'s `titleAs` default was introduced to preserve
    ([§27](decisions.md)).

28. `.page-title`'s type ladder loses its smallest step. It becomes 20/30 at weight 450 below `xl`,
    and 24/36 at weight 450 from `xl`. The 16/24 step at weight 500 is removed: on a phone the
    title is the only indicator of place, and 16px is too small to carry that alone.

29. The `768px` step in `.page-title` disappears with it, because 20/30 is now the base rather than
    something 768 steps up to. Two steps replace three, and `packages/ds/src/base.css:30-32` shrinks
    by one line.

### §06 Pointer — hover

30. **A design-system control reports hover only to a fine pointer.** Every hover state in
    `packages/ds` is React state driven by `onMouseEnter` / `onMouseLeave`, so on a touch device it
    is set by a tap and stays set until something else is tapped. Twenty-one components are
    affected; all of them are listed in requirement 31 because an unqualified "every" has to be
    checked against the call sites it governs.

31. The twenty-one, each gated on `useHoverable()`:

    `AccountMenu`, `BackTo`, `BoardCard`, `Button`, `Calendar`, `Chip`, `ConfirmDialog`,
    `DateRangePicker`, `FileInput`, `IconButton`, `Modal`, `NavigationCard`, `Popover`,
    `ReportGroupBody`, `SearchInput`, `Select`, `Sidebar`, `Table`, `Toast`, `Tooltip`, `Tracker`.

    `DateRangePicker` and `NavigationCard` have no hiring surface at all. They are fixed anyway, so
    the rule needs no exception list — an exception list is a thing the next component gets added
    to by mistake.

32. Three of the twenty-one mutate the DOM in the handler rather than holding state — `Table`'s
    row (`packages/ds/src/components/data/Table.tsx:151-152`), `Popover`'s menu row
    (`Popover.tsx:259-268`) and `AccountMenu`'s row (`AccountMenu.tsx:83-84`). They are gated the
    same way, at the top of the handler.

33. The `min-width: 1024px` clause the source rule carries is **dropped**. Hover is a question about
    the pointer, not about the window: a mouse in a 900px window still hovers, and the width test
    would take that away for no reason a reader could see.

34. `Card` and `MiniTracker` state in their own source that they deliberately have no hover state
    (`Card.tsx:35-36`, `MiniTracker.tsx:16-17`). They are unaffected and stay that way.

35. Three `:hover` rules in the codebase are CSS rather than React state and therefore never latch.
    All three are out of scope, and all three are named here so a reader does not go looking for a
    twenty-second component.

    | Rule | Where | Why it is left alone |
    |---|---|---|
    | `.card-cv-file:hover` | `apps/web/app/globals.css:291` | CSS, so it is released the moment the finger leaves |
    | `.vacancy-screen-link-button:hover` | `apps/web/app/globals.css:508` | the same |
    | `a:hover { color: var(--text-link) }` | `packages/ds/src/base.css:24` | **it is a no-op.** The line above it (`:23`) sets `a { color: var(--text-link) }`, the identical value; the hover rule exists only to stop a browser default from repainting a visited or hovered link. There is no state to latch and nothing to gate, and deleting it would hand the colour back to the browser. |

    The third is inside `packages/ds`, so requirement 30's "every hover state in `packages/ds` is
    React state" is qualified by this row rather than being merely approximate.

### §07 Pointer — target size

36. Under a coarse pointer, every one of these measures **at least 44 × 44**, at every width:

    | Control | Today | Where |
    |---|---|---|
    | `IconButton` | 34 × 34 | `packages/ds/src/components/core/IconButton.tsx:29` |
    | `Popover`'s kebab trigger | 32 × 32 | `packages/ds/src/components/overlays/Popover.tsx:350` |
    | `Popover`'s menu item | 167 × 37 measured | `Popover.tsx:252`, padding only, no height |
    | The navbar hamburger | 18 × 13 measured | `packages/ds/src/components/appLayout/Navbar.tsx:54-59` |
    | The row `IconButton`s on criteria rows | 24 × 24 | `CriteriaFilterRow.tsx:200`, `CriteriaSection.tsx:260` |
    | The sidebar's `Close sidebar` button | 18 × 13 — the same unsized `MenuIcon` as the hamburger | `packages/ds/src/components/navigation/Sidebar.tsx:253` |
    | `Modal`'s close × | 13 × 13 | `packages/ds/src/components/overlays/Modal.tsx:62` |
    | `MenuDrawer`'s close × | 13 × 13 | `packages/ds/src/components/overlays/MenuDrawer.tsx:99` |
    | `ConfirmDialog`'s close × | 13 × 13, across 25 call sites | `packages/ds/src/components/overlays/ConfirmDialog.tsx:89` |

    The last four are in the table because this spec asks a phone reader to press every one of
    them: requirement 19 and acceptance criterion 1 have them closing the drawer, and requirements
    49–54 turn all three overlays into sheets a reader has to be able to dismiss at 360. A 13px
    square is not a control at arm's length, and a rule about touch targets that omits the button
    that closes the sheet it just specified is a rule that was written from the desktop.

37. **Nothing changes under a fine pointer.** `IconButton` stays 34, the kebab stays 32, and every
    E2E case that measures one keeps its number, because the suite runs at 1280 with a mouse
    (`e2e/playwright.config.ts:76`).

38. The rule is CSS — `@media (hover: none), (pointer: coarse)` — not JavaScript, so it needs no
    hydration and cannot draw the small form first. `IconButton` sets its size inline from a `size`
    prop, so it grows a class the rule can reach; the inline value stays as the fine-pointer size.

39. 44 is `--control-height` (`packages/ds/src/tokens/spacing.css:24`), which is the height of every
    **field-shaped** control in the system — `Button`, `TextInput`, `TextArea`, `Select`,
    `SearchInput`, `FileInput`, `DateRangePicker` — and already the height of a `Calendar` day cell
    for exactly this reason (`base.css` `.ds-calendar-day`). It is **not** the height of every
    drawn control: six are shorter, and the rest of this requirement says what happens to them.

    > ~~"and already the height of a `Calendar` day cell" — cited as a control this rule already
    > covers.~~
    > **Half of it. Corrected by [02 design §Responsive](../hiring/02-booking-page.design.md#responsive).**
    > A day cell is 44 **tall**; its width is `1fr`, so it is whatever the consumer's box leaves
    > after the grid's inset and six gutters. On the public booking page at 360 that was **35.9**,
    > and this requirement's own closing sentence — "every pressable design-system control is at
    > least 44 × 44 to a coarse pointer" — did not hold for it. A gate written for controls with a
    > drawn box does not reach a control whose width is a share of something else's box, and the
    > table above lists nine such boxes and none of these.
    >
    > The fix is in `base.css` beside `.ds-calendar-day`: below `sm` the grid takes back its
    > 12.8px inset and its 31.9px of gutter. It is the one place this requirement is keyed to the
    > **viewport** rather than to the pointer, against 37 — a `1fr` cell has no drawn width to
    > protect, so at 360 the only question is whether the seven columns get the width or the
    > gutters do, and the answer does not depend on what is pointing at them. One drawing, not two.
    >
    > Blast radius: `DateRangePicker` is the product's only other `Calendar`, in a 280px panel. Its
    > cell goes **33.6 → 40** below `sm` and its panel's box does not move (448 × 407.3 at every
    > width). Still short of 44, and still short for the same reason — the panel is 280px because
    > it is a popover, not a page. Recorded under Known Gaps; the reports specs own it.

    Six pressable controls are drawn below 44 today, and their *paint* is not raised, because in
    each the box **is** the design rather than a container around it. Under a coarse pointer each
    gets a transparent 44 × 44 hit area instead — a `::after` overlay centred on the control, which
    changes no pixel and moves no layout.

    | Control | Drawn | Where |
    |---|---|---|
    | `Switch` | 42 × 24 track | `packages/ds/src/components/forms/Switch.tsx:86` |
    | `ToggleButton` | 32 track, 36 active segment | `ToggleButton.tsx:166`, `:81` |
    | `Pagination` | 36 | `Pagination.tsx:75` |
    | `MiniTracker` | 144 × 30 pill | `MiniTracker.tsx:32` |
    | `SearchInput`'s clear | 20 × 20 | `SearchInput.tsx:89` |
    | `Tracker`'s close | 13 × 13 | `Tracker.tsx:52` |

    An overlay rather than a `min-height`, because raising `Switch`'s track to 44 would redraw the
    switch. This is what closes the rule: **every pressable design-system control is at least
    44 × 44 to a coarse pointer**, nine of them by growing and six by reaching further than they
    paint. A rule that stopped at nine would have been a rule about the controls that were easy.

### §08 Pointer — drag

40. **`BoardCard`** — the design system's card, `packages/ds/src/components/data/BoardCard.tsx` — is
    draggable when the pointer is fine, at every width, and is not draggable when the pointer is
    coarse, at every width. The grab cursor follows the same test.

    **This is a rule about `BoardCard`, not about every card on every board.** The projects kanban
    draws its own `TaskCard` (`apps/web/app/org/[orgId]/projects/[projectId]/board/BoardScreen.tsx`,
    whose own comment at `:79` says "the card is **not** `BoardCard` (§42)"), and it is untouched
    here. The reason is technical rather than territorial: `BoardCard` drags with the **native
    HTML5** `draggable` attribute, which does not work on a touch screen at all, so refusing it
    under a coarse pointer takes nothing away. `TaskCard` drags with `@dnd-kit`'s `PointerSensor`
    (`BoardScreen.tsx:240`), which is built on Pointer Events and **does** work on touch. Applying
    the same refusal there would remove a working interaction and leave a touch user with no way to
    move a task.

41. This replaces a width test: `draggable={!narrow}` where `narrow` is `(max-width: 767px)`
    (`apps/web/app/org/[orgId]/hiring/vacancies/[vacancyId]/VacancyBoard.tsx:24`, `:360`). The width
    test is wrong in both directions — a touch tablet at 900px is handed a drag that does not work,
    and a mouse at 700px is refused one that would.

42. It also closes a first-paint defect. `useMediaQuery` starts `false`, so on a phone every card
    renders `draggable={true}` and only becomes `false` after the mount effect settles. Seeding
    from the stamp (requirement 11) means the first frame is already right.

43. **Keyboard drag is untouched at every width and under every pointer.** It lives in the caller
    (`VacancyBoard.tsx` `onCardKeyDown`, `useBoardDrag`) and is reached by `Space`, which no
    pointer rule can take away.

44. The five-columns-to-tab-strip switch stays a **width** test at `md`. What changes there is how
    much room there is, not what the reader is pointing with.

### §09 A tooltip is never the only carrier

45. A `Tooltip`'s content may never be the only carrier of its information. It must also be
    **one of three**: the trigger's accessible name, visible text beside it, or an always-present
    visually-hidden copy that `aria-describedby` resolves to whether or not the bubble is open.
    The third is what `Popover` provides today (`Popover.tsx:74-80`, `:287-291`), and it is named
    here so a future call site has a test to meet rather than a precedent to guess at. It serves a
    screen reader and not a sighted touch user, which is why requirement 48 adds the second on top
    of it under a coarse pointer.

46. `Tooltip` opens on hover and on focus (`Tooltip.tsx:81-84`), and requirement 30 removes the
    hover half on touch. A reader on a phone therefore has neither, which is what makes this rule
    load-bearing rather than tidy.

47. The rule already holds everywhere it applies today. `Tooltip` has exactly one call site in the
    repository — inside `Popover` (`Popover.tsx:299`) — and `Popover` already renders an
    always-present visually-hidden copy of the reason and points the row's `aria-describedby` at
    that copy rather than at the bubble (`Popover.tsx:74-80`, `:287-291`, `:303`). No code changes
    for this requirement; it is written down so the next `Tooltip` call site cannot quietly break
    it, and requirement 48 is what makes it visible to a sighted touch user.

48. Under a coarse pointer, a blocked `Popover` item renders its reason as **visible text** beneath
    its label, inside the item. The hidden copy is what a screen reader gets and the bubble is what
    a pointer or a focus ring brings up; on a phone there is neither, and today the reason is
    unreachable. The two items this reaches are `Copy booking link` on a closed vacancy and
    `Delete` on a vacancy that has applications
    (`apps/web/app/org/[orgId]/hiring/vacancies/page.tsx:243-252`, `:290-300`), plus the three
    single blocked items on the vacancy detail, the criteria library and the members list.

### §10 Overlay panels below `sm`

49. Below `sm` an overlay **panel** is a sheet: full width, rounded at the top only, at most 92% of
    the viewport height, the body scrolling inside it, and its actions a sticky footer whose
    controls take equal widths. Two is the common case and reads as two halves; one and three are
    edge cases 10a and 10b.

    **The footer sits above `env(safe-area-inset-bottom)`**, with that inset as bottom padding.
    Four documents in user-management refuse bottom sheets and sticky bottom bars outright, and
    they give a reason worth answering rather than overruling: on a phone the browser's own URL bar
    and the system gesture area occupy the bottom edge, so a bar pinned to it collides with them.
    That is true of a bar pinned to the *page*. It is answered for a panel by the inset the
    platform publishes for exactly this purpose — the footer stops where the reachable area stops.
    The seven statements are amended rather than carved out, because two overlay systems in one
    design system would make a screen's form depend on which spec it belongs to rather than on what
    the overlay means, which is what requirement 56 exists to prevent.

50. `packages/ds/src/components/overlays/` holds exactly four components, and each is classified
    here, because "an overlay panel" with one of the four unnamed is a sentence two implementations
    satisfy.

    | Component | Panel? | Reason |
    |---|---|---|
    | `Modal` | **yes** — sheet below `sm` | a dialog |
    | `MenuDrawer` | **yes** — sheet below `sm` | a panel beside live content, which stops being beside anything at 360 |
    | `ConfirmDialog` | **yes** — sheet below `sm` | a confirmation is unambiguously a dialog, and requirement 56 says a screen picks its overlay by meaning. It draws its own shell rather than composing `Modal` (`ConfirmDialog.tsx:81-82`: `width: '100%', maxWidth: 600`), so the change is smaller than its 25 call sites suggest — at 360 it is already full width, and what it gains is the top-only radius, the 92% cap and the sticky footer |
    | `Popover` | **no** — anchored at every width | its menu is anchored to its trigger, and a menu that leaves its button is a menu that has lost what it belongs to |

    `ConfirmDialog` is **not** rewritten to compose `Modal` here. That is the right end state and it
    is a change to 25 call sites that has nothing to do with a phone; it is named in Out of Scope so
    the duplication is a known debt rather than an oversight.

51. All three panels gain an `actions` slot, which is what becomes the sticky footer in the sheet
    form. **The sheet is the form the component takes below `sm`, not a prop a caller passes** —
    requirement 56 forbids a screen branching on width, so there is nothing for a caller to set and
    no default to override. `variant="sheet"` is the name of the form in prose; it is the
    component's own state, decided inside `Modal`, `ConfirmDialog` and `MenuDrawer`.

    Without an `actions` slot a sheet has no footer and the body scrolls to its end. Callers set
    width by hand today through `style` (`VacancyDialog.tsx:253`, `:403`,
    `hiring/settings/page.tsx:595`) and keep doing so — the sheet form ignores an inline width,
    because at `xs` there is only one width to be.

    **Four callers move their actions into the slot**, because a sheet whose actions scroll away is
    the defect the sticky footer exists to fix, and a slot nothing fills is a slot nobody
    implements:

    | Caller | What moves |
    |---|---|
    | `VacancyDialog.tsx:382` | its `<FormActions align="full">` — the dialog TC-DS01-E2E-09 measures |
    | `hiring/settings/page.tsx:619` | the category dialog's `<FormActions align="full">` (`:595` is its inline width, cited above) |
    | `apps/web/src/hiring/CriterionDialog.tsx:292` | the criterion dialog's `<FormActions align="full">` (`:214` is its inline width) |
    | `candidates/page.tsx:941` and `:946` | `candidates-filters-apply` and `candidates-clear-filters`, today rendered inside the `MenuDrawer`'s `children` — this is the caller that makes acceptance criterion 12's "actions pinned" true for `MenuDrawer` as well |

    `ConfirmDialog` needs no caller change — it already owns its two buttons. Every other `Modal`
    caller keeps its actions inline and gets edge case 10's behaviour, which is correct rather than
    pending: a dialog whose actions belong with the text they follow should scroll with it.

    > **Corrected by the design review of 2026-09-07 — `MenuDrawer` only, and above `sm` only.**
    > The slot has to carry the panel's own padding, `0 var(--space-10) var(--space-9)`, matching
    > the body it now sits beneath.
    >
    > "Above `sm` it is the last block in the panel, where they already were" is what this
    > requirement promised, and for two of the three panels it is what happened: `Modal` and
    > `ConfirmDialog` pad the panel itself, so a block moved from `children` into the slot stays
    > inside that padding. `MenuDrawer` does not — it sets `padding: 0` and pushes the padding down
    > to `.ds-sheet-head` and `.ds-sheet-body`, so the slot alone was left outside it, and
    > `candidates-filters-apply` landed flush against the panel's left edge, its right edge and the
    > bottom of the screen while every field above it stayed inset by 20px.
    >
    > `.ds-sheet-actions`'s own `var(--space-6)` below `sm` is unchanged and still wins there, by
    > source order at equal specificity — which is why the padding is a class on the panel's own
    > `.ds-menu-drawer-actions` rather than an inline style, where it would have beaten the sheet.

52. **Above `sm`, `Modal`'s geometry does not change**: `maxWidth: 70%`, `minWidth: 360`,
    `maxHeight: 98%`, centred (`Modal.tsx:49-55`). No size ladder, and no `size` prop. Adding one
    would move every modal in six sections this spec otherwise never touches, and would put width
    back into each caller's hands, which is what a single cap exists to prevent.

53. The sheet form fixes a live defect at `xs`. `minWidth: 360` beats `maxWidth: 70%` on any
    viewport under about 514px, so on a 375px phone the panel is 360px wide before its 24px of
    padding and overflows the screen. A full-width sheet has no floor to lose to.

54. `MenuDrawer` takes the same sheet form below `sm` and **traps focus in it**. Its current rule is
    deliberately not to trap (`MenuDrawer.tsx:31-33`), on the grounds that it is a panel beside live
    content a reader may Tab out of. At 92% of a 360px screen there is no live content behind it, so
    the reason for the exception is gone at that width and only at that width.

    > **Extended by the design review of 2026-09-07.** The sheet also **stops the screen behind
    > it scrolling**, at the same width and by the same argument.
    >
    > The requirement above took the trap and left the scroll, and the two are the same claim: a
    > panel that holds focus, says `aria-modal` and covers 92% of the screen is telling the reader
    > there is nothing behind it to work in, while the thing behind it goes on answering the
    > thumb. On the candidates screen that is what a phone actually shows — **two scrollers under
    > one finger**, the panel's own body and the list it is covering.
    >
    > `.ds-app-shell-scroller:has(.ds-menu-drawer[data-open])` in `base.css`, inside the `sm`
    > block. A media query rather than a lock taken in an effect, so it releases itself: dragged
    > past `sm` the panel stops being a sheet and the page behind it scrolls again, with nothing
    > having to run. `scrollbar-gutter: stable` on the scroller is what keeps the content from
    > jumping by a scrollbar's width as the lock goes on and off, where scrollbars take room.
    >
    > `Modal` and `ConfirmDialog` are `aria-modal` at **every** width and have the same gap. They
    > are deliberately not changed here: this requirement is about the form a panel takes below
    > `sm`, and a rule for dialogs at every width is a decision of its own.

55. Above `sm`, `MenuDrawer` keeps its right-edge drawer form and keeps **not** trapping focus.
    Its one caller passes `role="dialog"` without `aria-modal`
    (`apps/web/app/org/[orgId]/hiring/candidates/page.tsx:785-792`), which is correct for an
    untrapped panel and becomes wrong in the sheet form; the sheet form therefore sets
    `aria-modal="true"` itself.

56. A screen chooses its overlay by **meaning** — a dialog, or a panel beside live content — and
    never by width. The width switch lives inside both components, so no screen may branch on it.

### §11 `PageTabs` is one line

57. `PageTabs` is a single line at every width. It scrolls inside itself when it overflows and the
    page body never scrolls with it. Today it is `flexWrap: 'wrap'`
    (`packages/ds/src/components/navigation/PageTabs.tsx:128`).

58. The active tab is scrolled into view on mount, so a screen whose chosen tab is off-screen does
    not open looking empty.

59. **No edge affordance is drawn.** A tab clipped mid-label at the strip's edge is itself the
    signal that there is more, and a gradient mask over the last tab would obscure the one thing
    that says so.

60. This reverses the current behaviour and it is deliberate: a wrapped fifth tab takes 36px of
    height from whatever is under it, and under the board that is the columns. It changes **nine
    call sites**, at the widths where they currently wrap — six that render `PageTabs` directly and
    three that reach it through `TableToolbar` (`packages/ds/src/components/data/TableToolbar.tsx:54`,
    which forwards any `tabs` prop straight into it):

    | Call site | Tabs | Via |
    |---|---|---|
    | `hiring/vacancies/[vacancyId]/VacancyBoard.tsx:392` | 5 | direct |
    | `members/[memberId]/MemberDetailScreen.tsx:259` | 5 or 6 | direct |
    | `documents/[envelopeId]/page.tsx:320` | 2 or 3 | direct |
    | `documents/templates/[templateId]/page.tsx:618` | 3 | direct |
    | `settings/holidays/page.tsx:281` | 3 | direct |
    | `src/documents/SignaturePad.tsx:136` | 2 | direct |
    | `hiring/candidates/page.tsx:740` | 2 | `TableToolbar` |
    | `hiring/settings/page.tsx:359` | 2 | `TableToolbar` |
    | `hiring/vacancies/page.tsx:319` | 3 | `TableToolbar` |

    Five of the nine are outside hiring, and the signing page is outside `AppShell` entirely.

61. Nothing else about `PageTabs` changes. It is already a real `tablist` with `aria-selected`,
    `aria-controls`, one tab stop, arrow keys that step over disabled tabs, and a keyboard-only
    focus ring ([§45](decisions.md), [§58](decisions.md), [§68](decisions.md),
    [§94](decisions.md)).

## Data Model

**None.** This spec adds no table, no column, no enum and no migration. It is CSS, three
attributes on `<html>`, and five hooks — all five exported from the package root
(`packages/ds/src/index.ts`), because a hook a product screen cannot import is a hook the product
re-implements:

| Hook | What it answers | First caller |
|---|---|---|
| `useMediaQuery(query)` | any query, seeded from the stamp where it can be | `VacancyBoard`, the candidates list |
| `useBreakpoint()` | which of the six rungs | screens that switch structure |
| `usePointer()` | `fine` or `coarse` | `VacancyBoard`'s drag guard |
| `useHoverable()` | may this control report hover | the twenty-one |
| `useMotion()` | `full` or `reduced` | `BoardCard`, replacing its own `matchMedia` |

`useMotion` is exported rather than kept internal to `BoardCard` for the reason the other four
are: it is the **only** reader of `prefers-reduced-motion` in the product
today (`BoardCard.tsx:56`, and nothing else), and the export exists so that a second is never
opened. A query with one reader is a query with one reader until somebody needs it twice.

## Screens

### The rail as a drawer, below `xl`

```
closed, 360 wide                        open, 360 wide
┌──────────────────────────┐            ┌──────────────────────────┐
│ ☰  Teammerly      ▦  A ˅ │ 60px       │ ☰  Teammerly      ▦  A ˅ │ 60px  ← navbar not dimmed:
├──────────────────────────┤            ├────────────────────┬─────┤         focus returns to ☰
│                          │            │ Teammerly        ✕ │▒▒▒▒▒│
│  Vacancies               │ ← 16px     │                    │▒▒▒▒▒│
│                          │   well     │  People          ˅ │▒▒▒▒▒│
│  ┌────────────────────┐  │            │    Members         │▒▒▒▒▒│
│  │ Senior React Eng.  │  │            │  Hiring          ˅ │▒▒▒▒▒│
│  └────────────────────┘  │            │    Vacancies       │▒▒▒▒▒│
│                          │            │    Candidates      │▒▒▒▒▒│
└──────────────────────────┘            └────────────────────┴─────┘
                                         ↑ 340px, from the left      ↑ scrim, 60% black
```

### A `Modal` as a sheet, below `sm`

```
       ≥ sm                                    < sm
┌───────────────────────────┐          ┌──────────────────────────┐
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│          │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│
│▒▒┌─────────────────────┐▒▒│          │▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│ ← at most 92%
│▒▒│ New vacancy       ✕ │▒▒│          ╭──────────────────────────╮
│▒▒│                     │▒▒│          │ New vacancy            ✕ │
│▒▒│ Title               │▒▒│          │                          │
│▒▒│ [                 ] │▒▒│          │ Title                    │
│▒▒│                     │▒▒│          │ [                      ] │ ← body scrolls
│▒▒│      [Cancel][Save] │▒▒│          │ ⋮                        │
│▒▒└─────────────────────┘▒▒│          ├──────────────────────────┤
│▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒▒│          │  [ Cancel ][   Save    ] │ ← sticky, two halves
└───────────────────────────┘          ╰──────────────────────────╯
  centred, max 70%, min 360             full width, rounded at the top
```

### `PageTabs` overflowing

```
   today, wrapping                        after, one line scrolling
┌────────────────────────────┐          ┌────────────────────────────┐
│ ABOUT  VACATION  CONTRACT  │          │ ABOUT  VACATION  CONTRAC▸  │
│ PROJECTS  ROLES            │ ← +36px  └────────────────────────────┘
└────────────────────────────┘            the clipped label is the
  the row below moves down                affordance; no gradient
```

## Flows

### Flow: a member opens the navigation on a phone

1. The member is on `/org/{orgId}/members` at 360px. `<html data-bp="xs" data-pointer="coarse">`.
2. The rail is off-screen left at `translateX(-105%)`; no scrim is in the document.
3. They tap the hamburger, which measures at least 44 × 44 under a coarse pointer.
4. `apps/web/src/layout/AppShell.tsx` sets `menuOpen`, the drawer transitions to `translateX(0)`
   over 0.3s, and the scrim mounts painted 60% black from the navbar down.
5. Focus moves to the first focusable node inside the drawer.
6. They choose `Hiring → Vacancies`. The route changes, the effect on `pathname` closes the drawer,
   and focus returns to the hamburger.

### Alt Flow: they dismiss it instead (branches from step 5)

5a. They tap the scrim, or press `Escape`, or use the sidebar's close button. The drawer closes, the
scrim unmounts, focus returns to the hamburger, and the route does not change.

### Alt Flow: the viewport grows past `xl` while the drawer is open (branches from step 5)

5b. The media query stops matching, so the rail returns to the flow and the scrim's rule no longer
applies. `menuOpen` stays `true` in React and has no visible effect, because above `xl` the class
that positions the drawer does not apply. The next navigation clears it. Nothing is drawn twice,
because the drawer *is* the rail rather than a copy of it ([§14](decisions.md)).

### Flow: a member opens the candidate filters on a phone

1. At 360px they press `Filters` on `/org/{orgId}/hiring/candidates`.
2. `MenuDrawer` renders in its sheet form: full width, rounded at the top, capped at 92% height,
   `aria-modal="true"`.
3. Focus is trapped inside it. `Escape` closes it and focus returns to the `Filters` button.
4. At 576 and above the same control renders as the right-edge drawer, untrapped, exactly as today.

### Alt Flow: nothing renders because the stamp did not run (branches from step 1)

1a. If the inline script is stripped or fails, `<html>` carries no `data-*`. Every hook falls back
to its own `matchMedia` read on mount, which is the behaviour that ships today: the first frame is
the wide form and it settles after hydration. Layout is never wrong for longer than one frame, and
nothing throws. This is the only degradation path and requirement 12 covers it.

## Validation Rules

**None.** This spec accepts no user input, so there is nothing to validate and no message to
re-validate on the server. `packages/validation` is untouched.

## Error Messages

**No new text.** Requirement 48 renders five existing messages in a new place, and every one of
them is listed here because a message this spec puts on screen is a message this spec owns the
placement of.

| Context | Message | Export | Route that emits it |
|---|---|---|---|
| `Copy booking link` on a closed vacancy | *(as written in the export)* | `HIRING_MESSAGES.vacancy.closedLinkNote` (`packages/validation/src/hiring.ts:79`) | `hiring/vacancies/page.tsx:250` |
| `Delete` on a vacancy with applications, list | *(as written)* | `HIRING_MESSAGES.vacancy.deleteBlocked` | `hiring/vacancies/page.tsx:298` |
| `Delete` on a vacancy with applications, detail | *(as written)* | `HIRING_MESSAGES.vacancy.deleteBlocked` | `hiring/vacancies/[vacancyId]/page.tsx:392` |
| `Delete` on a criterion with assessments | *(as written)* | `criterionDeleteBlockedMessage(count)` | `hiring/settings/page.tsx:336` |
| `Delete` on the last admin | `Cannot remove the last admin` | **none today — an inline literal** | `members/MemberRowActions.tsx:61` |

**The fifth moves into `packages/validation`.** It is an inline user-facing message, which
CLAUDE.md forbids, and requirement 48 promotes it from a hover bubble a phone reader never sees to
visible text on the screen. It joins `MEMBER_MESSAGES` (`packages/validation/src/index.ts:481`) as
`lastAdminBlocked`, beside the `lastAdminGuard` the server already answers the same refusal with.
The two are deliberately **not** merged: `lastAdminGuard` is what a rejected request says, and this
is what a control says about why it cannot be pressed. Same rule, two audiences, and one string
serving both would end up phrased for neither.

No message text is added or changed. The move is a relocation, and the string is copied verbatim.

## UI Description

| State | Behavior |
|---|---|
| First paint, any width | `<html>` already carries `data-bp`, `data-pointer` and `data-motion`. No component draws the wrong form and then corrects it — the CSS half is a media query the browser resolves on the server's own bytes, and the JavaScript half is behind a client-side fetch (edge cases 8 and 9), so the wide form is never painted at a narrow width. |
| Loading | Unchanged. `Preloader` and every empty state keep standing on the page's own ground ([ADR 0010](../../docs/adr/0010-hiring-page-states-stand-on-the-page-and-alerts-are-toasts.md)). |
| `xl` and above, fine pointer | Byte-identical to today, except `.page-title`'s base step and `PageTabs` no longer wrapping. |
| Below `xl` | Rail is a left drawer over a painted scrim; well and navbar padding 16 below `md`. |
| Below `sm` | `Modal`, `ConfirmDialog` and `MenuDrawer` are sheets; `MenuDrawer` traps focus. |
| Coarse pointer, any width | No hover state latches; every listed control is at least 44 × 44; board cards are not draggable and draw no grab cursor; a blocked menu item shows its reason as text. |
| Fine pointer, any width | Hover behaves as today; board cards drag as today. |
| Reduced motion | `BoardCard` suppresses its transform and transition, as today, now via `useMotion()` rather than its own `matchMedia`. |
| Stamp absent | Every hook falls back to `matchMedia` on mount (requirement 12); one frame of the wide form, then correct. |

## Required data-testid Attributes

The shell's controls are reached by **accessible name**, not by test id — `Open navigation`,
`Close sidebar` — because those names are what a reader navigates by and a test id would not prove
they exist. That rule is already in force
(`specs/user-management/00-app-shell.design.md:197`) and this spec keeps it.

| Id | Where | Added by this spec |
|---|---|---|
| `page-title` | `PageHeader`'s `<h1>` | no — asserted at every width by requirement 26 |
| `app-shell-scrim` | the drawer's scrim | **yes** — a painted scrim has to be assertable as painted |
| `sheet-actions` | the sticky footer of any panel in sheet form — `Modal`, `ConfirmDialog` and `MenuDrawer` all draw it | **yes** |
| `vacancy-close-confirm` | the close-vacancy `ConfirmDialog` | no — exists (`vacancies/page.tsx:554`); TC-DS01-E2E-09 |
| `vacancy-action-close-{id}` | the row menu's `Close` item | no — exists; TC-DS01-E2E-09 |
| `board-tab-{status}` | the board's tab strip | no — exists; TC-DS01-E2E-08 |
| `board-column-{status}` | the board's column panel | no — exists; TC-DS01-E2E-06, -08 |
| `board-card-{applicationId}` | a board card | no — exists; TC-DS01-E2E-06 |
| `vacancy-actions-menu-{id}` | the vacancies row kebab | no — exists |
| `vacancy-row-{id}` | a vacancies table row | no — exists; TC-DS01-E2E-04 |
| `vacancy-action-copy-link-{id}` | the blocked `Copy booking link` item | no — exists; TC-DS01-E2E-05, -07 |
| `vacancy-action-delete-{id}` | the blocked `Delete` item | no — exists; TC-DS01-E2E-07 |
| `vacancy-copy-guard-message-{id}` | the blocked item's reason | no — exists; requirement 48 makes it visible under a coarse pointer |
| `vacancy-delete-guard-message-{id}` | the blocked item's reason | no — exists |
| `vacancy-dialog` | the New vacancy `Modal` | no — exists; TC-DS01-E2E-09 |
| `candidates-filters-open` | the `Filters` button | no — exists (`candidates/page.tsx:773`); TC-DS01-E2E-10 |
| `candidates-filters` | the filters `MenuDrawer` panel | no — exists (`:792`); TC-DS01-E2E-10 |
| `candidates-filters-close` | the panel's close button | no — exists (`:789`); TC-DS01-E2E-10 |
| `member-action-delete` | the members row `Delete` item | no — exists; TC-DS01-E2E-07 |
| `delete-guard-message` | the last-admin reason on the members list | no — exists, and **no E2E case reaches it**: `MembersTable.tsx:117` draws no row menu for the caller's own row, and the last admin in a fresh organization is the caller. Asserted at unit level by TC-DS01-UNIT-07 instead; see Known Gaps |

## DS gaps

| Control the screens need | What the screen does instead today | What closes it |
|---|---|---|
| A hook that reads the current rung before paint | `apps/web/src/hiring/useMediaQuery.ts`, app-local, starts `false` | Requirements 11–12 move it into `packages/ds` and seed it from the stamp |
| `Modal` in a sheet form with an actions slot | Callers set `style={{ width }}` and there is no sheet at all | Requirement 51 |
| `MenuDrawer` in a sheet form, trapping focus | One caller hand-rolls `role="dialog"` without `aria-modal` | Requirements 54–55 |
| `ConfirmDialog` in a sheet form | It draws its own centred shell at every width and composes no other overlay | Requirement 50 classifies it as a panel; requirement 51 gives it the same `variant` and slot |
| A `Table` column that can be dropped at a width | The candidates page builds a different `columns` array from a `useMediaQuery` read | **Not this spec** — `hideBelow` is `specs/hiring/01-vacancies.design.md`'s, and is named here only so a reader does not expect it |
| A one-line scrolling tab strip | `PageTabs` wraps | Requirement 57 |

## Edge Cases

| # | Situation | Behaviour |
|---|---|---|
| 1 | A stylus: `pointer: fine`, `hover: none` | `data-pointer` is `coarse`. Targets grow to 44 and hover is off, which is right; drag is refused, which is a small loss accepted rather than a third axis added. Named in Known Gaps. |
| 2 | A hybrid laptop with both a trackpad and a touchscreen | `(hover: hover) and (pointer: fine)` matches the *primary* pointer, so it reports `fine`. Hover works and drag works; touch targets stay at their fine-pointer size. This is the browser's own answer and this spec does not second-guess it. |
| 3 | The pointer changes mid-session — a mouse plugged into a tablet | The stamp's listener updates `data-pointer`, every hook re-renders, and drag and target sizes follow. No reload. **Observed by TC-DS01-E2E-03 step 5.** |
| 4 | The viewport crosses `xl` while the drawer is open | Covered by Alt Flow 5b: the rail returns to the flow, `menuOpen` becomes inert, nothing is drawn twice. **Observed by TC-DS01-E2E-01 step 6.** |
| 5 | The viewport crosses `sm` while a sheet is open — `Modal` half by TC-DS01-E2E-09 step 2, `MenuDrawer` half by TC-DS01-E2E-10 step 4 | The panel becomes a centred `Modal` or a right-edge drawer in place. `MenuDrawer` stops trapping focus at that moment; focus stays where it is rather than being moved, because moving it would be the more surprising of the two. |
| 6 | JavaScript is disabled | The stamp does not run and no hook mounts. Every CSS rule in this spec still applies, because all of them are media queries. The drawer cannot open — but it could not open before this spec either, since `menuOpen` is React state. **No case, deliberately:** every page in this product is `'use client'` and fetches its own data, so with JavaScript off there is no screen to assert anything about. A case would be measuring a blank document. |
| 7 | A viewport narrower than 360 | Unverified and unpromised. Nothing is asserted below 360 and no rule is claimed for it. |
| 8 | Server render versus first client render | They agree, and the reason is structural rather than lucky. Every screen that switches structure is `'use client'` and renders a `Preloader` until a client-side fetch resolves — the vacancy board returns one at `vacancies/[vacancyId]/page.tsx:238-243`, the candidates list at `candidates/page.tsx:974-981`. So the server's markup is the loading state, never the wide form of a structure-switching component, and the structural form is first drawn on the client with the stamp already set. The CSS half never disagreed, because a media query is evaluated by the browser on both. |
| 9 | A hook runs during SSR — **no case; the observer would be a React hydration warning, and `e2e/tests/fixtures.ts` already fails any test that logs one** (`:51`, `:54`), so the whole suite is the assertion | It does — a React hook cannot be called conditionally, so `useMediaQuery` at `candidates/page.tsx:182` executes on the server. There is no stamp there, so it returns the `xl` rung and the `fine` pointer. **Nothing it decides reaches the server's markup**: `narrow` is read only at `:1087` and `:1125`, inside the table branch that renders after the fetch. The value is stale for as long as nothing looks at it. A screen that wants to switch structure in markup the server *does* emit must not exist, and requirement 12's rule against a component calling `matchMedia` is what keeps it from being written by hand instead. |
| 10 | A `Modal` with no `actions` slot below `sm` — TC-DS01-UNIT-06 | It is a sheet with no sticky footer; the body scrolls to its end. No footer is invented, because a dialog whose actions are inline is a dialog whose actions should scroll with them. |
| 10a | An `actions` slot holding **one** control — TC-DS01-UNIT-06 | The footer is one full-width control. "Two equal halves" describes two; one half of a sticky footer with an empty half beside it is a layout nobody chose. |
| 10b | An `actions` slot holding **three or more** — TC-DS01-UNIT-06 | The footer is an equal-width row of them, wrapping to a second line if they do not fit, and it stays sticky. **No caller reaches this today.** The only three-control `FormActions` in the repository is `apps/web/app/org/[orgId]/settings/holidays/HolidayModal.tsx:395` (a leading Delete beside Cancel and Save), and it is not one of the four callers requirement 51 moves into the slot. The rule is written for the next one rather than for an existing shape. Three controls at 360 is 106px each, which is above a comfortable label width, so wrapping is the expected outcome rather than the fallback. |
| 11 | `PageTabs` with two tabs at 1440 — TC-DS01-UNIT-05 | It does not overflow, so nothing scrolls and nothing is clipped. The scroll container is present at every width and is inert when it is not needed. |
| 12 | A blocked `Popover` item under a coarse pointer whose reason is long — TC-DS01-E2E-07 step 5 | The reason wraps inside the item; the item grows. It is not truncated, because a truncated reason is a reason nobody can act on. |

## Blast Radius

| What breaks outside this spec | Mitigation |
|---|---|
| `PageTabs` stops wrapping in **nine** callers across five sections, five of which are not hiring — documents' envelope detail and template editor, the member detail, the holidays year picker, the signing page's signature pad | Requirement 57 makes the strip scroll rather than clip, so no tab becomes unreachable. Requirement 58 scrolls the active tab into view. TC-DS01-E2E-08 asserts it on the member detail, which is the caller with the most tabs (six) and is not hiring. |
| `.page-title` loses its 16/24 step, so **every** screen's `<h1>` grows from 16 to 20px below 768 — including the public booking and signing pages | This is the intent, not a side effect. The two public pages render their own `<h1>` rather than `PageTitle` (`BookingScreen.tsx:298`, `ManageScreen.tsx:465`) and are untouched; `/sign/{token}` does use `PageTitle` and grows with the rest. |
| Twenty-one design-system components change how they set hover, in six sections that have nothing to do with hiring | The change is a no-op under a fine pointer, and the whole E2E suite runs at 1280 with a mouse (`e2e/playwright.config.ts:76`), so no existing case can observe it. TC-DS01-E2E-04 emulates a coarse pointer explicitly, which is the only way to see it. |
| `AppShell`'s well padding stops being an inline style and becomes the class `.ds-app-shell-well` | A class name is a new piece of global surface: any stylesheet in the app could now target it, where an inline style could not be reached at all. The name is prefixed `ds-` like every other class the system owns, and `apps/web/app/globals.css` targets none of them. The `style` prop is **not** the risk — the design system's `AppShell` has one call site (`apps/web/src/layout/AppShell.tsx:38`) and it passes none. |
| `useMediaQuery` moves package, so its two importers change their import | Both are hiring (`VacancyBoard.tsx:19`, `candidates/page.tsx:55`). The old file is deleted rather than re-exported, so a stale import fails to compile instead of silently keeping the `false` seed. |
| `MenuDrawer` gains `aria-modal` below `sm`, changing what a screen reader announces for the candidate filters | Only in the sheet form, where it is true. Above `sm` the announcement is unchanged. |
| `ConfirmDialog` becomes a sheet below `sm` across **25 call sites**, in every section of the product | Its shell is already `width: 100%` with a 600 cap (`ConfirmDialog.tsx:81-82`), so at 360 it is already full width and the diff is the top-only radius, the 92% cap and the sticky footer. It owns its own two buttons, so no caller changes. Nothing above `sm` moves, and the suite runs at 1280. |
| `MEMBER_MESSAGES` gains a key, so `packages/validation` rebuilds and both apps recompile | Additive: a new key beside `lastAdminGuard`. The literal it replaces is deleted in the same change, so a stale copy cannot survive. |
| The inline stamp script runs on `/sign/{token}`, which is the one route with a CSP | `script-src` already carries `'unsafe-inline'` with no nonce (`apps/web/next.config.mjs:121-129`), so it is permitted. Stated rather than assumed. |
| `--shadow-drawer` now has a mirrored sibling, and a reader could reach for the wrong one | The two are named for the edge their panel hangs on, and the token file carries the reason on the line. |

## Backward Compatibility

1. **No migration, no schema, no API.** Nothing deploys in an order that matters and a rollback
   needs no database change. The mechanism is that this spec touches no `.prisma` file and no
   controller.
2. **Every existing E2E case keeps passing without edit.** The mechanism is the viewport the suite
   runs at: `devices['Desktop Chrome']`, 1280 × 720, a fine pointer
   (`e2e/playwright.config.ts:76`). Every rule below `xl` and every rule under a coarse pointer is
   unobservable there. The two exceptions are named in requirement 28 and requirement 57, and both
   are asserted rather than assumed — TC-DS01-E2E-01 and TC-DS01-E2E-08.
3. **The page title keeps its id, its element and its text at every width.** The mechanism is
   requirement 26: `PageHeader` is not conditioned on anything, so `page-title` cannot disappear.
   This is what the four existing cases that assert it depend on
   (`hiring-libraries.spec.ts:80`, `hiring-board.spec.ts:385`, `hiring-vacancies.spec.ts:428`,
   `hiring-candidate-card.spec.ts:503`).
4. **`Modal`'s geometry above `sm` is unchanged**, so the eleven callers (of twenty-nine in all)
   that set an explicit width keep the width they set. The mechanism is requirement 52: the sheet form is a branch below
   `sm` and adds no cap, floor or ladder above it.
5. **Keyboard drag survives every pointer rule.** The mechanism is that it is reached by `Space` on
   a `role="button"` card and is implemented in the caller, not behind the `draggable` attribute
   (requirement 43).
6. **The stamp degrades to today's behaviour rather than to nothing.** The mechanism is
   requirement 12's fallback: a hook with no stamped attribute reads `matchMedia` on mount, which
   is what `useMediaQuery` does today.

## Acceptance Criteria

1. At 360, 576 and 767 the rail is off-screen to the **left**; the hamburger opens it from the left
   over a scrim painted 60% black; it closes on the scrim, on `Escape`, and on choosing a section;
   focus moves in and returns to the hamburger.
2. At 1200 and above the hamburger and the scrim are not visible and the rail is in view. Both may
   still be in the document; the rule is that neither paints and neither catches a click.
3. The scrim does not cover the navbar.
4. Well and navbar padding is 16px below 768 and 25px at 768 and above.
5. `<html>` carries `data-bp`, `data-pointer` and `data-motion` in the first painted frame, and all
   three update on a change to the query behind them.
6. `data-bp` reads `xs` at 360, `sm` at 576, `md` at 768, `lg` at 992, `xl` at 1200 and `xxl` at
   1440.
7. The page title is present with `data-testid="page-title"` at 360 and at 1440, and measures
   20/30 below 1200 and 24/36 at and above it.
8. Tapping any design-system control under a coarse pointer leaves no latched hover behind.
9. Every `IconButton`, `Popover` item, row kebab and the navbar hamburger measures at least 44 × 44
   under `(pointer: coarse)`; every one of them measures exactly what it measures today under
   `(pointer: fine)`.
10. A touch tablet at 900px draws no grab cursor and no draggable card **on the hiring board**; a
    mouse at 900px still drags; keyboard drag works at every width under both pointers. The
    projects kanban is excluded by requirement 40 and keeps its touch drag.
11. A blocked menu item's reason is readable without hovering under a coarse pointer.
12. Below 576 a `Modal`, a `ConfirmDialog` and a `MenuDrawer` are full-width sheets, rounded at the top, capped at 92%
    height, with the body scrolling and the actions pinned; at 576 and above they are a centred
    modal and a right-edge drawer.
13. Focus is trapped inside `Modal` and `MenuDrawer` in their sheet form, and returns to the opener on close. `ConfirmDialog` already traps at every width through `useDialogFocus` ([§8](decisions.md), [§40](decisions.md)) and is unchanged.
14. A tab strip is one line at every width, scrolls inside itself when it overflows, and the page
    body never scrolls horizontally because of it.
15. Opening a screen whose active tab is off-screen scrolls that tab into view.
16. No page scrolls horizontally at 360 on any of the seven routes TC-DS01-E2E-11 walks: members,
    vacancies, the vacancy detail, candidates, the candidate card, libraries and the public booking
    page — and **neither does the shell's content well**, which is the scroller the document's own
    measurement cannot see (§04.25). On a screen inside the shell the well is the **only**
    scroller, vertically too: a document that scrolls behind it is a second scrollbar beside it.
    The other sections are not claimed, because `Table` has no card form until the next spec and a
    wide table at 360 is expected to overflow its own scroller until it does.
17. `npm run ds:check` fails when `base.css` and `breakpoints.ts` disagree about a rung.

## Out of Scope

- **`Table`'s `hideBelow` and the card form of a list row.** That is the next spec's subject
  (`specs/hiring/01-vacancies.design.md`), and building it here would mean deciding column roles for
  four lists inside a document about the frame.
- **The candidate database, the board, the candidate card and the public pages** at their own
  breakpoints. Each is revised in its own `.design.md`; this spec gives them the ladder and the
  sheet, and nothing else.
- **A dark theme.** Light only this release, unchanged.
- **Container queries.** Rejected in the Summary, with the reason.
- **A `size` prop on `Modal`.** Requirement 52, with the reason.
- **Rewriting `ConfirmDialog` to compose `Modal`.** It draws its own shell, so this spec
  implements the sheet form twice. That is the right end state and it is a change to 25 call sites
  with nothing to do with a phone; doing it here would put a component rewrite inside a responsive
  pass. Named so the duplication is a known debt rather than an oversight.
- **The other sections at 360** — documents, projects, clients, reports, time tracking, requests,
  outbox. They get the shell, the pointer rules and the sheets, and nothing about their tables.
  Acceptance criterion 16 says so rather than implying it.
- **Long-press drag on touch.** The source design proposes it; this spec refuses drag on a coarse
  pointer outright rather than inventing a gesture, because the card's own status control already
  does the job with any pointer.
- **A sticky confirmation panel on the public booking pages.** The submit stays at the end of the
  page, after everything it acts on.
- **The five-width screenshot pass.** It is a human delivery gate, not a test; see Known Gaps.

## Known Gaps

| Gap | Why it is acceptable now | What closes it |
|---|---|---|
| A stylus is treated as coarse and is refused board drag (Edge case 1) | One axis serves all three rules and a stylus is rare on this product; the card's status control still moves it | A third stamped axis, `data-hover`, split from `data-pointer` |
| No automated check that nothing overlaps, is clipped, or truncates badly | A `data-testid` can say a column is absent at 900px; it cannot say two things are on top of each other | The five-width screenshot pass at 360 / 576 / 768 / 1024 / 1440, run by a person each phase; a script that reuses the E2E harness and its own ports produces the images |
| `packages/ds` has no unit-test project today, so requirement 5's drift check and the rung classifier have nowhere to live | `npm run test:unit` runs `@devscribed/validation` only | This spec adds a vitest project to `packages/ds` and extends the root `test:unit` to both workspaces — a task it owes, listed in the Verification Plan |
| The members list's blocked `Delete` cannot be opened at all | The last admin is the caller, and the caller's own row draws no menu (`MembersTable.tsx:117`). The rule that puts the reason on screen is proven on the four reachable items; the message move is proven at unit level | A row menu on one's own row, or a second admin the guard still blocks — neither is this spec's to add |
| The coarse-pointer rules are verified by Playwright's emulation, not on a real device | `hasTouch` and `(pointer: coarse)` emulation is what Chromium reports to the page, and every rule here is written against exactly that query | A device-lab pass, out of scope for this release |
| Requirement 58 — the active tab scrolled into view **on mount** — has no E2E observer | No `PageTabs` caller can currently mount with an off-screen active tab. The board holds its column in `useState('scheduled')`, the first tab, and writes no URL (`VacancyBoard.tsx:67`); the member detail resolves any disabled tab back to `about` (`MemberDetailScreen.tsx:222-224`); no other caller has enough tabs to overflow 360. TC-DS01-UNIT-04 tests the behaviour directly instead | A caller whose chosen tab lives in the URL. The board is the natural one and it belongs to `specs/hiring/05-board.design.md`, not here |
| `ConfirmDialog` and `Modal` each implement the sheet form | `ConfirmDialog` does not compose `Modal`, so there is no shared shell to put it in | The rewrite named in Out of Scope |
| `DateRangePicker`'s day cell is 40 wide below `sm`, not 44 | Requirement 39's rule now reaches it — the grid gives back its inset and gutters there, taking the cell from 33.6 to 40 — but the panel it sits in is a fixed 280px, so the last 4px are the panel's to give, not the grid's. It is a popover on a reports page, not the primary control of a public page, and its whole panel is 448 wide at 360 already | A reports spec that says what that panel does below `sm`. `reports/01-reports.md` owns it; nothing in this spec's blast radius touches its width |

## Verification Plan

### Bringing it up

| Step | Command | Observed |
|---|---|---|
| 1 | `open -a Docker` then `docker compose up -d` | `devscribed-postgres` healthy, `0.0.0.0:5433->5432`. The daemon was not running at the start of this work. |
| 2 | `npm run test:unit` | `32 passed (32)`, `1316 passed (1316)`, 1.98s. The baseline, before anything in this spec. |
| 3 | `cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 npx playwright test tests/<probe> --workers=1 --retries=0` | API and web started on 4100 / 3100; `26 migrations found`, `No pending migrations to apply` against `devscribed_e2e`; the probe signed in and reached `/org/{orgId}/hiring/vacancies`. |

Never 3000/4000, never `devscribed_dev`. `e2e/playwright.config.ts` starts the pair itself.

### Reaching the states the cases need

| State a case needs | Route to it | Exists today | Proven |
|---|---|---|---|
| A signed-in admin in the shell | `registerOrganization(request, email)` then `signIn(page, email)` (`e2e/tests/helpers.ts:132`, `:148`) | yes | yes — the probe reached `/members` and then the vacancies list |
| A vacancy with a row kebab | `createVacancy(request, org)` (`helpers.ts:1562`) | yes | yes — measured the kebab at 32 × 32 |
| A viewport at each rung | `page.setViewportSize({ width, height })` | yes | yes — read at 1440, 1280, 992, 900, 768, 576 and 360 |
| A coarse pointer | `browser.newContext({ hasTouch: true, isMobile: true })`, or `devices['Pixel 7']` | **yes**, as a context — no *project* emulates one, `e2e/playwright.config.ts:76` has a single `Desktop Chrome` | **yes** — the second rehearsal below drove both and each reported `(pointer: coarse)` and `(hover: none)` |
| A blocked menu item | A vacancy with applications (`bookInterview`) for `Delete`; a closed vacancy for `Copy booking link` | yes | no — not exercised by the probe; both helpers exist and are used by `hiring-vacancies.spec.ts` |
| Reduced motion | `browser.newContext({ reducedMotion: 'reduce' })` | yes, Playwright built-in | no |
| A `MenuDrawer` in sheet form | The candidates screen's `candidates-filters-open` button at 360 (`candidates/page.tsx:773`) | yes | no — the probe stopped at the vacancies list |
| A board tab strip with five tabs | `createVacancy` + `bookInterview`, then the vacancy detail at 360, where `VacancyBoard` draws `PageTabs` (`:392`) | yes | no |
| A `PageTabs` mounted with an off-screen active tab | **no route** — the board holds its column in `useState('scheduled')` and writes no URL (`VacancyBoard.tsx:67`); the member detail resolves a disabled tab back to `about` (`MemberDetailScreen.tsx:222-224`) | **no** | no — this is why requirement 58 is verified at unit level, and it carries a Known Gaps row |
| A `packages/ds` unit test | **none today** — `npm run test:unit` runs `@devscribed/validation` alone | **no** | no — a task this spec owes, listed under "Harness this spec owes" |

### Access this needs

**None.** No credential, key, account or MCP server. Every observer is the browser the suite
already drives, and every state is reached through endpoints this repository owns. No secret value
appears in this spec or in any tracked file.

### Observing each criterion

| Acceptance criterion | Observer | Level | Proven at spec time |
|---|---|---|---|
| 1 rail off-screen left, scrim painted, close and focus | TC-DS01-E2E-01 | E2E | partly — the probe proved the drawer opens, focus moves in (`"A"`) and returns to `Open navigation`; it measured the rail at `left: 20 → right: 360`, i.e. **the right edge**, and the scrim as `rgba(0, 0, 0, 0)`, i.e. **unpainted** — the two facts the criterion inverts |
| 2 hamburger and scrim not visible at `xl` | TC-DS01-E2E-01 | E2E | yes — `burgerVisibleAt1280: false`, and the probe found `"no scrim in DOM"` at 1280, which satisfies `toBeHidden()` |
| 3 scrim clears the navbar | TC-DS01-E2E-01 | E2E | yes — today `scrimTop: "0px"`, which is what changes |
| 4 well and navbar padding | TC-DS01-E2E-02 | E2E | yes — measured 25px at every rung down to 360, for both |
| 5 the three attributes exist before paint | TC-DS01-E2E-03 | E2E | yes — all three read `null` at every rung today |
| 6 `data-bp` per rung | TC-DS01-UNIT-01, TC-DS01-E2E-03 | Unit + E2E | the classifier does not exist yet; the viewports it is read at are proven |
| 7 title present and its type | TC-DS01-E2E-01 | E2E | yes — 16/24/500 at 360 and 576, 20/30/450 at 768–1199, 24/36/450 at 1200+ |
| 8 no latched hover | TC-DS01-E2E-04 | E2E | partly — the second rehearsal proved the coarse context reports `(hover: none)`; the latching itself is not yet observed on a real control |
| 9 44 × 44 coarse, unchanged fine | TC-DS01-E2E-05 | E2E | **yes, both halves** — fine measured in the product (hamburger 18 × 13, kebab 32 × 32, menu item 167 × 37); coarse proven on the proposed rules in the second rehearsal (34 → 44 with the inline width still set) |
| 10 drag follows the pointer | TC-DS01-E2E-06 | E2E | partly — the coarse context exists and was driven; the guard does not, since `draggable` is still on a width test |
| 11 blocked reason readable on touch | TC-DS01-E2E-07 | E2E | partly — the second rehearsal proved the visually-hidden span becomes visible under the coarse block, and found the source-order trap that would have made it silently not |
| 12–13 sheets and their focus trap | TC-DS01-E2E-09, TC-DS01-E2E-10 | E2E | no |
| 14 one-line tab strip that scrolls | TC-DS01-E2E-08 | E2E | no |
| 15 active tab scrolled into view on mount | TC-DS01-UNIT-04 | Unit | no — and **no E2E observer exists**: no `PageTabs` caller can mount with an off-screen active tab. Known Gaps carries it |
| 16 no horizontal scroll at 360 on the seven named routes | TC-DS01-E2E-11 | E2E | partly — `docOverflow: 0` proven on members and the vacancies list at 360; the other five not walked |
| 17 ladder drift fails `ds:check`, across all three files | TC-DS01-UNIT-02 | Unit | the check does not exist yet; `ds:check` runs clean today (`0 values outside the token vocabulary, 68 exempted`) |

### Rehearsal

A throwaway Playwright spec was written at `e2e/tests/zz-probe-responsive.spec.ts`, run as

```
cd e2e && E2E_WEB_PORT=3100 E2E_API_PORT=4100 CI=1 \
  npx playwright test tests/zz-probe-responsive.spec.ts --reporter=list --workers=1 --retries=0
```

and **deleted**. It registered an organization, created a vacancy, signed in through the UI, then
read the shell at 1440, 1280, 992, 900, 768, 576 and 360. What came back, which is the baseline
every requirement above is written against:

| Reading | 1440 / 1280 | 992 / 900 / 768 | 576 / 360 |
|---|---|---|---|
| navbar height | 80px | 60px | 60px |
| navbar padding-left | 25px | 25px | 25px |
| well padding | 25px | 25px | 25px |
| `.page-title` | 24/36/450 | 20/30/450 | 16/24/500 |
| rail | in flow, `left: 0 → right: 291` | `translateX(+…)`, off-screen **right** | off-screen right |
| rail shadow | none | `rgba(0,0,0,0.1) -4px 4px 16px` | same |
| `data-bp` / `data-pointer` / `data-motion` | `null` | `null` | `null` |
| document horizontal overflow | 0 | 0 | 0 |

At 360, opened: rail `left: 20 → right: 360`, `transform: none`, scrim
`background-color: rgba(0, 0, 0, 0)` at `top: 0px`, focus landed on an `A` inside the drawer and
returned to `Open navigation` on `Escape`. Hamburger hit box **18 × 13**. On the vacancies list at
1280: kebab **32 × 32**, `Popover` item **167 × 37**.

The first run of the probe timed out at 30s on its last step and the second named a row kebab by the
wrong id (`vacancy-actions-{id}`; it is `vacancy-actions-menu-{id}`,
`apps/web/app/org/[orgId]/hiring/vacancies/page.tsx:505`). Both are recorded because the second is
a selector any E2E case here would otherwise get wrong too.

**Second rehearsal — the CSS mechanism the pointer rules rest on.** A standalone Chromium script,
run outside the repository and deleted, loaded a fragment carrying the exact rules requirements 38
and 48 propose and measured it under three contexts. What came back:

| Context | `IconButton` box | `Popover` item height | blocked reason visible | `(hover: hover) and (pointer: fine)` |
|---|---|---|---|---|
| `devices['Desktop Chrome']` | **34 × 34** | 34 | no | **true** |
| `devices['Pixel 7']` | **44 × 44** | 60 | **yes** | false |
| `{ hasTouch: true, isMobile: true }` at 360 | **44 × 44** | 60 | **yes** | false |

Three things are now observed rather than argued:

1. **A stylesheet `min-width` beats an inline `width` with no `!important` and no JavaScript.** The
   button carried `style="width:34px"` throughout and still measured 44 under a coarse pointer.
   Requirement 38 rests on exactly this.
2. **The De Morgan equivalence holds in the browser.** Where `(hover: hover) and (pointer: fine)`
   was false, the `@media (hover: none), (pointer: coarse)` block applied, and where it was true
   the block did not. Requirement 9 claimed this from the algebra; this is the observation.
3. **A coarse pointer is emulable two ways**, so the four cases that need one have a route.

And one trap, which is why the probe was worth running: **the coarse block must come after the base
rules it reverses.** The first run put the media query first, and the visually-hidden reason stayed
hidden — equal specificity, so source order decided and the reversal silently lost. The implementer
needs this, and it is the sort of thing that reads as a mystery in review rather than as a bug.

### Harness this spec owes

1. A coarse-pointer context, per case: `browser.newContext({ hasTouch: true, isMobile: true })`.
   Four cases need it. It is **proven to work** by the second rehearsal below, so this is a helper
   to add rather than a risk to carry — a `coarsePage` fixture beside the existing ones in
   `e2e/tests/fixtures.ts`. A second Playwright project was the alternative and loses: it would
   run the whole suite twice.
2. A vitest project in `packages/ds`, and `npm run test:unit` extended from one workspace to two.
   Two unit cases need it.

## Test Cases

### TC-DS01-UNIT-01

- **Level:** Unit
- **Preconditions:** `packages/ds/src/breakpoints.ts` exports the ladder and a classifier.
- **Steps:**
  1. Classify 0, 359, 360, 575, 576, 767, 768, 991, 992, 1199, 1200, 1439, 1440 and 3000.
  2. Assert the boundary is inclusive on the lower side of each rung.
- **Expected Result:**
  1. `xs, xs, xs, xs, sm, sm, md, md, lg, lg, xl, xl, xxl, xxl`.
  2. 576 is `sm` and 575 is `xs`; 1200 is `xl` and 1199 is `lg`.

### TC-DS01-UNIT-02

- **Level:** Unit
- **Preconditions:** The ladder exists in both `base.css` and `breakpoints.ts`.
- **Steps:**
  1. Parse every `min-width` and `max-width` in `packages/ds/src/base.css`.
  2. Compare each against the rung boundaries in `breakpoints.ts`.
  3. Change one number in a fixture copy of `base.css` and re-run.
- **Expected Result:**
  1. Every query's number is a rung boundary or a boundary minus one.
  2. The check passes on the real file.
  3. The check fails on the fixture, and `npm run ds:check` exits non-zero.

### TC-DS01-UNIT-03

- **Level:** Unit
- **Preconditions:** The stamp's pointer classifier is a pure function of two booleans.
- **Steps:**
  1. Evaluate it for every combination of `(hover: hover)` and `(pointer: fine)`.
  2. Evaluate the CSS predicate `(hover: none) or (pointer: coarse)` for the same four.
- **Expected Result:**
  1. `fine` only when both are true.
  2. The two agree on all four combinations — the De Morgan equivalence requirement 9 relies on.

### TC-DS01-UNIT-04

- **Level:** Unit
- **Preconditions:** `PageTabs` renders in a DOM environment with a strip narrower than its tabs.
- **Steps:**
  1. Mount `PageTabs` with six tabs in a 200px container, `active` set to the last.
  2. Read the strip's `scrollLeft` after mount.
  3. Mount again with `active` set to the first.
- **Expected Result:**
  1. The strip overflows.
  2. `scrollLeft > 0` — the active tab was scrolled into view on mount.
  3. `scrollLeft === 0` — nothing is scrolled when the active tab is already in view.

This case exists because requirement 58 has no E2E observer: no `PageTabs` caller in the product
can currently mount with an off-screen active tab. See the Known Gaps row.

### TC-DS01-UNIT-05

- **Level:** Unit
- **Preconditions:** `PageTabs` renders in a DOM environment.
- **Steps:**
  1. Mount with two tabs in a 1440px container and read the strip's `scrollWidth` against its
     `clientWidth`, and its computed `overflow-x`.
- **Expected Result:**
  1. `scrollWidth === clientWidth` — nothing overflows and nothing scrolls — while `overflow-x` is
     still the scrolling value. The container is present at every width and inert when it is not
     needed (edge case 11).

### TC-DS01-UNIT-06

- **Level:** Unit
- **Preconditions:** A panel in its sheet form renders in a DOM environment.
- **Steps:**
  1. Render a sheet with no `actions` slot; read for a footer.
  2. Render one with a single control in the slot; read its width against the footer's.
  3. Render one with three; read the three widths and whether the footer is still pinned.
- **Expected Result:**
  1. No footer element exists and the body scrolls to its end (edge case 10).
  2. The control is full width — not one half with an empty half beside it (edge case 10a).
  3. The three take equal widths, wrap to a second line when they do not fit, and the footer stays
     pinned (edge case 10b).

### TC-DS01-UNIT-07

- **Level:** Unit
- **Preconditions:** `packages/validation` builds.
- **Steps:**
  1. Read `MEMBER_MESSAGES.lastAdminBlocked`.
  2. Grep `apps/web/app/org/[orgId]/members/MemberRowActions.tsx` for the literal it replaces.
- **Expected Result:**
  1. It is `Cannot remove the last admin`, verbatim — the string moved, it was not rewritten.
  2. The literal is gone from the component. A relocation that leaves the original behind is two
     sources of truth, which is what `packages/validation` exists to prevent.

**No integration cases.** Nothing in this spec reaches the API, the database or a queue. There is
no server behaviour to assert, and an integration case here would be a test of Supertest.

### TC-DS01-E2E-01

- **Level:** E2E
- **Preconditions:** A registered organization; signed in; viewport 360 × 800.
- **Steps:**
  1. Read `.ds-app-shell-nav`'s bounding box and computed transform.
  2. Press `Open navigation`; read the box again, and the scrim's background colour and `top`.
  3. Read `document.activeElement`.
  4. Press `Escape`; read `document.activeElement`.
  5. Press `Open navigation` again and click the scrim.
  6. Press `Open navigation` once more and, **with the drawer still open**, resize to 1440 × 800.
     Count the nav rows carrying each `data-testid`, and read the scrim.
  7. Resize back to 360, and look for the hamburger and the scrim at 1440 and at 360 in turn.
  8. Read `page-title`'s text, font-size and line-height at 360 and at 1440.
- **Expected Result:**
  1. The rail's right edge is at or left of 0 — it is off-screen to the **left**.
  2. Open, its left edge is 0 and its width is 340; the scrim's background is
     `rgba(0, 0, 0, 0.6)` and its `top` equals the navbar height, not `0px`.
  3. Focus is inside the drawer.
  4. Focus is on the hamburger.
  5. The drawer closes.
  6. Edge case 4. The rail is in the flow, every nav `data-testid` matches exactly one node — the
     drawer **is** the rail, not a copy ([§14](decisions.md)) — and the scrim is not visible even
     though `menuOpen` is still `true` in React.
  7. The hamburger and the scrim are not visible at 1440 and visible at 360 — asserted with
     `toBeHidden()` / `toBeVisible()`, which pass whether the node is absent or merely hidden,
     rather than with `toHaveCount(0)`, which would force the switch into JavaScript.
  8. Present at both; `20px`/`30px` at 360 and `24px`/`36px` at 1440.
- **Selectors:** `app-shell-scrim`, `page-title`; the hamburger and the close button by accessible
  name (`Open navigation`, `Close sidebar`). `app-shell-scrim` (asserted hidden) at 1440.

### TC-DS01-E2E-02

- **Level:** E2E
- **Preconditions:** Signed in.
- **Steps:**
  1. At 360, 576 and 767, read the well's computed padding and the navbar's `padding-left`.
  2. At 768, 992 and 1440, read both again.
- **Expected Result:**
  1. `16px` for both, at all three.
  2. `25px` for both, at all three.
- **Selectors:** none — computed styles on `.ds-navbar` and the well.

### TC-DS01-E2E-03

- **Level:** E2E
- **Preconditions:** Signed in.
- **Steps:**
  1. Read `data-bp`, `data-pointer` and `data-motion` on `<html>` at 360, 576, 768, 992, 1200 and
     1440.
  2. Fetch the document with `request.get()` and search the body for the stamp `<script>` and for
     `data-bp`.
  3. Register a `page.addInitScript` that subscribes to `readystatechange` and records
     `document.documentElement.getAttribute('data-bp')` the first time `readyState` is
     `interactive`. Navigate, then read the recorded value.
  4. Open a context with `reducedMotion: 'reduce'` and read `data-motion`.
  5. In one context, use CDP `Emulation.setEmitTouchEventsForMouse` (or open a fresh page in a
     coarse context and back) to change the pointer without a reload, and read `data-pointer`
     and a board card's `draggable` before and after.
- **Expected Result:**
  1. `xs, sm, md, lg, xl, xxl`; `data-pointer` is `fine`; `data-motion` is `full`.
  2. The `<script>` is the body's first child and **`data-bp` is not in the served HTML.** The server cannot
     know the viewport — edge case 9 says so — so a stamp in the server's own bytes would mean the
     rung had been guessed. What this step proves is that the writer is an inline script rather
     than a React effect.
  3. `data-bp` is already set at `interactive`, which is before React hydrates and before first
     paint. This is the observation that requirement 7 actually rests on.
  4. `reduced`.
  5. Edge case 3. `data-pointer` flips and `draggable` follows it, with no reload. If the
     emulation cannot be changed mid-page, the step is recorded as **not run** and edge case 3
     joins Known Gaps rather than being asserted by a case that does not exercise it.
- **Selectors:** none — attributes on the document element.

### TC-DS01-E2E-04

- **Level:** E2E
- **Preconditions:** A coarse-pointer context (`hasTouch: true, isMobile: true`); signed in; a
  vacancy exists.
- **Steps:**
  1. Tap a row in the vacancies table, then tap elsewhere.
  2. Read the row's computed `background-color`.
  3. Repeat for a `Button` and for the `Popover` kebab.
- **Expected Result:**
  1–3. The row's background is `--surface-card`, not `--color-row-hover`; neither the button nor
  the kebab retains a hover paint. Nothing is latched.
- **Selectors:** `vacancy-row-{id}`, `vacancy-actions-menu-{id}`.

### TC-DS01-E2E-05

- **Level:** E2E
- **Preconditions:** A coarse-pointer context and a fine-pointer context; signed in; a vacancy
  exists.
- **Steps:**
  1. Coarse, at 360: measure the hamburger, the row kebab and an open menu item.
  2. Fine, at 1280: measure the same three.
- **Expected Result:**
  1. Every box is at least 44 wide and 44 high.
  2. The kebab is 32 × 32 and the menu item is 37 high, exactly as today — the fine pointer is
     untouched.
- **Selectors:** `vacancy-actions-menu-{id}`, `vacancy-action-copy-link-{id}`; the hamburger by
  accessible name.

### TC-DS01-E2E-06

- **Level:** E2E
- **Preconditions:** A vacancy with at least one booked interview; the board reachable.
- **Steps:**
  1. Fine pointer at 900 × 800: read a board card's `draggable` and its computed `cursor`.
  2. Coarse pointer at 900 × 800: read both again.
  3. Coarse pointer at 900: focus a card and press `Space`, then an arrow, then `Space`.
- **Expected Result:**
  1. `draggable="true"`, `cursor: grab`.
  2. `draggable="false"`, and the cursor is not `grab`.
  3. The card is picked up, moves and drops — keyboard drag is unaffected by the pointer.
- **Selectors:** `board-card-{applicationId}`, `board-column-{status}`.

### TC-DS01-E2E-07

- **Level:** E2E
- **Preconditions:** A coarse-pointer context; a closed vacancy; a vacancy with applications; and
  the sole admin of the organization, whose `Delete` on the members list is blocked by the
  last-admin guard.
- **Steps:**
  1. Open the row menu on the closed vacancy without hovering.
  2. Read the visible text of the `Copy booking link` item.
  3. Repeat for `Delete` on the vacancy with applications.
  4. Give the vacancy a title long enough that its reason wraps, and read the item's height.
- **Expected Result:**
  1. The menu opens.
  2. The reason is visible text inside the item, not only in a bubble.
  3. The same.
  4. The reason wraps and the item grows to hold it; it is not truncated (edge case 12). A reason
     nobody can finish reading is a reason nobody can act on.

  **The fifth reason has no route.** `Cannot remove the last admin` sits on the members list, and
  `MembersTable.tsx:117` draws no menu for the caller's own row — which in a fresh organization is
  the last admin's row. A second admin would make neither of them last. The item exists and
  cannot be opened, so its relocated message is asserted by TC-DS01-UNIT-07 instead.
- **Selectors:** `vacancy-actions-menu-{id}`, `vacancy-action-copy-link-{id}`,
  `vacancy-copy-guard-message-{id}`, `vacancy-action-delete-{id}`,
  `vacancy-delete-guard-message-{id}`, `member-action-delete`, `delete-guard-message`.

### TC-DS01-E2E-08

- **Level:** E2E
- **Preconditions:** A vacancy with at least one booked interview, so the board draws five tabs;
  viewport 360 × 800, where the board renders its `PageTabs` strip.
- **Steps:**
  1. Read the strip's `clientHeight` and its `scrollWidth` versus `clientWidth`.
  2. Read `document.documentElement.scrollWidth - clientWidth`.
  3. Scroll the strip to its end and press the last tab, `board-tab-offer`.
  4. Read the chosen tab's bounding box against the strip's.
- **Expected Result:**
  1. The strip's height is one row's — under 60px, not the ~80px two rows would take — and
     `scrollWidth > clientWidth`, so it scrolls inside itself.
  2. 0. The page body does not scroll horizontally, even though the strip overflows.
  3. The `Offer` column is shown.
  4. The chosen tab is wholly inside the strip's visible box.
- **Selectors:** `board-tab-scheduled`, `board-tab-offer`, `board-column-offer`.

**Why the board and not the member detail.** The member detail has the most tabs, and its last
three are `disabled: true` (`MemberDetailScreen.tsx:92-94`) with any disabled `activeTab` resolved
back to `about` (`:222-224`), so its last tab cannot be selected at all. The board is the only caller
with five reachable tabs. Requirement 58's "scrolled into view **on mount**" is not observable on
any caller today — `VacancyBoard.tsx:67` holds the chosen column in `useState('scheduled')`, the
first tab, and writes no URL — so it is verified at unit level by TC-DS01-UNIT-04 and carries a
Known Gaps row.

### TC-DS01-E2E-09

- **Level:** E2E
- **Preconditions:** Signed in; the vacancies screen; an open vacancy with no applications, so its
  `Close` action offers a confirmation.
- **Steps:**
  1. At 360, open `New vacancy`. Read the dialog's box, border radii and the actions row's
     position while scrolling the body, and the footer's bottom padding.
  2. Resize to 576 and read the box again.
  3. Dismiss, and open the row menu's `Close` to raise `vacancy-close-confirm` at 360. Read its
     box, radii and footer.
  4. Resize to 576 and read it again.
- **Expected Result:**
  1. Full width, top corners rounded and bottom corners square, height at most 92% of the viewport,
     the actions row stays pinned while the body scrolls, and its bottom padding is
     `env(safe-area-inset-bottom)` — zero on a desktop emulation, non-zero on a device that
     publishes one.
  2. Centred, at most 70% wide — the modal form.
  3. **The same sheet, from `ConfirmDialog`.** This is the second implementation of the form —
     `ConfirmDialog` composes no other overlay (requirement 50) — so it is asserted rather than
     assumed to match.
  4. Centred with its own 600 cap, unchanged from today.
- **Selectors:** `vacancy-dialog`, `vacancy-close-confirm`, `sheet-actions`,
  `vacancy-actions-menu-{id}`, `vacancy-action-close-{id}`.

### TC-DS01-E2E-10

- **Level:** E2E
- **Preconditions:** Signed in; the candidates screen.
- **Steps:**
  1. At 360, press `candidates-filters-open`.
  2. Tab forward past the last focusable control in the panel.
  3. Press `Escape`.
  4. Resize to 992, press `Filters` again, and Tab past the last control.
- **Expected Result:**
  1. A full-width sheet with `aria-modal="true"`.
  2. Focus wraps to the first control inside the panel — it is trapped.
  3. The panel closes and focus returns to `Filters`.
  4. A right-edge drawer; focus leaves the panel into the page — untrapped, as today.
- **Selectors:** `candidates-filters-open` (the button), `candidates-filters` (the panel),
  `candidates-filters-close`.

### TC-DS01-E2E-11

- **Level:** E2E
- **Preconditions:** Signed in; a vacancy with a booked interview so every hiring screen has content.
- **Steps:**
  1. At 360 × 800 visit members, vacancies, the vacancy detail, candidates, the candidate card,
     libraries, and the public booking page.
  2. On each, read `document.documentElement.scrollWidth - clientWidth`.
  3. On the six shell screens, read the same difference on the **well's scroller** — the element
     `.ds-app-shell-well` sits in. The booking page has no shell and is skipped for this step.
  4. On the same six, read `document.documentElement.scrollHeight - clientHeight`.
- **Expected Result:**
  1–2. 0 on every one of the seven.
  3. 0 on all six, and the scroller's computed `overflow-x` is `hidden` (§04.25). Step 2 alone
     passed while the well was 357px wider than its box, which is what step 3 exists to catch:
     the document is not the scroller on a screen inside `AppShell`.
  4. 0 on all six — the well is the only scroller, vertically as well. It was **80** on the
     candidate card, for a 1px box, which is a second scrollbar beside the well's own.
- **Selectors:** `page-title` on each shell screen as the arrival assertion; none for the
  measurement.

## Amendments this spec makes to other documents

Each is applied **in that document**, beside the statement it overrules, naming the requirement
that does it. Listed here so a reader of this spec knows the full reach.

| Document | Statement now false | Overruled by |
|---|---|---|
| `decisions.md` §14 | the drawer is a right-hand panel; the scrim has no paint of its own | §03.13, §03.17 |
| `decisions.md` §10 | `IconButton`'s 34px hit area is "the smallest square worth aiming at" | §07.36 |
| `decisions.md` §51 | `MenuDrawer` deliberately does not trap focus | §10.54 — below `sm` only |
| `decisions.md` §62 | a `Tooltip`'s bubble is what a pointer or a ring brings to the surface | §09.45, §09.48 |
| `decisions.md` §45 §58 §68 §94 | `PageTabs` wraps | §11.57 |
| `specs/user-management/00-app-shell.design.md` §Responsive | "a 340px panel against the **right** edge" | §03.13 |
| `specs/user-management/00-app-shell.design.md` §Responsive | "under the now-60px navbar"; the scrim "hangs from the navbar rather than covering it" | §03.13, §03.18 — the panel and the wash both start at `top: 0` |
| `specs/user-management/00-app-shell.design.md` Frame table | "Content well — 25px padding" | §04.22 |
| `specs/user-management/00-app-shell.design.md` Page header | "16/24 at 500, 20/30 at 450 from 768px" | §05.28 |
| `specs/hiring/05-board.design.md` §Responsive | "Below 768px … drag is replaced by the status control" | §08.40 — the guard is the pointer, not the width |
| `specs/hiring/03-candidate-database.design.md` §Responsive | "The drawer is **340px at every width**" | §10.49 — below `sm` it is a full-width sheet |
| `specs/hiring/03-candidate-database.design.md` §Accessibility | "focus is **not trapped**" | §10.54 §10.55 — trapped below `sm`, with `aria-modal` |
| `specs/hiring/03-candidate-database.design.md` §UI (the `MenuDrawer` bullet) | "340px, `--shadow-drawer`, `translateX(105%)` at rest" | §10.49 — from `sm` up only |
| `specs/user-management/README.md` | "`Modal` full-screen drawer < 480px — **open**… the outstanding chore" | §10.49 §10.51 — closed, as a sheet at `sm` |
| `specs/user-management/07-vacation-accrual-management.md` | "Modals become full-screen drawers on mobile (< 480px width)" | §10.49 — a sheet, below 576 |
| `specs/user-management/07-vacation-accrual-management.design.md` (prose + DS gaps row) | "the DS `Modal` does not currently implement this breakpoint behavior… **open**" | §10.49 §10.51 |
| `specs/user-management/09-vacation-requests.design.md` | "remains the open DS-`Modal` gap carried from 07" | §10.49 |
| `specs/user-management/12-time-tracking.design.md` DS gaps | "`Modal` has no <480px full-screen variant… carried; open chore" | §10.49 |
| `specs/user-management/14-task-collaboration.design.md` DS gaps | "a one-off app-level treatment, not a `Modal` variant" | §10.49 §10.56 — and §10.56 forbids the one-off |
| `specs/user-management/10-organization-requests-page.design.md` ×2 | "the `Modal` `<480px` drawer gap … unchanged"; "`Modal` still lacks the `<480px` full-screen-drawer breakpoint" | §10.49 §10.51 |
| `specs/user-management/11-projects.md`, `11-projects.design.md` | "no iOS-style bottom sheets, no sticky bottom action bars" | §10.49 — the sheet is the system's form, and the footer clears `env(safe-area-inset-bottom)` |
| `specs/user-management/12-time-tracking.md` ×2 | the same convention, and "**Modals** stay as **standard centered web dialogs**" | §10.49 |
| `specs/user-management/12-time-tracking.design.md` | "No native chrome, no sticky bars, no iOS bottom sheets" | §10.49 |
| `specs/user-management/13-kanban-board.design.md` | "no drawer, no bottom sheet (carried convention from 12)" | §10.49 |
| `specs/user-management/15-time-tracking-tasks.design.md` ×2 | "the one departure from 12/13's 'no bottom sheets' rule"; "the one exception … scoped narrowly to the task popover" | §10.49 §10.50 §10.56 |
| `specs/user-management/16-billable-time.md` | "the entry modal is full-screen" | §10.49 — 92%, not full-screen |
| `specs/user-management/03-user-invitation.design.md` | "`Modal` is already responsive: `width: '100%', maxWidth: 480`" | §10.49 — and the quoted geometry was already stale |
| `specs/user-management/06-account-settings.design.md` ×2 | "spans the available width with the `Modal`'s own padding" | §10.49 |
| `specs/organization/01-clients.md` | "the client picker … becomes a **bottom-sheet select**" | §10.50 §10.56 — a menu is not a panel and stays anchored |
| `specs/organization/03-holidays.md` | "the Edit modal is full-screen with a bottom sheet for the country picker" | §10.50 §10.56 |
| `specs/hiring/02-booking-page.design.md` §Responsive ×2 | "`≥ 880px` / `600–879px` / `< 600px`"; "the submit goes full width" | §01.1 §01.3 — `599 → 575`; the submit clause on its own measurement, 320 of 328 at 360 |
| `specs/hiring/07-manage-booking.design.md` §Responsive ×2 | the same three rows; "the reschedule `Modal` goes **full-bleed**" | §01.1 §01.3; §10.49 — the sheet is the form it takes |
| `CLAUDE.md` *(reaffirmed, not overruled)* | "`npm run ds:check` fails on a deep import" — true of the document, false of the script | §01.5 corrects `scripts/ds-adherence.js` so the sentence becomes true |

**Amended in the other direction, by a document this one named.** §01.3 and §07.39 each stated
something about the public booking page that the measurement did not bear out, and
[02 design §Responsive](../hiring/02-booking-page.design.md#responsive) corrects both **here**,
beside the statements, rather than in a banner: `879` survives for a different reason than the one
given (the two Cards fit down to 818; the exception is earned by no ladder number falling inside
818–991), and a `Calendar` day cell was 44 in one dimension only.

**Not amended, deliberately:** the twenty-nine width statements in eleven documents that use `1024`,
`768`, `600` or `520`. Requirement 1 is narrowed rather than applied retroactively, and requirement
3's table names each number, its verdict and the document that executes it. Amending them here would
mean revising eleven screen specs inside a document about the frame.

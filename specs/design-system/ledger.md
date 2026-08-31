# Divergence ledger

Everything the vendored copy of the design system at `1_DS for dev/` has that upstream does not.
One numbered entry per component or prop added, under
[§D3](README.md) — *edit the vendored copy in place, but never silently*.

Phase 0 created this file; Phase 1 wrote §1–§11 and Phase 2 wrote §12–§18. `npm run ds:drift`
currently reports five local-only components — `AuthLayout`, `Card`, `IconButton`, `Eye`,
`EyeOff` — and each of them is numbered below, which is the bar this file exists to hold.

## Numbering convention

- Entries are numbered from **1**, sequentially, in the order they land. Numbers are assigned when
  the code lands, never reserved in advance.
- **A number is never reused.** Not after the entry closes, not after it is pushed upstream, not
  after the divergence is reverted.
- Code that exists because of an entry cites it as **`§n`** in a comment at the point of
  divergence — the added prop, the added component, the shim in `apps/web/src/`. `§n` with no
  qualifier means an entry in this file; a decision from the record is cited as `§Dn`.
- Closed entries move to [Closed](#closed) **with their number preserved**, and record how they
  closed. An entry closes when upstream adopts it, or when the divergence is removed.
- The bar at the end of the migration is not that `npm run ds:drift` passes, but that **every
  disagreement it reports carries a number here**.

### Kinds

Each entry is one of three, because the distinction decides what the upstream push must claim:

| Kind | Meaning | Upstream framing |
|---|---|---|
| `omission` | Blue measured production, and production never wrote this. Prop forwarding, `ref`, aria hooks, keyboard handling. Filed under [§D2](README.md). | A gap in the measurement — safe to adopt |
| `packaging` | Blue's readme already specifies the treatment; only the component was never promoted. `Card`, `IconButton`, `Eye`/`EyeOff`. | **Measured** — the values are blue's own |
| `designed` | No production precedent anywhere. `AuthLayout`, `BookingLayout`, `Calendar`, `FileInput`, `BoardCard`, `BoardColumn`. | **Designed, not measured** — must be labelled as such |

## Open

| § | Component | Divergence | Kind | Decision | Phase | Spec |
|---|---|---|---|---|---|---|
| 1 | `Button` | `width: '100%'` removed from the base style. Blue has no way to make a button size to its own content, because every call site in prod is inside a width-constrained wrapper. Blue's own two consumers now say so themselves: `ConfirmDialog` passes `style={{ width: '100%' }}`, `FormActions` stretches its slot with `display: grid`. Nothing in blue's compositions changed on screen. | `omission` | [§D1](README.md), [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 2 | `Button` | `...rest`, `ref`, `style` merged over the painted style, caller `onMouseEnter`/`onMouseLeave` composed with the hover state, and `aria-busy` while `preloader` is set. Blue destructures seven props and forwards nothing, so `data-testid` and every `aria-*` were dropped before the DOM. | `omission` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 3 | `TextInput` | `...rest`, `ref`, `style` merged onto the `<input>`, caller `onFocus`/`onBlur` composed with the focus state, and `id` — which also gives the `<label>` a real `htmlFor`, falling back to `useId`. Blue's label is associated with nothing. | `omission` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 4 | `TextInput` | `errorId` / `hintId`, and a `hint` that shares the error's slot and geometry. Blue renders an error but gives no way to tag the node, so `field-error-{field}` could not be an `aria-describedby` target without smuggling a React element through a prop typed `string`. Sharing one slot is deliberate: a hint drawn anywhere else would move the field every time an error replaced it. | `omission` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 5 | `TextInput` | `trailing` — a control drawn inside the field's right edge, with the field's own right padding widened to match. It is where the password reveal lives; blue has no adornment slot at all. Not combined with `description`, which splits the row into a grid. | `omission` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 6 | `InfoBanner` | `...rest` and `style`. Every banner in this app is an announcement, and `role="alert"`, `aria-live` and `data-testid` all vanished before the DOM. | `omission` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 7 | `InfoBanner` | `error` and `success` variants. Blue's `info` and `warning` are untouched — note that prod's `warning` paints with the *error* palette, so `error` is that same treatment under the name that says what it is. `success` is green and has no production banner behind it; its tint follows the 10%-of-status rule blue's other two tints already use, so the value comes from blue's palette rather than being picked. | `designed` | [§D1](README.md) | 1 | [02](../user-management/02-authentication-login.design.md) |
| 8 | `Modal` | `role="dialog"`, `aria-modal`, `aria-labelledby` on the title, `Escape` to close, a `Tab`/`Shift+Tab` focus trap, focus return to the opener, `initialFocusRef`, an `aria-label` on the close button, and `...rest`. Blue's Modal is a `<div>` that closes only by click, so a keyboard user could neither reach it nor leave it. | `omission` | [§D2](README.md) | 1 | [02](../user-management/02-authentication-login.design.md) |
| 9 | `Icon` | `EyeIcon` / `EyeOffIcon`, exported as `Eye` / `EyeOff` and registered in the `Icon` dispatcher. Prod is a time tracker with no password field, so it has no reveal glyph — but blue's icon rules are explicit enough to draw one to (geometric, filled, `currentColor`, 12–24px, viewBox matching the intrinsic size, no icon font). | `packaging` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 10 | `IconButton` | New component. Blue never promoted one, but specifies the treatment exactly — the Modal close button is a bare glyph in `--text-secondary` that scales to 1.1 over 0.3s, with no background, border or radius. This is that, plus a label and a hit area, so a glyph-only control is reachable by name and big enough to press. | `packaging` | [§D2](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |
| 11 | `AuthLayout` | New component. Prod has no signed-out surface at all, so there is nothing to measure. Everything it draws is blue's own vocabulary — the `#f8fafc` well `AppShell` paints, a `--surface-card` panel with a 1px `--border-default`, `--radius-l` and no shadow, headline-5 for the title, body-s in `--text-secondary` beneath. **Must be pushed upstream as designed, not measured.** | `designed` | [§D6](README.md) | 1 | [01](../user-management/01-organization-creation.design.md), [02](../user-management/02-authentication-login.design.md) |

| 12 | `Card` | New component. Blue never promoted a general content surface, but specifies the treatment exactly — white, a 1px `--border-default` hairline, the 8px workhorse radius, no shadow. `NavigationCard` is that same treatment wearing a fixed 250px width, a click handler and a title/description pair instead of `children`: a dashboard tile, not a substitute. `clip` (default `true`) is what rounds an edge-to-edge `Table`'s corners and what has to be turned off on a card hosting a `Select` popover — see [reversal 6](README.md). Blue's `--shadow-card-hover` and `scale(1.01)` are **not** carried over: they belong to `NavigationCard`, which is a control, and painting them on a static container promises a click that is not there. | `packaging` | [§D1](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |
| 13 | `Sidebar` | `items`, and with it `href` / `testId` / `active` per entry, an `onNavigate` hook, `aria-current="page"`, `logoHref`, `onClose`, `label` for the nav landmark, and `...rest`. Blue hardcodes Teamplay's seven groups, because a measurement of one product has only one nav to measure ([§D6](README.md)); the default is still Teamplay's, so blue's own kit and template are unchanged. Three further gaps came with it: the submenu title was a bare `<li onClick>` — not focusable, not announced, unopenable without a pointer — and is now a real `<button aria-expanded>` under the same paint; an open submenu never re-synced when its section became current, which prod never needed because it mounts a fresh Sidebar per route; and the 290px width moved to `.ds-sidebar` so the drawer can override it (§14). | `omission` | [§D2](README.md), [§D6](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |
| 14 | `AppShell` | The 1200px breakpoint, a `sidebar` slot mirroring the existing `navbar` one, `menuOpen` / `onMenuClose`, the scrim, and `...rest`. Every value the switch needs was already a token — `--layout-sidebar-width`, `--layout-navbar-height-mobile`/`-desktop`, `--layout-breakpoint-desktop`, `--shadow-drawer` — and only the switch itself was missing, because a recreation of one viewport has one viewport to recreate. It lives in `base.css`, not in the component: a media query cannot be an inline style, which is the same reason `PageTitle` reaches for a class, and width alone deciding is what makes the server and the hydrated client agree with no stored preference and no `matchMedia` read. Below the breakpoint the rail **becomes** the drawer, carrying `MenuDrawer`'s own geometry rather than a second copy of the navigation sliding in beside it — see the note under Open. Focus moves into the drawer on open, returns to the opener on close, and `Escape` leaves; the drawer sits before the navbar in document order, so without that a reader who opened it would Tab straight past it. | `omission` | [§D2](README.md), [§D6](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |
| 15 | `Navbar` | `tracker`, `onMenuClick`, an `account` slot, `...rest`, and the height moved to `.ds-navbar` so 80px can become 60px below the breakpoint. Blue draws `MiniTracker` unconditionally because blue measured the one navbar prod has, and prod is a time tracker; a product with no timesheets has no counter to show. `onMenuClick` draws the drawer's hamburger — the counterpart to the sidebar's own close button, which prod ships and then hides with `display: none`. | `omission` | [§D2](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |
| 16 | `AccountMenu` | A real `<button aria-haspopup="menu" aria-expanded>` trigger, `role="menu"` / `role="menuitem"`, `Escape` with focus return, item objects carrying `testId` and `onSelect` beside prod's plain strings, `nameTestId` / `menuTestId`, and `...rest` onto the trigger. Prod's version is a `<div onClick>` wrapping the popover: it cannot be opened from a keyboard, cannot be left with `Escape`, is announced as nothing, and re-toggles itself when an item inside it is clicked. The paint is unchanged. `nameTestId` and `menuTestId` follow §4's shape — blue draws both nodes itself and gives no way to tag either. | `omission` | [§D2](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |
| 17 | `PageTitle` | `...rest` and a node title. Prod's every page title is a bare string because prod's every page title is a bare string; a heading that tags a name and an email inside itself needs children, and the `<h1>` needs to be reachable by a test. The three responsive steps in `.page-title` are untouched. | `omission` | [§D2](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |
| 18 | `Table` | Column objects (`label`, `key`, `render`, `flex`, `align`, `maxWidth`) beside prod's `string[]`, records as rows beside prod's `ReactNode[][]`, plus `rowKey`, `rowTestId`, `rowHref`, `onRowClick` and `...rest`. Prod builds these from a typed column list; the pair blue measured is what a hand-written kit screen passes, not an API a screen with real records can use. Both shapes still work, and every measured value — the sticky `--surface-sunken` header, 70px rows, the positional alignment rule, the 80px cap on the last column, the hover tint, the grayscale disabled row — is unchanged. One is now conditional: the pointer cursor. Prod's rows all navigate, so it measured as unconditional; a list that goes nowhere must not claim otherwise. `busy` and `hideHeader` are not here — they have no consumer until Phases 3 and 4. | `omission` | [§D2](README.md) | 2 | [00](../user-management/00-app-shell.design.md) |

### A note on §14 and `MenuDrawer`

The shell's drawer is `MenuDrawer`'s treatment — 340px, `top: var(--layout-navbar-height-mobile)`,
`--shadow-drawer`, `translateX(105%)`, `var(--duration-hover)`, and a full-bleed scrim — applied to
the node that is already holding the navigation, rather than to a second copy of it inside a real
`MenuDrawer`. `MenuDrawer` renders its own fixed panel around whatever it is given, so consuming it
here would put two of every nav row in the document, and with them two of every `data-testid` and
two of every `aria-current`. `MenuDrawer` itself is untouched and stays blue's component for the
drawers that are not the nav rail.

## Closed

| § | Component | Divergence | How it closed |
|---|---|---|---|
| *none yet* | | | |

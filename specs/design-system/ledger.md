# Divergence ledger

Everything the vendored copy of the design system at `1_DS for dev/` has that upstream does not.
One numbered entry per component or prop added, under
[§D3](README.md) — *edit the vendored copy in place, but never silently*.

Phase 0 created this file; Phase 1 wrote §1–§11, Phase 2 wrote §12–§18, Phase 3 wrote
§19–§29, Phase 4 wrote §30–§36, Phase 5 wrote §37–§38, Phase 6 wrote §39–§41, Phase 7 wrote
§42–§45 and Phase 8 wrote §46–§47, plus §48–§50 from the narrow-viewport bug report that
followed it. The **desktop-design** phases append to the same list, and their
rows say so in the phase column: `desktop 4` wrote §51–§52 and `desktop 5` wrote §53–§55.
`npm run ds:drift` currently reports sixteen local-only
components — `AuthLayout`, `BoardCard`, `BoardColumn`, `BookingLayout`, `Calendar`, `Card`,
`Chip`, `CrossIcon`, `FileInput`, `FlagIcon`, `IconButton`, `Eye`, `EyeOff`, `Pagination`,
`Toast`, `ToastHost` — and each of them is
numbered below, which is the bar this file exists to hold. `desktop 5` added the last three; Phases 5
and 6 added none, because every one of their entries is props on a component already numbered.
`desktop 6` adds no entry at all: soft-deleting a candidate is a `Popover`, a `ConfirmDialog` and a
`Toast`, and all three were numbered before it started. It is recorded here rather than passed over
in silence, because a phase that touches two screens and adds nothing to this file is the outcome
[§D3](README.md) is aiming at, and a reader counting phases against entries should not have to
wonder which one went missing. It does widen §41, whose entry said the scale reorder was its
only call site.

**This file is now the push list.** The migration's Phase 8 was its last, and the desktop-design
work that followed adds to it rather than reopening it — §51, §52 and §55 are `omission`s on
components already numbered, and §53 and §54 are the first two genuinely new components since
Phase 8. The split that push has to defend is
[the one below](#a-note-on-42-and-what-designed-is-allowed-to-mean): eleven `designed` entries,
four `packaging`, and everything else an `omission` — a gap in the measurement rather than a change
to the design.

Phase 6 also left two things that are **not** new numbers, because neither adds anything — both
make an existing entry do what it already said it did. They are written up as notes at the end:
[§8 and nested `Escape`](#a-note-on-8-and-nested-escape), and
[§29 and *matches nothing*](#a-note-on-29-and-matches-nothing).

**Five of the ten `designed` entries belong to the board and the public pages**, the two surfaces
with no production counterpart of any kind — not a treatment stated in a readme, not a library blue
already recreates, nothing. See
[§42 and what "designed" is allowed to mean](#a-note-on-42-and-what-designed-is-allowed-to-mean),
which carries the full list and what each entry was drawn from.

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

| 19 | `Badge` | `...rest` and `style`. Blue destructures three props and forwards nothing, so a status pill a test has to read the text of could not be named. Nothing about the paint changed. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 20 | `Chip` | New component, and with it `CrossIcon` moved out of `Select.jsx` into the icon module. Blue *draws* this already — it is the multi-value token inside `Select isMulti`, styled by the app's own `multiValue` overrides: white, a 1px `--border-default` hairline, a 7px `--color-blue` left border, the 8px radius, a 14px label. Only the component was never promoted out of the control, which left a screen wanting to *show* a chosen thing with nowhere to get it — the vacancy's category chips are exactly that, and `Badge` (blue's `ActivityBadge`, two status hues) is not a tag. Two things prod never had to say came with it, because prod only ever draws this inside a control: the cross is a real `<button>` with a name rather than a `<span onClick>`, and the pointer cursor is conditional — §18's call on `Table`'s rows, for §18's reason. `Select` consumes it, so the measured control is unchanged. | `packaging` | [§D1](README.md), [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 21 | `Select` | The control made a control. Blue measured the painted box of a react-select 5.5.6 wrapper and left a `<div onClick>` behind it: no `role`, nothing focusable, no arrow keys, no `Escape` — and `isSearchable` accepted and doing nothing, which blue's own `Tracker` has been passing since it was written. Now a real `role="combobox"` (the `<input>` when searchable, the control box when not — both are "the control", and that is where `...rest` lands) over a `role="listbox"`, with `aria-activedescendant`, arrow keys, `Home`/`End`, `Enter`, `Escape`, and `Backspace` dropping the last chip. Plus, on the option, `disabled` / `hint` / `testId`, so an ineligible interviewer shows disabled with its reason *inside* the row and therefore inside its accessible name; and `errorId` / `hint` / `hintId` / `id` / `wrapperStyle` / `chipTestId`, which are §3 and §4's shape on `TextInput` applied to its sibling. Two paint consequences, both of them restoring react-select rather than departing from it: the border lights on focus and not only on open (react-select uses `isFocused`; blue conflated the two because clicking did both), and the keyboard-focused row takes the tint the pointer already gets (the app's override drops react-select's `primary25`, so prod's focused row has no highlight at all — invisible is survivable when nothing can focus it and not before). | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 22 | `Popover` | `label`, `...rest`, and per-item `key` / `testId` / `disabled` / `description` / `descriptionTestId` / `onSelect`. Prod's rows are `<div onClick>` inside a `<div onClick>` trigger, so the menu could not be opened, walked or left from a keyboard and was announced as nothing; it is now a real `aria-haspopup="menu"` button over a `role="menu"`, focus entering on open and returning to the trigger on close. The one that is a decision rather than a repair: a blocked row is `aria-disabled` and **still focusable**, never the `disabled` attribute, and its reason is drawn in the row and wired as its `aria-describedby` — see the note on reversal 2 below. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 23 | `Preloader` | `...rest` and `style`. Prod portals this into `#portal` and nothing ever has to find it; a loader standing in for a screen's content has to be findable and has to be able to say what it is loading. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 24 | `InfoBanner` | `onDismiss` / `dismissLabel`, drawing an `IconButton` (§10) at the trailing edge. Prod's banners report a **state**: they are drawn while the thing is true and removed when it stops being, so nothing there ever needed putting away. A banner standing in for a toast reports an **event**, and nothing later makes "Vacancy created" untrue. The control is blue's own Modal-close treatment and the tint is the banner's own line colour, so nothing is invented but the affordance. | `designed` | [§D1](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 25 | `TextArea` | `...rest`, `ref`, `style`, `id` — which also gives the `<label>` a real `htmlFor`, falling back to `useId` — and `error` collapsed from a boolean plus `errorMessage` into the message itself, with `errorId`. Every one of these is §3 and §4 on `TextInput`, arriving on the field that is its twin; blue's two fields disagreed about their own API only because they were measured separately. The `trailing` slot in the label row is **not** here — that is Phase 5's, and it has no consumer until then. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 26 | `SearchInput` | `...rest` and `style` onto the `<input>`, `wrapperStyle` onto the 44px positioning root the icons are pinned to (a caller placing this field in a row is sizing that box, not the input inside it), and the clear cross made a real `<button>` with a `clearLabel` — prod's is a `<span onClick>`, a control that empties the field and cannot be reached without a pointer. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 27 | `Card` | `titleAs`, defaulting to `h2`. Prod's card headings are `<div>`s because prod's card headings are `<div>`s; a screen that replaced its captions with card titles — which is what `SectionLabel` becoming a heading means (D4) — is relying on them to *be* the outline under `PageTitle`'s `<h1>`, and blue already renders that one as a real heading. Every painted value is unchanged and `base.css` already zeroes heading margins, so no pixel moved. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 28 | `EmptyState` | `...rest` and `style`. The one node on the screen saying why a list is empty is the one a test most needs to name, and blue forwarded neither `data-testid` nor `role`. | `omission` | [§D2](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |
| 29 | `Select` | `allowCreate` / `onCreate` / `createTestId` — the `Create "…"` row offered when the query matches no option. This is the one part of §21 that is not a repair: prod uses react-select, never react-select/creatable, so there is no production behaviour behind it. It is react-select's own documented pattern drawn as one more option row, which is why it needs no treatment of its own — but it **must be pushed upstream as designed, not measured**. | `designed` | [§D1](README.md) | 3 | [01](../hiring/01-vacancies.design.md) |

| 30 | `Calendar` | New component: an availability-aware month grid. Prod books nothing, so there is no date *picker* to measure — but there is a month grid, and every value here is taken from it. `DateRangePicker` is blue's faithful recreation of the react-datepicker 4.x defaults the product ships, and this reproduces its metrics rather than inventing any: the 1.7rem cell with a .166rem margin and a 3px radius, `__month` at .4rem, the header at 8px 0 over a `--color-gray` rule, `__current-month` at .944rem/500, the day names in `--text-primary`/450, the 32×32 navigation with its 9px border-drawn chevron, and the three day states — selected `--color-blue`/white/13px/600, disabled `--color-gray-light` at opacity .5 and `not-allowed`, everything else untinted. Blue's `DateField`, a 140px text field holding `"Mar 18, 2026"`, is not a substitute. Three things depart from that grid and each is a decision about what the grid *contains* rather than how it is drawn: **the week runs Monday to Sunday**, **leading and trailing cells are blank**, and **it is a keyboard grid** — arrows by day and by week, `Home`/`End`, `PageUp`/`PageDown`, `Enter`/`Space`, a roving tab stop, and a focus ring, where react-datepicker leaves `__day--keyboard-selected` transparent. See the note below. **Must be pushed upstream as designed, not measured.** | `designed` | [§D1](README.md), [§D6](README.md) | 4 | [03](../hiring/03-candidate-database.design.md), [calendar](../hiring/controls/calendar-control.md) |
| 31 | `ToggleButton` | `...rest`, `style`, per-segment `data-testid`, an `aria-label` for the group, and the semantics that make it one control: `role="radiogroup"` over two `role="radio"` segments, a single tab stop, and arrow keys that move and select. Prod's markup is two bare `<button>`s, so a reader met with "24h, button" then "12h, button" is told there are two actions rather than one choice with two answers — and the paint was the only thing saying which was chosen. The focus ring is the other half: the source declares no `:focus` state at all, which is survivable while nothing is expected to arrive by keyboard, and a radio group is. Every painted value is unchanged; the root's `margin-bottom: 20px` and `max-width: 160px` are still prod's, now overridable by the caller that shares a row with a zone picker. | `omission` | [§D2](README.md) | 4 | [slots](../hiring/controls/time-slot-picker-control.md) |
| 32 | `Badge` | `info` and `warning` statuses, solid and outlined. Blue's `Badge` is `ActivityBadge` — a two-state pill on a *user*, green for active and red for inactive — and a hiring funnel is five states. Four paints cannot carry five without one of them lying: `Scheduled` is neither good news nor bad, and painting it green or red is not a lost reinforcement (which is what [reversal 9](README.md) accepted on the login banner) but colour saying something false. The hues are not invented — blue's readme names four and scopes them, *"Status colors (green/yellow/red/cyan) are used sparingly and only for real state (active/inactive badges, form errors, info banners)"* — and these are the palette's other half in `ActivityBadge`'s own treatment. `--status-warning` had no consumer in blue at all before this. One variant does not take the solid treatment literally: blue paints a solid badge white-on-hue, which holds on `#27C79A` and `#D80027`, and on `#FFD02B` white is not a legibility trade-off but an absence of text — so the yellow stays on the fill and the ink becomes `--text-primary`, the same reading its outlined form takes. **Designed: prod has never drawn a badge in either hue.** | `designed` | [§D1](README.md) | 4 | [03](../hiring/03-candidate-database.design.md) |
| 33 | `TextArea` | `trailing` — a node at the end of the **label row**. §25 said this was Phase 5's and had no consumer until then; it was wrong by one phase, because the cancel dialog's character count is exactly it. It goes in the label row rather than inside the field, which is `TextInput`'s answer (§5), because a multi-line field has no unambiguous right edge to pin anything to: the text reaches it on some lines and not others, and the scrollbar takes it when there is one. The label row is the one place above the field whose height does not depend on the value — which is what lets a count, or Phase 5's autosave indicator, appear, change and leave without moving the field beneath it. The label's `margin-bottom: 7px` is zeroed inside the row, where it would otherwise have the layout effect prod's inline `<label>` never gives it, so the field sits at the same y with a trailing node and without one. | `omission` | [§D2](README.md) | 4 | [03](../hiring/03-candidate-database.design.md) |
| 34 | `Table` | `busy`, `hideHeader` and `footer` — the three §18 named and deferred for want of a consumer. `busy` dims the rows and sets `aria-busy` **together**, so a filterable list gets one treatment instead of each screen dimming its own body and forgetting the announcement; the rows stay and stay clickable, and the header is left alone because it did not change. `hideHeader` drops the header for a short grouped list already named by the surface it sits in — prod's tables all carry one, because prod's tables are all one list of one thing. `footer` is the infinite-scroll load-more indicator, which prod renders *inside* the table (`.loadNextTableIndicator`, centred) in the row position the next page will occupy, rather than as a control beneath it — which is what makes the page's arrival replace it rather than push it. | `omission` | [§D2](README.md) | 4 | [03](../hiring/03-candidate-database.design.md) |
| 35 | `TextInput` | `wrapperStyle` — style for the field's own box, which `...rest` and `style` cannot reach because they address the `<input>`. `Select` (§21) and `SearchInput` (§26) both grew this already and in the same words: *a caller placing this field in a row is sizing that box, not the input inside it*. The three are siblings and disagreed only because they were measured separately, which is §25's observation about `TextInput` and `TextArea` arriving at the same field. The criteria filter's value control is the call site — a `Select` for a scale and a `TextInput` for a number, in one flex row, and only one of the two could say how wide it was. | `omission` | [§D2](README.md) | 4 | [03](../hiring/03-candidate-database.design.md) |
| 36 | `Select` | `closeMenuOnSelect`, react-select's own prop name and its own default (`true`, for multi as much as for single). Blue closed the menu only when `!isMulti`, which is not something measured off prod — prod passes no such prop anywhere — but a divergence from the library blue recreates. It is §21's move a third time: **toward** react-select rather than away from it. Left open, a multi-select covers whatever sits under it with a list that `hideSelectedOptions` has often just emptied; on the candidates filter bar, picking the one position hid the category row behind an open `No options`. Passing `false` restores blue's behaviour for a caller that wants it. Note this changes one Phase 3 screen: `VacancyDialog`'s category picker now closes when a category is chosen. | `omission` | [§D2](README.md) | 4 | [03](../hiring/03-candidate-database.design.md), [01](../hiring/01-vacancies.design.md) |

| 37 | `Chip` | `trailing` — a node between the label and the cross — and `removeTestId`. Blue draws `Chip` only inside `Select isMulti`, where the token is a label and a cross and nothing else, so its label span is `overflow: hidden` + `text-overflow: ellipsis` + `white-space: nowrap`, and it is the only slot there is. A screen showing a chosen thing *with a value set on it* cannot use that slot: a control placed there is clipped, and one that opens a list is cut off at the chip's own edge — which is `Card`'s `clip` problem ([reversal 6](README.md)) one level down, answered the same way, by putting the thing that opens outside the box that hides it. The criterion chip is the call site. It is also why §20's conditional pointer cursor needed a third reading: this chip *can* be removed, so `Chip` paints `cursor: pointer` across the whole token, but only the cross and the value control are clickable and the name between them promises nothing — so the caller turns it off, which is §18's rule on `Table`'s rows at chip scale. `removeTestId` is the smaller half: the cross is drawn by the component, exactly as §16's `nameTestId` / `menuTestId` and §21's `chipTestId` are. One painted value changes, and only when `trailing` is given — the chip centres its children instead of stretching them, because everything blue puts in a chip is one line of 14px text and `stretch` and `center` are identical until something taller arrives. | `omission` | [§D2](README.md) | 5 | [04](../hiring/04-candidate-card.design.md) |
| 38 | `Button` | `as`, which is `'button'` or `'a'`. Blue measured a `<button>` because prod has no control that navigates — every download it offers is a row in a table — so this is §18's `rowHref` gap on a different component, and `Table` already makes the identical swap for a row that does navigate (`const Row = href ? 'a' : 'div'`). The CV's View and Download are navigations wearing a button: routing them through `onClick` gives up middle-click, copy-address, open-in-new-tab and the browser's own `download` handling, and no amount of script gets any of it back — `hiring-candidate-card.spec.ts` asserts three of the four. An anchor drops `type` and `disabled`, which it does not have; a `disabled` anchor still paints disabled and takes `aria-disabled`, so the treatment cannot say one thing while the accessibility tree says another. Everything else — the paint, the hover, the preloader, `aria-busy` — is untouched, plus `text-decoration: none`, which a `<button>` never needed. | `omission` | [§D2](README.md) | 5 | [04](../hiring/04-candidate-card.design.md) |
| 39 | `Chip` | `leading`, `removeDisabled` and `removeDescribedBy`. All three are the same gap §37 found from the other side: blue draws `Chip` only inside `Select isMulti`, where a token is a label and a cross, nothing ever precedes the label, and the cross always works. **`leading`** is `trailing`'s mirror — a node before the label, which the scale editor's chip needs for its drag handle. Putting the handle in `trailing` was the alternative and it is the wrong one: it would seat a control that *picks the value up* immediately beside one that *deletes it*, and blue's chip already has a grip edge to lead from in its 7px `--color-blue` left border. **`removeDisabled`** blocks the cross without taking it away — `aria-disabled` and still focusable, never the `disabled` attribute — which is §22's rule on `Popover`'s rows applied to the control `Chip` draws for itself; a value that has been assessed against may not be removed, and a cross that vanished would be indistinguishable from a bug. **`removeDescribedBy`** is what makes that readable: the cross keeps `Remove {label}` as its *name* and the reason is a *description*, drawn by the consumer where there is room for a sentence. Naming it the reason instead would read the same sentence twice, which is the thing Phase 5 discovered about native `title` ([reversal 2](README.md)) and the reason this prop exists rather than a `removeReason` string. | `omission` | [§D2](README.md) | 6 | [06](../hiring/06-libraries.design.md) |
| 40 | `ConfirmDialog` | `...rest`, `style`, `acceptTestId` / `declineTestId`, and §8's dialog semantics — `role="dialog"`, `aria-modal`, a real `aria-labelledby` on the title, focus trapped while open, focus returned to the opener on close, and `Escape`. Blue destructures eight props and forwards none, so `data-testid` reached neither the panel nor either button, and it draws both buttons itself so a caller had no way to tag them: §2's gap and §37's `removeTestId`, on the second dialog. The keyboard half is §8 verbatim — blue has *two* dialog shells and prod's overlays are plain `<div>`s that close only by click, so both were measured with no roles, no trap and no `Escape`, and §8 happened to fix only the one Phase 1 needed. The implementation moved into `useDialogFocus.js` rather than being copied, because a second copy is how the two shells drift apart. One more thing changes and it is too small to number but too silent to leave out: the close cross gets `type="button"`, which `Modal`'s already had — without it the control submits any form it is nested in. What is **not** changed: the scrim still refuses to close on click, and the accept button is still primary blue even on a destructive confirmation — both are blue's own, and the category delete adopts them. | `omission` | [§D2](README.md) | 6 | [06](../hiring/06-libraries.design.md) |
| 41 | `ConfirmDialog` | `busy` and `closeOnAccept`. Blue dismisses the moment accept is pressed and has no notion of a request being in flight, which is true to prod: every confirmation there starts work nobody waits on the result of. Ours await one. `busy` paints the accept button's preloader and blocks both controls; `closeOnAccept={false}` leaves the dialog standing so the caller closes it on the *outcome* rather than on the click. It is `InfoBanner`'s §24 in a different shape — *prod's banners report a state and go away when the state does; one reporting an event that already happened cannot* — and, like §24, the default is blue's behaviour unchanged. The scale reorder was the first call site: accepting it saves the criterion, which can come back with a duplicate name belonging to the form behind this dialog, so dismissing on the click would flash that form up mid-flight and take it away again. `desktop 6` added the second, and it is the shape the props were really for — the candidate delete ([03 §11](../hiring/03-candidate-database.md)) stands until the server answers, because the next thing that happens on the candidate card is a navigation, and a dialog that dismissed on the press would leave the screen blank and unexplained for as long as the request took. The category delete passes neither and gets blue's dismiss-on-accept, which is right for it. | `omission` | [§D2](README.md) | 6 | [06](../hiring/06-libraries.design.md) |

| 42 | `BoardCard` | New component. Prod has no kanban, so there is no card to reproduce — but this is a *composition* of two things blue draws rather than an invention, and the split between them is the point. The surface is `Card`'s (§12): `--surface-card`, a 1px `--border-default` hairline, `--radius-l`, no shadow. The hover is `NavigationCard`'s, measured: the border goes `transparent` as `--shadow-card-hover` paints, `scale(1.01)`, over `--transition-card-hover`. §12 **refused** that hover on the grounds that it "belongs to `NavigationCard`, which is a control; painting it on a static container promises a click that is not there" — and this card *is* a control, so the same sentence admits it. The two are one rule read twice. What is genuinely designed is the state prod has no analogue for at all: **held**, `--action-primary` border over `--shadow-popover` and `translateY(-1px)`, which only a keyboard drag ever renders, because a card dragged with a pointer is not drawn and what lifts under the cursor is the browser's own drag image. Two smaller calls come with it. **`Space` picks the card up rather than activating it** — the one `role="button"` in this app that does not — because a board whose cards activated on `Space` could not be dragged with a keyboard, and the drag is the screen's whole purpose; `Enter` opens it. And the **past** date recedes `--text-tertiary` → `--text-secondary` rather than sharing one ink: see the note below. **Must be pushed upstream as designed, not measured.** | `designed` | [§D1](README.md), [§D6](README.md) | 7 | [05](../hiring/05-board.design.md) |
| 43 | `BoardColumn` | New component, and the shape is one blue already draws twice. The column is a `Card` (§12) whose body is a `--surface-sunken` well holding white cards — `AppShell`'s own arrangement one level down, and blue's single answer to "a container of things": a recessed ground with white panels on it. The head is `Card`'s title row, and the name is a real `<h2>` at headline-6 in **sentence case**, not Meridian's uppercase caption: blue's content rule spends its one uppercase on `PageTabs`, which the narrow board already uses (§45). The designed part is the drag mechanics, which nothing in blue has: the column converts a pointer position into a **slot index** and hands it back, and that index counts **cards only** — the placeholder carries no `data-board-card`, so the gap it opens never counts itself as a slot, which is what keeps the arithmetic stable while the gap moves around under the pointer. The placeholder itself is the well showing through, outlined 1px dashed in `--action-primary`; a filled one would be a second object on a board that must only ever show one mark. Which columns exist, what a slot means, and what a drop writes are all the caller's. **Must be pushed upstream as designed, not measured.** | `designed` | [§D1](README.md), [§D6](README.md) | 7 | [05](../hiring/05-board.design.md) |
| 44 | `Icon` | `FlagIcon`, registered in the dispatcher. This is §9's position exactly, on a different glyph: prod is a time tracker and flags nothing, so there is no mark to measure, and blue's icon rules are explicit enough to draw one to (geometric, filled, `currentColor`, 12–24px, viewBox matching the intrinsic size, no icon font). What forces it is that the rules admit no exception — *"every icon is a hand-authored inline SVG React component"*, *"no PNG/raster icons and no emoji are used as icons anywhere in the app"* — and Meridian's missing-conclusion mark was the dingbat character `⚑`. The glyph picks no hue; the caller paints it, and the board paints it `--status-warning` rather than the tracker blue the token map would have mapped Meridian's amber onto. That is the one row in that table which must not be taken mechanically — see the note below. | `packaging` | [§D2](README.md) | 7 | [05](../hiring/05-board.design.md) |
| 45 | `PageTabs` | The tab row made a tab row, plus an object form. Blue's tabs are `<a href="#">` whose click handler calls `preventDefault` and swaps a panel: a screen reader announces them as links that go nowhere, none of them can be reached or moved between by keyboard, and there is no `aria-selected` to say which is chosen — the paint was the only signal, which is §31's finding on `ToggleButton` and §21's on `Select`, a third time. Prod gets away with it because prod's tab rows are three words on a members screen that nothing arrives at by keyboard, and the narrow board makes this **the control that chooses which column is shown**. They are `role="tab"` buttons inside a `role="tablist"` now, with `aria-selected`, `aria-controls`, a single tab stop, arrow keys plus `Home`/`End`, and `--shadow-focus-input` — the source declares no `:focus` state at all, which is §31's other half. Selection follows focus, because the panel is already rendered and making a keyboard user press twice for what a pointer does once is the thing the pattern exists to avoid. The object form (`value` / `label` / `testId` / `controls`) sits beside prod's `string[]`, which is §18's shape on `Table` and for §18's reason: the pair blue measured is what a hand-written kit screen passes. Both forms still work and every painted value is untouched. There is deliberately **no `count` prop** — a count composes into the `label` node, and a strip that grew one would then need a badge for it, and an icon. | `omission` | [§D2](README.md) | 7 | [05](../hiring/05-board.design.md), [03](../hiring/03-candidate-database.design.md) |

| 46 | `BookingLayout` | New component: the public shell, for the two screens a candidate reaches with no session. Prod has no public-facing surface of any kind, so there is nothing to measure — but this is `AuthLayout` (§11) with two things changed, and both are the same fact about whose page it is. **No card**: `AuthLayout` is one 480px panel because a login form is one panel, and these screens compose their own `Card`s, so the shell supplies the well, the column and the rhythm and nothing else. The column is **880px**, which is what two `1fr 1fr` picker cards need to sit side by side. **The wordmark is the caller's**: `AuthLayout` draws Teammerly's own mark because the person reading it is signing in to Teammerly, and a candidate booking with Acme is looking at Acme's page — so the name is content, and the shell takes it at blue's headline-4 step in `--text-primary`. `wordmarkTestId` is §16's `nameTestId` and §21's `chipTestId` a third time: the shell draws the node, so only the shell can tag it. Everything else is `AuthLayout`'s deliberately — the `#f8fafc` well, the 40px/16px page padding, the 30px gap under the wordmark — because a candidate who books and then returns through the link in their invite must land on the page they recognise. One value departs: it is top-aligned where `AuthLayout` centres, because a booking page is taller than the viewport and centring would push the vacancy title off the top. **Must be pushed upstream as designed, not measured.** | `designed` | [§D1](README.md), [§D6](README.md) | 8 | [02](../hiring/02-booking-page.design.md), [07](../hiring/07-manage-booking.design.md) |
| 47 | `FileInput` | New component. Nothing in blue accepts a file: prod uploads only an avatar, through a cropper of its own, and offers every document as a row in a table. So the *control* is designed — but it is designed as `TextInput`'s sibling, and every value in it is `TextInput`'s: the same 44px field box, the same label geometry, the same focus and error treatments, and the same absolutely-pinned 8px message slot that `hint` shares with `error` (§4). A CV field in a column of text fields therefore sits at the same height on the same baseline with the same ring. What a file field has to add is one thing: a leading affordance where the value would start, in blue's neutral `Button` treatment at 32px — the height `IconButton` (§10) already takes inside a 44px field. Two decisions rather than repairs, both about what a file control *is*. **The `<input type="file">` is the whole hit area**, laid transparently over the row rather than hidden beside it: a hidden input with a `<button>` trigger gives one field two tab stops and paints the focus ring on the half that is not focused, and forwarding the click from a `<div onClick>` is the pattern §21, §22 and §26 all had to undo. Here the browser opens the picker on click, on `Enter` and on `Space` with nothing scripted, and the focus state is read off the input and painted on the row. **There is no clear control** — yellow drew a trailing cross, and it has no outcome worth an affordance: on the booking form a CV is required, so clearing it only produces an invalid form that re-choosing would fix anyway, and on the manage page the chooser exists to *replace* a CV the API has no way to remove. It would also have to sit above the input, which is the hit area the control is built out of. **Must be pushed upstream as designed, not measured.** | `designed` | [§D1](README.md), [§D6](README.md) | 8 | [02](../hiring/02-booking-page.design.md), [07](../hiring/07-manage-booking.design.md) |

| 48 | `Table` | `minHeight` in place of prod's flat `height: 70`, 8px of vertical padding, and the header label truncated the way every body cell already was. All three are the same omission: **prod's every cell holds one line**, so blue measured a table that never had to contain anything taller or narrower than itself. Ours hold two — a vacancy title over its category chips, a candidate name over an email — and a fixed height does not clip that content, it lets it paint over the row beneath. `minHeight` is identical to `height` for every row prod has, so the measured 70px is untouched; the padding is only ever visible on a row that has grown, because `box-sizing: border-box` keeps a one-line row at exactly 70px. The header is the third: body cells carried `overflow: hidden` from the start and the header carried nothing, so a column narrower than its own label painted straight over its neighbour. It needs a child element to truncate in, not just `overflow` — an anonymous flex item is not a line box, which is why the ellipsis never appeared on the body cells either. | `omission` | [§D2](README.md) | 8 | [01](../hiring/01-vacancies.design.md), [03](../hiring/03-candidate-database.design.md) |
| 49 | `ToggleButton` | `width: '100%'` beside prod's measured `max-width: 160px`. In prod this root is a block in a stacked form, so it fills its parent and the cap is the only thing limiting it — which means `max-width` alone was a faithful measurement of a value that was never doing the work on its own. Put in a flex row, the same declaration collapses the control: a flex item sizes to content, both segments are `flex-basis: 0`, and the whole thing shrinks to the width of the string `24h12h` with the active segment's 36px pill painting over its neighbour. The booking page's format toggle shares a row with a zone `Select`, which is the first flex row prod's version has ever been in. Restoring the block behaviour changes nothing anywhere the cap already decided the width. | `omission` | [§D2](README.md) | 8 | [02](../hiring/02-booking-page.design.md) |
| 50 | `Popover` | The item label no longer wraps; only its `description` does. §22 added the description and switched the whole row to `white-space: normal` so it could, which took the label with it — `Delete vacancy` broke across two lines in a 160px menu while the sentence beneath it wrapped correctly. The label was always meant to be the row, and the description a second line under it. | `omission` | [§D2](README.md) | 8 | [01](../hiring/01-vacancies.design.md), [06](../hiring/06-libraries.design.md) |
| 51 | `MenuDrawer` | `top`, `...rest` on the panel, an accessible name and a test id for the close button, focus moved in on open and returned to the opener on close, `Escape`, and `inert` while shut. The `top` is the entry's reason: blue pins the panel and its scrim at `top: 60px`, which is not a drawer measurement but `--layout-navbar-height-mobile` written as a number, so above 1200px — where this shell's navbar is 80px (§14) — both covered the last 20px of the header they hang from. The default now reads the shell's own switch out of `base.css` rather than naming a third value, and `top` overrides it. The rest is the same omission in the same place: blue's drawer forwards nothing, its close button is an unnamed icon, nothing moves focus into a panel that has just covered the page, `Escape` does not leave it, and everything inside it stays tabbable while it is translated off-screen. `AppShell` needed all of it the moment its rail *became* this drawer and got it there; this is the same treatment on the component that lends it the geometry — three rules rather than `Modal`'s four, because like the rail this is a panel a reader may Tab out of. | `omission` | [§D2](README.md) | desktop 4 | [03](../hiring/03-candidate-database.design.md) |
| 52 | `TableToolbar` | `tabsLabel`, `tabsTestId`, `searchLabel`, `searchTestId`, `...rest` on the row, and the object form of `tabs` in the types. A composition that draws two controls and gives no way to address either: §45 gave `PageTabs` a `label` and an object form and this swallowed both, and the `SearchInput` it renders takes neither a name nor a test id. Blue's own list screens never had to care — their tab rows are three words nothing arrives at by keyboard, and their search is the only field on the page. Nothing here is a new number for `PageTabs` or `SearchInput`: both already take these props, and this is the wrapper learning to pass them. Same shape as §16, §21, §37 and §40. | `omission` | [§D2](README.md) | desktop 4 | [03](../hiring/03-candidate-database.design.md) |

| 53 | `Pagination` | New component. **Nothing in blue pages a list**: prod's own list screens all load the next page inline (`ProjectsTable`, `ToDosTable`, `ClientsTable` → `.loadNextTableIndicator`, which is what §34's `footer` reproduces), so there is no strip, no arrows and no current-page treatment to measure. The candidate database wants one because [reversal 1](README.md) came back the other way — the count line answers *how many match* and always did, and what the load-more row carried badly is **position**: *which twenty-five of a hundred and twenty-eight am I looking at* has no answer in a scroll bar over an accumulating list. Every painted value is taken from blue's *small* controls rather than invented: the 36px target `IconButton` and `Calendar`'s navigation both use, `--radius-s`, a 1px `--border-default` hairline, and the current page filled `--color-blue` with `--text-on-accent`, which is exactly how `Calendar` paints a selected day. The arrows are blue's single `ArrowIcon`, rotated, because the set has no left/right pair and `Calendar` already rotates this one. Three behaviours are the component's own and are why it is a component: the `…` compression, which is `aria-hidden` because "there are pages you cannot see" is not a fact a reader can act on; `aria-current="page"`, which is the statement the fill is only the paint of; and **drawing nothing at one page** — a control offering one choice is not a choice, which is the rule the candidate scope strip already follows (03 §08.41). Presentational: it knows the page, the count and a callback, and nothing about what is being paged. **Composed from measured parts** — the values are blue's, the arrangement is ours. | `designed` | [§D1](README.md), [§D6](README.md) | desktop 5 | [03](../hiring/03-candidate-database.design.md) |
| 54 | `Toast` / `ToastHost` | New components. Prod uses `react-toastify`, which blue did not recreate, so `InfoBanner` had been standing in for it since Phase 1 — a fixed-position banner, which §7 and §24 were both written for. That held while a screen had exactly one thing to confirm and it could live in the flow: [reversal 4](README.md) put the candidate card's under its `PageHeader` and it is still there. The candidate database has three, and a panel that pushed the table down on each one would move the list under the hand working it. The surface is `InfoBanner`'s **unchanged** — the same 1px status line over the same 10%-of-status fill, the same 16px mark, the same `--font-size-xs` in `--text-tertiary`, the same `IconButton` dismiss (§10, §24). What is new is the three things a banner has never had to do: it **arrives and leaves**, 0.3s ease-in-out both ways, which is `--duration-hover` and `--ease-standard` and therefore every other motion in blue; it **goes away by itself**, holding the timer while the pointer is over it or focus is inside it, because a message somebody is reading must not be taken away mid-sentence; and they **stack**, oldest at the top, which is the whole argument for a host — a single fixed slot loses a message when a second action is taken before the first has faded. The **queue is the caller's**, deliberately: this pair draws and times what it is given, exactly as `AppShell` takes `menuOpen` rather than owning its drawer. Only the motion and the stacking are genuinely without precedent; the surface is measured. | `designed` | [§D1](README.md), [§D6](README.md) | desktop 5 | [03](../hiring/03-candidate-database.design.md) |
| 55 | `Popover` | `portal` (default `true`) and the placement that comes with it: `position: fixed` in `document.body`, coordinates read off the trigger's own rectangle, re-read on `scroll` (capture, so an inner scroller counts) and `resize`, **flipping upward** when the panel would run off the bottom of the viewport, and outside-click reading the panel as well as the trigger because the panel is no longer a descendant of it. Blue positions the menu `absolute` inside the trigger's box, and that is a correct measurement: prod opens this from a table as tall as its content, on a page that scrolls. Every list screen here has a scroller instead, and the candidate database's Actions column put the menu in one — so the last rows' menus were clipped, which is to say the rows nobody can reach are the ones at the bottom of the page. `overflow: visible` on the cell does not fix it; the ancestor doing the clipping is the scroller. It is the same class of thing as the note on §48–§50 — a value measured correctly at the only geometry prod is ever seen in — and it is also the trap the archived-criterion note already called *general*: **any consumer that dims, transforms or filters a container holding a `Popover` will reproduce it**, and that note named portalling as the durable fix. This is it. The row's font size is carried across explicitly, because a portalled row inherits `document.body`'s instead of its trigger's. Selecting a row now `stopPropagation`s, which is the half of portalling that is not about pixels: **a portal leaves the DOM and not the React tree**, so a click inside the panel still bubbles to whatever rendered the `Popover` — on a table row that is the row's own handler, and choosing `Cancel interview` would have called the interview off *and* opened the record it belongs to. `portal={false}` restores blue's behaviour for a menu inside a `Modal` or a `MenuDrawer`, which wants to stay in the trap it was opened from. | `omission` | [§D2](README.md) | desktop 5 | [03](../hiring/03-candidate-database.design.md), [01](../hiring/01-vacancies.design.md), [06](../hiring/06-libraries.design.md) |

### A note on §48–§50 and the width nobody had looked at

All three landed together, from one bug report, and every one of them is the same shape: a value
blue measured correctly at the only width prod is ever seen at, doing something else at a width it
has never been. Prod is an internal time tracker on a desktop; nothing in the measurement is wrong,
and nothing in it was tested below about 1000px.

That makes them `omission` rather than a disagreement with blue — [§D2](README.md)'s case exactly,
and worth stating plainly for the upstream push, which should carry all three as *"correct at the
measured width, and here is what it does at the others"* rather than as corrections.

**A fourth fault from the same report is not a ledger entry, because it is not blue's.** The
hiring settings screen dimmed an archived criterion by putting `opacity: .7` on the row element.
`opacity` below 1 creates a stacking context, so the actions `Popover` inside that row had its
`z-index: 1000` resolved against the row instead of against the page, and its menu painted
underneath every row that followed it — on the narrow layout, which is the only layout where those
actions *are* a menu. The fix is to dim the row's content rather than the row, which also says the
right thing: the badge naming the state and the controls that undo it are the two things on an
archived row that must stay legible. Recorded here rather than in the app alone because the trap is
general — **any consumer that dims, transforms or filters a container holding a `Popover` will
reproduce it**, and the durable fix, if it ever earns one, is for the menu to portal out.

### A note on §46 and the wordmark that is not the product's

`--amber-500` was one of the two token-map rows still needing a human call, and it closes here the
way `--tracker` closed in Phase 7 — by the thing that carried it turning out to mean something the
mapping did not.

Both remaining uses were one element: a 7px amber square after the organization's name, on each of
the two public pages. The map says to confirm each site is a warning before sending it to
`--status-warning`, and this one plainly is not — it is decoration on a customer's brand name, and
painting it in the hue blue scopes to *"real state"* would be the `--tracker` mistake again.

But the interesting half is *why the square was there*, because that decides whether anything
replaces it. Yellow had **no logo file and said so** — *"There is no logo file; never draw one"* —
so its own wordmark was typography plus an amber pin, and the organization's name on these two
pages was drawn to match it. The pin was an imitation of a product mark that did not exist.

Blue ships the real one. `Sidebar` inlines it and `AuthLayout` has drawn it since Phase 1. So the
imitation has nothing left to imitate, and the alternative — lending Teammerly's actual mark to a
customer's name — is worse than dropping it. **The square is deleted, not remapped**, and the name
takes blue's headline-4 step in `--text-primary`, which is the ink blue's own wordmark sets
"merly" in. This is exactly how Phase 2 closed `--fs-21` on the sidebar wordmark: once blue
supplied a real mark, there was no size left to get wrong.

### A note on §42 and what "designed" is allowed to mean

Ten entries in this file are `designed` rather than `omission` or `packaging`. Five of them belong
to the two surfaces with no production counterpart of any kind — the board, and the public pages —
which is not an accident, but it makes the kind worth pinning down before the upstream push has to
defend it. This is the whole list; everything not on it is a gap in the measurement.

`designed` has meant three different strengths, and they are not equally hard to justify:

| Entry | What was missing | What it was drawn from |
|---|---|---|
| §7 `InfoBanner success` | prod has no green banner | its own palette, at the 10%-of-status tint its other two already use |
| §11 `AuthLayout` | prod has no signed-out screen | the well, the card, the headline scale — all blue's, recomposed |
| §24 `InfoBanner onDismiss` | prod's banners report a state, so none needs putting away | blue's own Modal-close treatment (§10), at the banner's own line colour |
| §29 `Select allowCreate` | prod uses react-select, not creatable | the library's own documented pattern, drawn as one more option row |
| §30 `Calendar` | prod books nothing | **blue's own `DateRangePicker`**, which is its recreation of the react-datepicker the product ships |
| §32 `Badge info`/`warning` | prod's badge has two states, a funnel has five | the palette's other half, in `ActivityBadge`'s treatment |
| §42 / §43 `BoardCard` / `BoardColumn` | prod has no kanban | `Card` (§12), `NavigationCard`'s hover, `AppShell`'s well-and-panel arrangement |
| §46 `BookingLayout` | prod has no public screen | `AuthLayout` (§11), minus its card and its claim on the wordmark |
| §47 `FileInput` | prod accepts no file but an avatar | `TextInput`'s field, label, focus, error and message slot, plus `Button`'s neutral paint at `IconButton`'s in-field height |
| §53 `Pagination` | prod's lists all scroll, so nothing pages one | blue's small controls — `IconButton`'s 36px target, `Calendar`'s navigation chevron and its selected-day fill |
| §54 `Toast` / `ToastHost` | prod uses react-toastify, which blue did not recreate | `InfoBanner` (§7, §24) entire, plus blue's own `--duration-hover` / `--ease-standard` |

Every row's right-hand column is the same claim: *the values are blue's, the arrangement is ours.*
That is the strongest form the label can take, and it is the form the push should make in each case
— **"composed from measured parts"**, not "invented". The genuinely unprecedented parts are smaller
than the components are, and naming them precisely is what keeps the push from over-claiming:

- **§42 / §43** — the **held** card state, the **travelling placeholder**, and the **slot index**
  that counts cards and not gaps. Nothing in blue does any of those, because nothing in blue drags.
- **§47** — the **input as its own hit area**. Every painted value is `TextInput`'s; what has no
  precedent is the arrangement that makes a file field one control instead of three, and that is a
  keyboard and focus argument rather than a visual one.
- **§46** — the **880px column**, and nothing else. Its well, padding, rhythm and type are
  `AuthLayout`'s, which were blue's already.
- **§53** — the **`…` compression** and the decision to draw nothing at one page. The cell, the
  target size, the hairline and the selected fill are all blue's, and the arrow is blue's own
  glyph turned ninety degrees.
- **§54** — the **motion and the stack**. Every painted value is `InfoBanner`'s and both durations
  are tokens; what has no precedent is that a notification in this system can now arrive, queue and
  withdraw itself, which is a behaviour rather than a treatment.

### A note on §44 and the one row the token map must not be taken on

The token map carries Meridian's `--tracker` onto blue's `--color-tracker-blue`, on the reasonable
grounds that *"both systems reserve a tracker hue"*. There is exactly one use of `--tracker` in the
tree and it is the board's missing-conclusion mark, where the mapping is wrong in both directions.

Meridian's `--tracker` was **amber**, and the design spec says why the mark used it: *"Amber is
Meridian's reserved warning hue and this is precisely a guarded state."* The token's *name* was the
coincidence; its *meaning* on this element was warning. Blue's `--color-tracker-blue` is `#2AA7FF`
and blue is unusually explicit that it belongs to one thing — *"used only by the floating time
tracker widget — intentionally different from the primary blue, not a mistake to normalize away"*.
So the mechanical mapping would paint a warning in the one hue blue has already spoken for, on a
product that has no tracker at all.

`--status-warning` is the mark's colour, which is what the readme scopes to *"real state"* and what
§32 already established this app may reach for. The row is closed in the map as **not remapped**,
the way `--fs-27` and `--fs-21` closed in Phase 2 — by the thing that carried it turning out to mean
something else.

### A note on §42 and the fourth ink, one more time

[Reversal 7](README.md) closed in Phase 6 with *"no use left"*, and that was true: it counted
`--text-faint` in `apps/web`, and Phase 6 spent the last one. Meridian's `BoardCard` had a fifth,
inside the design system rather than in a screen, and Phase 7 met it after the closure.

It is also the one site where the collapse would have erased a distinction rather than a nuance,
and the reason is arithmetic. Everywhere the reversal has been applied so far, something receded
**from `--text-primary`** — a past interview's row in My interviews, a character count, a history
timestamp, a blocked control — so dropping to `--text-secondary` still left a step. On this card the
date is *already* receded: Meridian drew it `--text-muted` and the past variant `--text-faint`, two
of its lower three. Map both mechanically and they land on the same ink, and 05 §05.18's *"the date
reading as past"* becomes nothing at all.

Blue has three inks, not two, and the order is `--text-primary` → `--text-tertiary` → 
`--text-secondary` — tertiary is `#54595E` and darker than secondary's `#64748B`, which the names
invert. So the card reads primary / tertiary / secondary down its three lines, and a past date steps
tertiary → secondary, landing on the level the CV footnote already occupies. No fourth ink, no lost
distinction, and the pattern is unchanged: **recede by one level.** Phase 6 needed `opacity: .6`
alongside it because its site was a *control*, where `--text-secondary` is also what an available
one paints; a date is not a control and needs nothing.

### A note on §22 and reversal 2

`Tooltip` → native `title` is [reversal 2](README.md), and the record said the phase that hit it
had to choose per site between visible text, a visually-hidden node wired to `aria-describedby`,
and an accepted regression. **The vacancies menu takes visible text**, and it is the first of the
three sites to be settled.

Native `title` was never available here. It is not keyboard-reachable in any major browser, and
the blocked-delete row exists *because* a missing action is indistinguishable from a bug — a
reason nobody can read is the same failure one step later. A bubble rendered on hover cannot be
an `aria-describedby` target that always resolves either, which is the property yellow's pairing
of `Menu` and `Tooltip` was built around.

So the reason is simply drawn in the row, under the label, at `--font-size-xs` in
`--text-secondary`. It is in the accessibility tree at all times, it is the row's
`aria-describedby`, and it needs no component blue does not have. Phases 5 and 6 have the other
two sites and are not bound to this answer — a menu row has somewhere to put a sentence, and an
inline icon may not.

**Phase 5 took the third answer — the accepted regression — and it cost almost nothing.** The
candidate card's one bubble is on the cancelled badge, and what that bubble drew was already the
badge's accessible **name**: `cancelledTooltip` is the whole fact, who and when and why, while
`cancelledBadgeLabel`'s `Cancelled by Pat` is only what is painted. The `aria-label` stays, the
bubble goes, and nothing replaces it.

Native `title` is the case reversal 2 did not anticipate, and it is written down here because
Phase 6 meets it again. On an element that *already has a name*, `title` is not a second chance
at the name — it becomes the accessible **description**, so a reader would be given the same
sentence twice, once as the name and once after it. Together with being unreachable from a
keyboard in every major browser, that makes it cost a reader something and give nobody anything.

What makes this cheap rather than a real loss is that the screen draws the fact anyway: the
scheduling history a few rows below lists the cancellation as a real row, with the actor, the
timestamp and the reason. The vacancies menu had no such place, which is why it had to draw one.
Reversal 3 remains the third site's warning — on `BoardCard` the tooltip *is* the badge's name,
so Phase 7 needs `aria-label` there and never `title`.

### A note on §14 and `MenuDrawer`

The shell's drawer is `MenuDrawer`'s treatment — 340px, `top: var(--layout-navbar-height-mobile)`,
`--shadow-drawer`, `translateX(105%)`, `var(--duration-hover)`, and a full-bleed scrim — applied to
the node that is already holding the navigation, rather than to a second copy of it inside a real
`MenuDrawer`. `MenuDrawer` renders its own fixed panel around whatever it is given, so consuming it
here would put two of every nav row in the document, and with them two of every `data-testid` and
two of every `aria-current`. `MenuDrawer` itself is untouched and stays blue's component for the
drawers that are not the nav rail.

### A note on §30 and the week start

react-datepicker runs its week **Sunday to Saturday**, and blue reproduces that: `DateRangePicker`
draws `Su Mo Tu We Th Fr Sa`. `Calendar` runs Monday to Sunday. That is a departure from blue's
measurement, so it is written here rather than left to be found.

It is the **content/language** split ([§D6](README.md)) rather than a layout disagreement, and
blue's own note is the evidence: the day names sit in the paragraph listing *"everything below that
CustomDateRangePicker.module.scss does NOT set"* — the react-datepicker default, *"reproduced
rather than redesigned"*. Prod never made this choice; it inherited a library's locale default, the
same way it inherited English month names. Nobody would read adopting blue as adopting English as a
design decision, and week start is that class of thing.

Hiring did make the choice, wrote it down — *"The week **always runs Monday to Sunday**. This never
varies by locale"* ([calendar-control §03.12](../hiring/controls/calendar-control.md)) — and tests
it: `monthMatrix` and `WEEKDAY_INITIALS` in `@devscribed/validation`, under TC-HCAL-UNIT-01. The
component is handed its `weeks` rather than deriving them, so the week start is the **consumer's**
either way; adopting Sunday would mean rewriting a tested validation helper and a functional
requirement under cover of a reskin, which is not what [§D1](README.md)'s *"including layout"*
clause is for. D1 moved a sidebar from 252px to 290px; it does not re-decide what a date grid means.

The same reasoning covers blank leading and trailing cells (§04.15), where react-datepicker greys
the adjacent months' numbers: a day number in the grid looks selectable, and every one of these is
outside the booking window.

### A note on §32 and the fifth status

Phase 3 declined `Badge` for the vacancy's category chips and built `Chip` instead, on the grounds
that *"blue's `Badge` is `ActivityBadge`, two status hues and nothing else"* (§20). §32 is the same
observation reaching the opposite conclusion, and the difference is worth stating: a category is
**not a status**, so it wanted a different component and blue already drew one. An application's
status **is** a status — the thing `Badge` is for — and there are simply more of them than prod has
users' states. So the component is right and its palette was short.

The mapping is in [03 design](../hiring/03-candidate-database.design.md) and its rule is *hue is
direction, fill is finality*: only the two terminal states are solid, which is what keeps blue's
"sparingly" true when the badge is repeated down a table. It also corrects an inversion Meridian
had — `Offer` was the outlined variant of `Passed`, so the strongest status in the funnel was drawn
with the least emphasis.

### A note on reversal 2's last two sites

[Reversal 2](README.md) counted three `<Tooltip>` call sites and said each phase that hit one had
to choose between visible text, a visually-hidden node wired to `aria-describedby`, and an accepted
regression. Phase 5 called itself the second of three and left "the last site" to Phase 6. **Phase 6
holds two**, not one — the count of three was of the component's uses, and the vacancies menu that
§22 answered was a `Menu` `tooltip` *prop*, not one of them. Both are settled here, and they take
**different answers**, which is the point of the reversal being per-site:

**The criterion's blocked Delete takes the accepted regression, and it costs nothing** — Phase 5's
answer, for Phase 5's reason. `criterionDeleteBlockedMessage` is already the button's `aria-label`;
`hiring-libraries.spec.ts` asserts exactly that (`toHaveAccessibleName('Archive this instead — it
has 1 assessment')`), so the bubble was drawing a sentence a reader already had as the control's
name. Adding `title` on top would make it the *description* and read it twice. What makes the loss
cheap is the same test as Phase 5's: **the screen draws the fact anyway.** The count the message
interpolates is on the row's second line, and the alternative the message names is not a sentence
at all but the `Archive` button sitting immediately to its left. A pointer user is being told to
press the control their cursor is already next to.

**The same row's narrow layout takes visible text** — Phase 3's answer, because below 768px those
three buttons become a `Popover` and a menu row has nowhere to put a sentence except in itself.
§22's `description` slot is already there; the row keeps `aria-disabled` and its place in the
keyboard walk. One site, two answers, chosen by which control is on screen — the reversal did not
anticipate a site that changes shape, and this is what that looks like.

**The scale editor's blocked remove takes the middle answer, the one nobody had used yet**: the
reason is drawn under the chip list and wired as the cross's `aria-describedby` (§39), and the
cross keeps `Remove {label}` as its name. Neither of the other two works here. The accepted
regression fails because *this* screen does **not** draw the fact anywhere else — a dialog of
chips has no second line to put a count on, which is exactly the distinction Phase 5 drew between
a card with a history log and a menu without one. And making the reason the name reads it twice
for anyone who has the description too. So the reversal's three answers are now one each, and the
thing that decided every one of them was not the component but **whether the screen had somewhere
to say it**.

### A note on §8 and nested `Escape`

§8 handled `Escape` in the same `document` capture listener as the `Tab` trap. Capture was right
for `Tab` and wrong for `Escape`: a capture listener on `document` fires before the event has been
anywhere near the element with focus, so the dialog always won and no control inside one could own
the key. §22 had already written `e.stopPropagation()` into `Popover`'s open menu expecting to be
able to; it never was.

Phase 6 found it because the scale editor holds a chip mid-reorder and `Escape` has to put it back
— and instead closed the whole dialog, discarding the edit. `Escape` now listens on the **bubble**
and skips a `defaultPrevented` event; `Tab` still traps on capture. Nothing gains a prop, and both
of blue's dialogs get it because both take the behaviour from `useDialogFocus`.

### A note on §29 and *matches nothing*

§29 says, and has always said, that `allowCreate` offers a `Create "…"` row *"when the query
matches no option"*. It was implemented as **no exact match**, which is react-select/creatable's
default and not what the sentence says — so typing `Eng` offered `Create "Eng"` with `English`
listed directly above it.

Every spec that asks for this row agrees with the prop rather than with the code:
[01](../hiring/01-vacancies.md)'s flow says *"when nothing matches case-insensitively"*, and
[06 §04.21](../hiring/06-libraries.md) says *"a name that matches nothing"*. So this is §29 being
made to do what §29 claims, not a change of behaviour, and it takes no new number. The match is
tested over `options` rather than over the filtered list, so a name already chosen in an `isMulti`
control still counts — otherwise picking `React` would make the next `React` look creatable.

It had gone unnoticed because the only test that reaches the case is `hiring-libraries.spec.ts`'s
first criteria flow, which has been failing earlier in its own body since the migration began.
Phase 6 unblocked it, and it caught this on the next line.

### A note on §21 and `Escape` inside a dialog

Not a new number, and the same shape as the two notes above: it makes an existing entry do what it
already said it did.

§21 gave `Select` react-select's keyboard, and its `Escape` closes the listbox and calls
`stopPropagation()` so the dialog around it does not also close. §22 wrote the same line into
`Popover`. §8's correction then taught every dialog shell to skip an `Escape` that something
inside had already answered — but it tests `event.defaultPrevented`, and neither control was
setting it.

That mismatch was survivable while the only dialogs were `Modal` and `ConfirmDialog`, whose
listeners are added at the same `document` React dispatches from. **Listeners on one node fire in
registration order, and `stopPropagation` does not stop the ones still queued on that node** — it
only stops ancestors. Under Next's App Router React hydrates `document` itself, so "an ancestor"
is not where any of this is happening: a `Select` inside `MenuDrawer` (§51) closed its listbox and
the drawer, in one keypress, discarding the panel somebody was filtering in.

Both controls now `preventDefault()` **as well as** `stopPropagation()`. The two answer different
listeners and both are needed — propagation for a host bound to a real ancestor, `defaultPrevented`
for one bound where React already is. Nothing gains a prop, and `MenuDrawer`, `Modal` and
`ConfirmDialog` all get it because all three read the same flag.

## Closed

| § | Component | Divergence | How it closed |
|---|---|---|---|
| *none yet* | | | |

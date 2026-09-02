# `@devscribed/ds`

The design system this application is built from: a vocabulary of tokens, a set of components,
and four rules about how they are used.

It is **source, not a build**. `apps/web` lists it as a dependency and Next compiles its
TypeScript the same way it compiles the app, so a change to a component is visible on the next
render with no build step in between.

```tsx
import { Button, Card, TextInput } from '@devscribed/ds';
import '@devscribed/ds/styles.css';   // once, in the root layout
```

Everything is imported from the package root. There is no deep import — a component file is an
internal, and the barrel is the surface.

---

## The four rules

Everything below this line is a description. These four are the parts that are **normative**:
a change that breaks one of them is a change to the system, not a change in it.

### 1. Layout

**A stylesheet holds only what an inline style cannot express.** Media queries, pseudo-classes,
keyframes, and rules that must apply to a child a component did not render. Everything else —
every colour, every space, every size — is written inline on the component that owns it.

The reason is that an inline style has exactly one place to look. A class does not: two files
now decide what a thing looks like, and the second one is found by grep.

Anything that repeats across screens is a **component**, not a class. A screen that has grown a
`.card-section-header` has found a component and given it a class name instead.

### 2. Tokens

**No raw hex and no raw px outside `tokens/`.**

A value with no token gets a token, with a reason written beside it. A value that genuinely
belongs to one component stays a literal, with a comment saying why — `Toast` is the worked
example: its plate floats over every page in the app, so it deliberately sits outside the
surface vocabulary and must not follow it.

Inventing a token to satisfy the rule is how a vocabulary rots. If `--space-9: 25px` is not the
gap you want, the answer is not `--space-9-and-a-half`.

The scale is deliberately not a 4/8 grid; see `tokens/spacing.css`.

### 3. The accessibility floor

Three things every component owes, whatever else it does:

- **It forwards what it is given.** `data-testid` and every `aria-*` reach the DOM. A component
  that destructures the props it knows and drops the rest cannot be found by a test or named by
  a reader (§19, §2, §3, §23, §26, §28).
- **A blocked action is shown, blocked, and says why.** Never hidden, and never disabled with no
  reason attached: an action that vanishes is indistinguishable from a bug, and `aria-disabled`
  keeps the row focusable so the reason can actually be read (§22, §39, §62).
- **Anything reachable by keyboard paints a focus ring, on `:focus-visible` only.** A control
  with focus you cannot see is a control you cannot use; a ring left behind by a mouse click
  answers a question nobody asked (§68).

Roles come with promises. A `role="tab"` owes arrow keys and one tab stop; a
`role="combobox"` owes a listbox and `Escape`. Claiming the role and not keeping the promise is
worse than not claiming it (§21, §31, §45).

### 4. The boundary

**A component belongs here if it is reachable from the app, or named by a written spec.**

That rule is re-run before anything is added or removed — not assumed. A component nobody
renders and no spec asks for pays lint, documentation and review cost forever and repays none of
it.

What is here today: 40 component modules and 2 shared internals, listed below.

What was deliberately left out when this package was created, fourteen files in all:
`Tracker`, `TimeField`, `DateField`, `DateRangePicker`, `MembersCell`, `MembersMultiField`,
`CircleList`, `CircleSelect`, `CheckboxRow`, `NavigationCard` and four report components.
Nothing rendered them and no spec named them. They are recoverable from git history at
`5b4b4cd`, the last commit that contained them.

---

## Components

| Group | Components |
|---|---|
| **Core** | `Button`, `Badge`, `Card`, `Chip`, `IconButton`, `PageTitle`, `ToggleButton` |
| **Forms** | `TextInput`, `TextArea`, `Select`, `SearchInput`, `Checkbox`, `FileInput`, `FormField`, `FieldLabel`, `RequiredMark`, `FormActions` |
| **Data** | `Table`, `TableToolbar`, `Calendar`, `BoardCard`, `BoardColumn` |
| **Feedback** | `InfoBanner`, `Toast`, `ToastHost`, `Tooltip`, `Preloader`, `EmptyState` |
| **Overlays** | `Modal`, `ConfirmDialog`, `Popover`, `MenuDrawer` |
| **Navigation** | `Sidebar`, `PageTabs`, `Pagination`, `BackTo` |
| **App layout** | `AppShell`, `Navbar`, `AccountMenu`, `AuthLayout`, `BookingLayout`, `MiniTracker` |
| **Icons** | `Icon` (name-based dispatcher) plus 27 glyph exports |

Two internals are shared rather than duplicated: `useDialogFocus` (what a dialog does with focus
and `Escape`, shared by `Modal` and `ConfirmDialog`) and `isKeyboardFocus` (rule 3's
`:focus-visible` read).

Anything a screen would otherwise re-declare lives here, so a screen holds only its own content:
the page frame (`AppShell` owns the 25px padding and the `#f8fafc` well), the label geometry
(`FormField` / `fieldLabelStyle`), and the list-table controls row (`TableToolbar`).

**Every component carries its own reasoning.** The decision behind a value is in a comment beside
it, and the numbered ones (`§n`) are collected in
[`specs/design-system/decisions.md`](../../specs/design-system/decisions.md).

---

## Visual foundations

- **Colour.** One primary blue (`#007AFF`) carries almost all emphasis — primary buttons, active
  nav and tab states, links, focus rings. A second, distinct tracker blue (`#2AA7FF`) belongs to
  the floating tracker widget alone and is deliberately not the same hue; do not normalise it
  away. Neutrals are cool greys, `#1B1B1B` text down to `#E7E7E7` borders. **Status colours —
  green, yellow, red, cyan — are used sparingly and only for real state**: a badge that reports
  what something *is*, a form error, an info banner. A label on an object is not a status, which
  is why `Badge` has a `neutral` tone (§59).
- **Type.** One family, Poppins, for everything: no serif, no mono, no display face. Weights are
  used expressively rather than snapped to 400/700 — 450 for headlines, 500 for nav and medium
  emphasis, 550 for button labels, 600 for dialog titles.
- **Surfaces.** Flat white throughout. The only non-white surfaces are the pale blue behind the
  logo lockup and the light-grey recessed ground (`--surface-sunken`) behind a table header or
  under a board column. No photography, no gradients, no textures.
- **Borders and shadows.** Borders are thin (1–1.5px) and low-contrast. **Shadow is reserved for
  things that float** — modals, popovers, drawers, a card held mid-drag. A static card takes a
  border, not a shadow, until it is hovered; painting a lift on something that does not move
  promises a click that is not there (§12).
- **Corner radii.** 8px is the workhorse — buttons, inputs, cards, modals. 4px for badges and
  calendar cells, 6px for popovers and drawers, 20px for the segmented pill, 20px again (under a
  different name) for a large panel, circles for avatars. Nothing is square.
- **Motion is minimal and utilitarian.** 0.1–0.3s transitions on hover, focus and state change; a
  1–2s linear spin for a loader. No bounce, no spring, no scroll-triggered reveal. The one
  exception is `Toast`'s entrance, and it says why. Anything that animates for effect rather than
  to mark a change does not belong.
- **Hover.** The default button fades to 60% opacity; primary and delete buttons brighten via
  `filter` rather than swapping to a darker hex — **hover never adds a colour to the palette**.
  Nav links and popover rows turn primary blue; cards scale to 1.01 and gain a soft shadow; icon
  buttons scale to 1.1 rather than filling.
- **Transparency** is for scrims (60% black) and for the disabled-row treatment (60% opacity plus
  grayscale). No backdrop blur.
- **Layout.** A fixed `--layout-sidebar-width` rail beside a 60/80px navbar is the one
  non-negotiable structural rule; content scrolls independently. The switch between the two is
  in `base.css`, and **width alone decides it** — no stored preference, no `matchMedia` read —
  so the server and the hydrated client agree at every size.

## Content

- **Second person, direct, no fluff.** Labels and actions are short nouns and verbs: "Add time",
  "Log out", "Save". No exclamation points.
- **Sentence case everywhere except nav section titles**, which are Title Case. Tab labels are
  the one place text is uppercase, and it is done with `text-transform`, not typed that way.
- **No emoji**, anywhere — not in labels, not in toasts, not as an icon.
- **Errors are terse and factual.** A validation message is prefixed with a bare `*` and states
  the problem: `*Required`, not a friendly sentence.
- **No first-person product voice.** "You" appears implicitly through imperative verbs.

## Iconography

- **Every icon is a hand-authored inline SVG React component.** No icon font, no icon library, no
  raster, no emoji.
- Icons are small (12–24px), single-colour and **filled**, painted with `currentColor`, with a
  `viewBox` matching the intrinsic size.
- There is one outline family — four 512-viewBox glyphs at `1em` — and it is **closed**. A mark
  joins it only when it is completing a row of outline glyphs already on screen; a lone new mark
  is filled. `CalendarIcon` carries the argument (§67).
- Glyphs are exported individually and through `Icon`, a name-based dispatcher for call sites
  that pick an icon from data.

## The wordmark

The mark is drawn inline, twice: `Sidebar` renders it at 185×35 to fill an 80px navbar, and
`AuthLayout` at 148×28 above a signed-out card. They are deliberately not one shared component —
the two differ only in size, and a component whose only prop is its size is a constant with extra
steps. `BookingLayout` draws no mark at all: the page belongs to the organisation a candidate is
booking with, so the name is content and arrives as a prop (§46).

Poppins is loaded from Google Fonts in `tokens/fonts.css`. `--font-family-base` names a
`sans-serif` fallback, so the system degrades to the platform face rather than to nothing.

---

## Not in this project

Deliberate omissions, each a defensible follow-up and none of them needed for the system to be
real: render fixtures, a catalogue route, contract tests, Storybook, and making the pure
components server-renderable. The adherence lint (rules 1 and 2) lands as **warnings**; it is a
report, not a gate.

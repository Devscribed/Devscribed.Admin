# Teammerly Design System

> **Vendoring note (added by this repository, not by the design project).**
> This is the vendored copy of the `Teammerly Original DS` project
> (`claude.ai/design`, `b67beb28-1b90-40a6-8b50-7433072f3497`), consumed by `apps/web`
> through the `@ds` alias. It carries the parts the app compiles and a developer reads:
> `components/`, `tokens/`, `base.css`, `styles.css`, `index.js`, `_ds_manifest.json`,
> `_adherence.oxlintrc.json`, `_ds_bundle.js` and this record.
>
> Not vendored, and still reachable in the design project itself: `prod-src/` and
> `prod-screens/` (the evidence base), `uploads/`, `ui_kits/`, `templates/`, `guidelines/`,
> `assets/`, `CLAUDE.md` and `VERIFICATION.md`. Component comments below and in the source
> files cite those freely — the citations are to upstream, and resolve there.
>
> `index.js` is written by this repository; the design project has no entry point of its own.
> Divergences from upstream are numbered in `specs/design-system/ledger.md`, and
> `npm run ds:drift` fails when `index.js` and `_ds_manifest.json` disagree.

## What this is

This design system documents **Teammerly** — a time-tracking / workforce-management SaaS
product (timesheets, project & client management, team overview, reports, time-off
requests, organization & subscription settings). It was reverse-engineered from the
product's own React codebase, where the app is still named **Teamplay** internally
(package name `teamplay-react-app`, routes, page titles). Brand-facing surfaces say
Teammerly and use the supplied Teammerly logo; internal product names are left as they
appear in code.

**Sources provided**
- Mounted local codebase `teamplay-react-app/` — React 18 + TypeScript, Redux Toolkit,
  SCSS Modules, Formik/Yup, react-select, react-router-dom 6, FullCalendar, Sentry.
  Re-attach it via the Import menu to extend this system later.
- `Logo.svg` — the brand's master logo artwork (now `assets/logos/teammerly-logo.svg`).
- A previous revision of this design system ("2.0 Teammerly DS"), used as the baseline
  and carried forward here.

No Figma file, slide deck, or marketing site was provided. Every token, color, spacing
value, shadow and component pattern was read directly from the codebase's `.scss`/`.tsx`
source — nothing was invented or approximated.

## Product surface

Teamplay is a single web app (no separate marketing site or mobile app was in the
provided codebase) with these areas, reachable from the left sidebar:
- **Timesheets** — calendar-based time entry, plus a floating always-on time tracker
- **Project management** — Projects/Teams, ToDo, Clients
- **People** — Members, Invites
- **Team overview**
- **Reports** — Time & activity, Amounts owed, Time offs, All reports
- **Time off** — Policies, Holidays, Requests
- **Organization** — My organization, Subscription
- **Account** — profile settings

## Index

- `styles.css` — global stylesheet entry point (imports everything below)
- `tokens/` — `colors.css`, `typography.css`, `spacing.css`, `effects.css` (shadows/motion), `fonts.css`
- `base.css` — element resets + the app's global `.form-control` / `.input-label` / `.errorInput` rules
- `thumbnail.html` — homepage tile for this design system
- `assets/logos/` — `teammerly-logo.svg` (master artwork, use this one) and
  `teammerly-wordmark.svg` (the variant drawn in the app sidebar)
- `assets/icons/` — standalone SVGs for every icon used in the sidebar/toolbar/etc.
- `assets/illustrations/` — the two full-page error illustrations (403/404) found in source
- `components/` — reusable React primitives (see below)
- `templates/teamplay-app/` — copyable starting template: app shell + every kit screen
- `ui_kits/teamplay/` — interactive click-through recreation of the app (15 screens)
- `guidelines/` — foundation specimen cards for the Design System tab
- `SKILL.md` — portable skill file for use outside this environment

## Components

Grouped by concern, one directory per group, one card per group in the Design System tab:

- **Core** (`components/core/`) — `Button`, `Badge`, `ToggleButton`, `PageTitle`
- **Forms** (`components/forms/`) — `TextInput`, `Checkbox`, `Select`, `TextArea`, `SearchInput`, `DateRangePicker`, `DateField`, `TimeField`, `FormField`, `FieldLabel`, `CheckboxRow`, `FormActions`, `MembersMultiField`
- **Feedback** (`components/feedback/`) — `InfoBanner`, `Preloader`, `EmptyState`
- **Overlays** (`components/overlays/`) — `Modal`, `ConfirmDialog`, `Popover`, `MenuDrawer`
- **Navigation** (`components/navigation/`) — `Sidebar`, `PageTabs`, `BackTo`, `NavigationCard`
- **App layout** (`components/appLayout/`) — `AppShell`, `Navbar`, `MiniTracker`, `AccountMenu`, `Tracker`
- **Data** (`components/data/`) — `Table`, `TableToolbar`, `MembersCell`, `CircleList`, `CircleSelect`
- **Reports** (`components/reports/`) — `ReportControls`, `ReportTableTitle`, `ReportSummaryBanner`, `ReportGroupBody`, `ReportTableHead`
- **Icons** (`components/icons/`) — `Icon` (name-based dispatcher) plus the individual glyph exports

Anything a screen would otherwise re-declare lives here, so a template or a consuming
project only holds screen content: the page frame (`AppShell` owns the 25px padding and the
`#f8fafc` well), the label geometry (`FormField` / `FieldLabel`), the list-table controls row
(`TableToolbar`) and the report scaffolding.

### Intentional additions
None of the above were invented — every one has a direct counterpart in
`src/components/shared/` or `src/components/appLayout/` in the source codebase. `Select`
recreates the visual result of the app's react-select-based `DropdownSelect`/
`GeneralDropdownSelect` (not a byte-for-byte port of react-select, per the "simple
mainly-cosmetic versions" guidance). `Popover` consolidates two source components
(`AccountMenu`'s user popover and `ActionsPopover`'s kebab menu) that share the same
visual shell.

## UI kit

`ui_kits/teamplay/` — a click-through recreation of the app: the always-visible shell
(Sidebar + Navbar + mini-tracker + floating Tracker) plus the screens reachable from the
sidebar and from the wordmark:

- **Dashboard / start page** (opens first, as prod does at `/`) — promo lockup + section cards
- **Timesheets** — month / week / day calendar, Add time and Edit time modals
- **Project management** — Projects (table, Add project modal, delete confirm), ToDo, Clients
- **People → Members** — active/invites tabs, removed rows, invite modal, member profile
- **Team overview** — filter panel + member list
- **Reports** — Time & activity, Amounts owed, Time offs, All reports
- **Time off** — Requests, Policies, Holidays
- **Organization** — My organization, Subscription

See `ui_kits/teamplay/README.md` for the file-to-source map and `STATUS.md` for what has
been verified against production screenshots and what has not.

### Starting points and templates
The app shell is available as a **template** (`templates/teamplay-app/`), which is the form
consuming projects pick from today. `Button` and `Sidebar` still carry legacy
`@startingPoint` tags; those are no longer offered to consumers and can be dropped.
The template now covers **every screen the kit has** — its `screens.jsx` is generated by
concatenating `ui_kits/teamplay/*.jsx` in the kit's own load order, each file wrapped in an
IIFE so their module scopes stay separate. Re-generate it whenever a kit screen changes.

## Content fundamentals

Source copy is sparse (this is an internal productivity tool, not a marketing site), but
a consistent voice comes through in labels, empty states, and the one piece of marketing
copy on the start page:

- **Second person, direct, no fluff.** Nav labels and actions are short nouns/verbs:
  "Add time", "Log out", "My account", "Save". No exclamation points, no hype.
- **Sentence case for everything except nav section titles**, which are Title Case
  ("Project management", "Time off"). Tab labels (`PageTabs`) are the one place text is
  fully UPPERCASE (via `text-transform: uppercase` in CSS, not typed that way).
- **One playful moment, otherwise flat and functional.** The only copy with any voice is
  the StartPage card for time-off requests: *"Tired? Have a break!"* — everywhere else
  (Timesheets: *"Manage your work time here."*, Projects: *"Projects and clients."*) copy
  is a plain, literal description.
- **No emoji anywhere** in the codebase — not in labels, toasts, or the error illustrations.
- **Errors are terse and factual**: form validation errors are prefixed with a bare `*`
  (e.g. `*Required`), not a friendly sentence.
- **"I" is never used** (no first-person product voice); "you/your" appears only implicitly
  via imperative verbs ("Add time") rather than literal second person.

## Visual foundations

- **Color**: one primary blue (#007AFF, iOS-system-blue) carries almost all emphasis —
  primary buttons, active nav/tab states, links, focus rings. A second, distinct
  "tracker blue" (#2AA7FF) is used only by the floating time tracker widget — intentionally
  different from the primary blue, not a mistake to normalize away. Neutrals are cool grays
  (#1B1B1B text down to #E7E7E7 borders). Status colors (green/yellow/red/cyan) are used
  sparingly and only for real state (active/inactive badges, form errors, info banners).
- **Type**: a single family, Poppins, for everything — no serif, no mono, no display face.
  Weights are used expressively rather than snapped to 400/700: 450 for headlines, 500 for
  nav/medium emphasis, 550 specifically for button labels, 600 for dialog titles.
- **Backgrounds**: flat white surfaces throughout; the only non-white surface is the pale
  blue (#E8F2FE) rounded card behind the logo lockup and the light-gray table header strip.
  No photography, no gradients, no repeating patterns/textures. The two illustrations that
  exist (403/404 error pages) are flat vector line-art in blue/navy/gray with a road-barrier
  motif — geometric, not organic.
- **Animation**: minimal and utilitarian — 0.3s ease-in-out fades/opacity for
  overlays, a slide-up-from-80%-to-50% entrance for modals/dialogs, 0.3s color/opacity/filter
  transitions on hover, and a 1–2s linear spin for loaders. No bounce, no spring physics,
  no scroll-triggered reveals.
- **Hover states**: the default (secondary) button fades to 60% opacity; primary/delete
  buttons brighten via `filter: brightness(90%)` rather than swapping to a darker hex;
  nav links and popover rows switch text color to the primary blue; cards scale to 1.01
  and gain a soft shadow; icon buttons (modal close) scale to 1.1.
- **Press/active states**: the segmented ToggleSwitch's active pill is white-on-gray with
  a small shadow; the tracker's circular start/stop button fully inverts (blue↔white) when
  toggled active — there is no separate "press" shrink effect anywhere in source.
- **Borders & shadows**: borders are thin (1–1.5px) and low-contrast
  (`rgba(72,94,144,0.16)` or `#E7E7E7`) rather than heavy dividers. Shadows are soft and
  low-opacity, reserved for things that float above content (modals, popovers, the
  draggable tracker, the mobile drawer) — static cards use a border, not a shadow, until hovered.
- **Corner radii**: 8px is the workhorse radius (buttons, inputs, cards, modals); 4px for
  small badges and for the react-select control in `DropdownSelect` (the library default is
  left untouched there, while the Formik-based selects override it to 8px); 6px for popovers; 20px (pill) for the segmented toggle; circles for the
  tracker's start/stop button and avatar chips. Nothing uses a squared/0px radius.
- **Transparency & blur**: transparency is used only for scrims (60% black behind
  modals/drawers) and disabled-row treatment (60% opacity + grayscale filter). No
  backdrop-blur/glassmorphism anywhere in source.
- **Layout**: a fixed 290px left sidebar + fixed-height navbar (60/80px) is the one
  non-negotiable structural rule; content scrolls independently. The time tracker is the
  one truly floating, draggable, position-persisted element in the whole app.
- **Imagery color vibe**: cool (blue/navy/gray), flat, no grain/texture, no warm tones —
  consistent with the primary blue accent.

## Iconography

- **No icon font** — every icon is a hand-authored inline SVG React component
  (`src/assets/icons/**/*.tsx`), not glyphs from Lucide/Heroicons/Font Awesome/etc.
- Icons are small (12–24px), single-color, filled (not stroked) shapes using `fill`,
  matching `currentColor`/gray/blue depending on state (nav icons go gray→blue on
  hover/active). The one exception is `ThreeDotsIcon`, which is stroke-based.
- No PNG/raster icons and no emoji are used as icons anywhere in the app.
- All icons here were copied verbatim (path data preserved exactly) into
  `components/icons/Icon.jsx` for use inside other components, and mirrored as standalone
  files in `assets/icons/*.svg` for non-React use (e.g. the `<img>` tags in guideline cards).
- No substitution was necessary — the full icon set needed for the rebuilt components was
  present in source.

## Caveats & where to help me iterate

- **Verification status**: `STATUS.md` tracks, screen by screen, what has been checked
  against production code + screenshots and what has not. Still unverified: Clients,
  Account, Auth, and the Subscription screen in its populated state. Read it before
  treating any screen as spec.
- **Naming**: brand = Teammerly (logo supplied); the codebase, routes and page titles
  still say Teamplay. I did not rename anything inside the product recreation. Tell me if
  in-product strings should be rebranded to Teammerly.
- **Logo variants**: the supplied `Logo.svg` and the wordmark extracted from the app
  sidebar are the same mark with slightly different stroke geometry. `teammerly-logo.svg`
  is the master; the sidebar component still renders its own inline copy so the kit
  matches the shipped app pixel-for-pixel.
- **No Figma was attached** — everything here comes from reading SCSS/TSX source only.
- **Fonts**: Poppins is loaded from Google Fonts via `@import` in the source itself (no
  self-hosted font files exist in the codebase), so this system does the same — no
  substitution was needed.
- **Illustration coverage is thin**: the codebase only contains two illustrations (403 and
  404 error pages). There are no marketing/empty-state illustrations to draw from, so
  empty states in this system are text-only, matching source.
- Many page-specific composite components (report filters, calendar, phone-number input,
  date/time pickers) were **not** rebuilt as DS primitives — they're specific compositions
  of the primitives above rather than reusable building blocks. Tell me if you'd like any
  of them promoted into the component library.

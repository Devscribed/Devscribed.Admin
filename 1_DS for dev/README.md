# Teammerly Meridian Design System

**Same skeleton, new voice.** Meridian is a warm, editorial reskin of the Teamplay 2.0 (Teammerly) product. Every component, state, and layout rule from the source is preserved — only the visual language changes: cool iOS-blue Poppins → paper neutrals, violet + amber accents, Space Grotesk display + IBM Plex Sans text.

## Sources

- `uploads/Teammerly Meridian.dc.html` — the full Meridian product build (Timesheets, Members, Reports, Time-off, Organization) with light + dark themes.
- `uploads/Redesign Board.dc.html` — the Before/After comparison canvas covering foundations, buttons, badges, forms, nav, tables, modals, states, and the full app shell.
- `uploads/*.tsx, *.scss, index-*.ts` — Teamplay report source files (unchanged product logic, reference only).
- `uploads/README.md` — the original handoff bundle notes from Claude Design.

Both `.dc.html` files are the ground truth for tokens, colors, and component values. When in doubt, read them.

## Content fundamentals — voice & tone

Meridian's copy is quiet, editorial, and definite. It never sells.

- **Voice** — third-person for the app itself, second-person for the reader. "Manage your work time here." "Subscription renews Apr 1."
- **Casing** — sentence case in prose. `UPPERCASE + 1px TRACKING` in Grotesk 11px for micro labels (`Time zone`, `Total time`, `Joined`). Section headers on the redesign board are also uppercase Grotesk 13px / 2px tracking (`01 · FOUNDATIONS — COLOR`).
- **Numbering** — always Space Grotesk. `42h 20m`, `00:00:00`, `March 2026`, dates like `Apr 1`.
- **Buttons** — direct verbs, no exclamation: "Add time", "Save changes", "Approve", "Request vacation".
- **Empty states** — a single flat statement, no illustration, no pep: "No members found", "No vacation requests yet.", "No reserve transactions yet."
- **Guarded actions** use amber banners with a matter-of-fact reason: "Only one admin — role change guarded."
- **Emoji** — never. Icons are line-drawn SVGs; symbolic decoration (the amber wordmark pin) is a solid geometric square, not a glyph.
- **Punctuation** — em-dashes for asides ("Meridian trades the cool, flat, iOS-blue Poppins skin — for a warm, editorial system"); en-dashes for time ranges ("09:00 – 13:00").

## Visual foundations

Read `foundations/*.card.html` for the visible specimen cards. The rules:

- **Palette** — warm paper neutrals (`--paper-*`) on light, deep charcoals (`--char-*`) on dark. One violet accent (`--violet-700`) for actions/focus/active, one amber (`--amber-500`) reserved for the tracker (the one thing that's "live") and warnings. Success green and error red round out the semantics. **No blue** — that was the old skin.
- **Type** — Space Grotesk for display, numerals, buttons, and micro-labels. IBM Plex Sans for all body copy, inputs, and table cells. Two weights per family (500/600 display, 400/500 text). No third font.
- **Radii** — 9-10px for fields/buttons, 12-14px for cards/modals, 20px for status pills and toggle tracks. Never fully rounded (no full-pill buttons).
- **Borders** — the house border is **1.5px**. Cards and dividers get 1px. Borders are always paired with a warm neutral (`--border`), never grey-blue.
- **Backgrounds** — flat paper, no gradients, no patterns, no imagery. Dark mode inverts to flat charcoal. The single glow effect is reserved: violet outer glow on the primary CTA and today's date, sitting on dark surfaces only.
- **Shadows** — warm brown-cast (`rgba(74,55,20,…)`) — never pure black. Always paired with a border. Two levels: `--shadow-card` for panels, `--shadow-modal` for dialogs. Buttons carry a **2px tactile lip** (`--lip-accent`) that shrinks to 1px on `:active`.
- **Focus rings** — 3px violet ring (`--shadow-glow-accent`), no browser default. Error state swaps to a 3px red ring.
- **Corner language** — organic-editorial: soft 10-14px, occasionally 18px on dark hero blocks. Never sharp.
- **Motion** — fast and unstyled. 120-150ms for hover color; 200ms for chevron rotations; 250ms for theme swap. Easing is a single `cubic-bezier(.4,0,.2,1)` — no bounces.
- **Hover state** — every selectable row/menu-item/cell/dropdown uses the SAME accent-tinted hover (`--hover-bg-tint`, `oklch(0.62 0.17 292 / 0.07)`). Consistency here is a feature, not a limitation.
- **Press** — a 1px vertical translate on primary buttons ("transform:translateY(1px)"). Nothing else moves.
- **Transparency / blur** — none. No frosted glass, no scrim blur. Modals sit on a flat `rgba(36,31,26,.35)` ink-tinted scrim.
- **Cards** — 14px radius · 1px border · warm shadow · paper-white body. Header title is Grotesk 600 · 16px with -.2px tracking.
- **Layout constants** — 252px sidebar, 68px top bar, 44px field height (46px large). Content padding 22-32px.
- **Layout rules** — sidebar is fixed; the top bar contains the tracker chip (leading) and account + theme toggle (trailing). Content scrolls; sidebar and top bar don't.
- **Imagery** — none currently. The product carries no photography or illustration; when needed, use warm-cast, un-saturated placeholders.

## Iconography

- **Inline SVGs** — the whole app renders icons as inline `<svg>` paths (see the massive `P = {...}` dict inside `MeridianApp.dc.html` `renderVals()`). Stroke-free, filled with `currentColor`, roughly 16-20px. That's the house glyph size.
- **Style** — geometric, medium weight (Material-Symbols-adjacent). No line icons, no duotone.
- **Where they live** — sidebar nav (Timesheets, Projects, People, Reports, Time-off, Organization), tracker chip, form-field chevrons, close buttons, magnifier, dots menu, mail, clock, user avatar fallback, check.
- **No icon font** and **no external icon library** are used. If new icons are needed, extend the `P` dictionary in the DC or add small individual `.svg` files under `assets/icons/`.
- **Emoji** — never.
- **Unicode characters** — used sparsely for the "less/greater" back arrow (`←`), the en-dash in time ranges, and the middle-dot separators.
- **Logo** — no logo file was provided. The wordmark is set in plain type: `Team` (ink) + `merly` (violet) + a 6-9px amber pin. Never draw or approximate any other logo.

## Index

- `styles.css` — root entry; `@imports` the seven token files under `tokens/`.
- `tokens/` — `fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `radii.css`, `shadows.css`, `motion.css`.
- `foundations/` — 15 specimen cards (Colors, Type, Spacing, Radii, Shadows, Motion, Hover, Wordmark). Every card links `../styles.css`.
- `index.js` — the public entry point; import components from here, never from `components/**` internals.
- `components/` — reusable primitives, grouped:
  - `actions/` — `Button`, `IconButton`
  - `feedback/` — `Badge`, `InfoBanner`
  - `forms/` — `Input`, `Select`, `Checkbox`, `Radio` / `RadioGroup`, `SearchField`
  - `icons/` — `Eye`, `EyeOff`
  - `navigation/` — `Tabs`, `Toggle`, `NavItem`
  - `surfaces/` — `AuthLayout`, `Card`, `Modal`
  - `data/` — `Table`
  - `typography/` — `SectionLabel`
- `templates/` — copy-paste-ready pages:
  - `meridian-app/MeridianApp.dc.html` — the full product build (Timesheets, Members, Reports, Time-off, Org).
  - `redesign-board/RedesignBoard.dc.html` — the Before/After audit board.
- `SKILL.md` — cross-compatible Agent Skills manifest.
- `thumbnail.html` — project tile.

## The signed-out shell

The Meridian source build covers the authenticated product only — it has no login, signup, or password screen. `AuthLayout` fills that hole: warm paper field, the text wordmark, one centred card at 480px max-width, nothing else. Signup, login, forgot-password, and reset-password all sit in it. There is no theme toggle on those routes; the signed-out surface follows the system preference.

## Intentional additions

- `SectionLabel` and `SearchField` are not first-class components in the source but appear so many times that promoting them saves consumers from re-writing the same inline styles.
- `AuthLayout`, `IconButton`, `Eye` / `EyeOff`, `Input trailing`, and `Button loading` were added for the signup screen (spec 01). `_ds_bundle.js` was hand-extended to match — a regeneration from Claude Design will need those sources re-imported.

## Caveats & substitutions

- **Font files** — Meridian is loaded from Google Fonts (Space Grotesk + IBM Plex Sans). If you need to self-host, drop the .woff2 files into `assets/fonts/` and rewrite `tokens/fonts.css` `@font-face` blocks.
- **No logo** — the wordmark is text. If a real mark is created later, add it under `assets/logo.svg` and update the sidebar + thumbnail.
- **The `.dc.html` templates are self-contained.** They load Google Fonts directly and use inline styles pervasively — `ds-base.js` (which loads the token CSS) is included for consistency but not strictly required.

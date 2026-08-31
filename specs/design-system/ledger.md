# Divergence ledger

Everything the vendored copy of the design system at `1_DS for dev/` has that upstream does not.
One numbered entry per component or prop added, under
[§D3](README.md) — *edit the vendored copy in place, but never silently*.

Phase 0 created this file; Phase 1 wrote §1–§11. `npm run ds:drift` currently reports four
local-only components — `AuthLayout`, `IconButton`, `Eye`, `EyeOff` — and each of them is
numbered below, which is the bar this file exists to hold.

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

## Closed

| § | Component | Divergence | How it closed |
|---|---|---|---|
| *none yet* | | | |

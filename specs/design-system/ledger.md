# Divergence ledger

Everything the vendored copy of the design system at `1_DS for dev/` has that upstream does not.
One numbered entry per component or prop added, under
[§D3](README.md) — *edit the vendored copy in place, but never silently*.

**The ledger is empty.** Phase 0 creates it; Phase 1 writes the first entries. Nothing has been
added to the vendored copy yet.

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
| *none yet* | | | | | | |

## Closed

| § | Component | Divergence | How it closed |
|---|---|---|---|
| *none yet* | | | |

---
id: "16"
title: Billable Time
routes: ["/org/{orgId}/time-tracking"]
api:
  - "POST   /api/organizations/{orgId}/time-tracking/entries"
  - "PATCH  /api/organizations/{orgId}/time-tracking/entries/{entryId}"
  - "GET    /api/organizations/{orgId}/time-tracking/calendar"
entities: [TimeEntry, RunningTimer]
tags: [time-entry, billable, non-billable, reports, running-timer, time-grid]
depends-on: ["12"]
---

# 16 — Billable Time

## Summary

This spec extends **Time Tracking** (spec 12) with a **`billable` flag** on each time entry so members can mark work as billable (client-facing, invoicable) or non-billable (internal standups, retros, training, off-project time). The flag drives three columns in the future Time & Activity report (`specs/reports/`) — *Billable Time*, *Non-Billable Time*, *Billed Amount* — and gates the Amounts Owed calculation to billable hours only. Existing entries default to `billable = true`, so no data disappears and no report's totals shift for pre-existing hours. The Weekly and Monthly views visually distinguish non-billable entries with a dashed border and a "NB" corner tag; the entry modal and the Running Timer bar expose a toggle.

## Actors & Preconditions

- **Actors:** every role that can log time (per spec 12) sets the billable flag on their own entries. `admin` and `manager` can toggle the flag on any org member's entry. `viewer` cannot log time and does not see the toggle.
- **Preconditions:** the caller can log time per spec 12; the project involved is `active` and the caller is assigned (per spec 11's assignment rule for `user`).

## Roles & Permission Matrix

| Capability | admin | manager | user | viewer |
|---|---|---|---|---|
| Set billable on own entry | ✅ | ✅ | ✅ | ❌ |
| Set billable on another member's entry | ✅ | ✅ | ❌ | ❌ |
| See billable/non-billable distinction on calendar | ✅ | ✅ | ✅ | ❌ |
| Filter Weekly/Monthly view by billable / non-billable | ✅ | ✅ | ✅ | ❌ |

## Functional Requirements

### The `billable` field

1. `TimeEntry.billable` is a non-null `Boolean` with `@default(true)`.
2. `RunningTimer.billable` is a non-null `Boolean` with `@default(true)` — the flag lives on the timer while it runs and is copied to the resulting `TimeEntry` when the timer stops.
3. A member can toggle the flag at any time before or after creation: on entry create, entry edit, timer start, timer live-update.
4. The default when opening the entry modal is `true` (billable). The Running Timer bar's toggle defaults to `true` on start. There is **no** per-project default in v1 (deliberate — a future spec adds `Project.defaultBillable`).

### Effect on reports (specs `reports/`)

5. **Amounts Owed** counts only entries with `billable = true`. Non-billable entries are excluded from the payable total.
6. **Time & Activity** exposes three columns whose values depend on this flag: `Billable Time` = sum of `durationMinutes` where `billable = true`; `Non-Billable Time` = sum where `billable = false`; `Billed Amount` = `Billable Time * bill rate` per member per project.
7. **Total time** on Time & Activity is the sum of billable + non-billable, unchanged in v1 (still counts every entry).
8. **Time Off** report is unaffected.

### Effect on the Time Tracking calendar (spec 12)

9. **Weekly view.** Non-billable entries render with a dashed border, a "NB" corner tag, and use the `--bg-sunken` background instead of `--accent-soft`. Billable entries look as they do today.
10. **Monthly view.** Non-billable entries render with the same dashed treatment; totals per day split into `{billable}h / {non-billable}h nb` when both are present.
11. **Column totals** in the Weekly view show a two-line total per day: primary (billable) and, if any exists, a smaller `+{n}h nb` under it.
12. **Filter chips** appear in the calendar toolbar: `Billable` (on by default), `Non-Billable` (on by default). Toggling one off hides those entries from the grid; totals recompute to match what's visible.
13. **Running Timer bar** shows a **Billable / Non-billable** micro-toggle next to the Stop button and labels the current state textually next to the timer ("Non-billable · started 14:22"). Toggling while running updates the timer's state in the same PATCH used for description / project changes.

### Effect on Vacation

14. Vacation math is not touched. Vacation is not a `TimeEntry`; nothing in spec 09 reads `billable`.

## Data Model

### TimeEntry (extension)

| Field | Type | Description |
|---|---|---|
| `billable` | `Boolean @default(true)` | Whether the entry counts toward client-billed totals. |

### RunningTimer (extension)

| Field | Type | Description |
|---|---|---|
| `billable` | `Boolean @default(true)` | Copied onto the resulting `TimeEntry` when the timer is stopped. |

**Indexes:** none new. A `(membershipId, date, billable)` index is *not* introduced in v1 because reports currently filter primarily by `(organizationId, date range)` and read `billable` as a projected column; if profiling reveals a hot path, an index amendment lands via a follow-up.

### New Capabilities

- `EditOthersBillable` / `edit-others-billable` — toggle the billable flag on another member's entry (admin, manager). Own-entry editing needs no new capability; it's covered by the existing `edit-own-time` capability from spec 12.

## Migration

- Add `billable` to `TimeEntry` and `RunningTimer` with `@default(true)`. Postgres backfills existing rows.
- No `UPDATE` migration is required: default `true` is exactly the desired backfill (all previously logged time is treated as billable).
- The migration is idempotent and reversible (dropping the column is safe if the feature is rolled back, at the cost of losing the flag).
- Migration order: this spec's migration comes after `20260827153333_spec_12_time_tracking` and does not conflict with any pending kanban or activity-snapshot migrations (verified per the vacation-safety analysis in the plan file).

## API Contracts

### Extension to `POST /api/organizations/{orgId}/time-tracking/entries` (spec 12)

Body gains an optional `billable: boolean` field (default `true`). Server writes exactly what the client sends; `billable = false` is honored.

### Extension to `PATCH /api/organizations/{orgId}/time-tracking/entries/{entryId}` (spec 12)

Body gains an optional `billable: boolean` field. Own-entry edits use existing `edit-own-time`; edits to another member's entry require `edit-others-billable`.

### Extension to `POST /api/organizations/{orgId}/time-tracking/timer` (spec 12, start timer)

Body gains an optional `billable: boolean` field (default `true`).

### Extension to `PATCH /api/organizations/{orgId}/time-tracking/timer` (spec 12, update running timer)

Body gains an optional `billable: boolean` field; toggling mid-run is honored.

### Extension to `POST /api/organizations/{orgId}/time-tracking/timer/stop`

The resulting `TimeEntry.billable` is copied from `RunningTimer.billable`.

### Extension to `GET /api/organizations/{orgId}/time-tracking/calendar`

Each entry in the response gains `billable: boolean`.

### New calendar query params

`billable?` accepts `all` (default) | `billable` | `non-billable` to filter server-side, mirroring the UI chips.

## Validation Rules

1. `billable` must be a boolean if provided — "Invalid billable value." (422). Missing/undefined defaults to `true`.

The flag has no format or range beyond that; all substantive rules are business rules (e.g. authorization on cross-member edits).

## Error Messages

| Context | Message |
|---|---|
| Toast — entry logged (billable) | "Time logged." |
| Toast — entry logged (non-billable) | "Non-billable time logged." |
| Toast — entry updated | "Entry updated." |
| Toast — cross-member edit forbidden | "You don't have permission to edit this member's entry." |
| Toggle description (billable = true) | "Counts toward the client's Billed Amount on reports. Turn off for internal work, training, or PTO." |
| Toggle description (billable = false) | "This entry will not appear in the client's Billed Amount total." |
| Running-timer text (non-billable) | "Non-billable · started {HH:MM}" |
| Weekly column tooltip (non-billable) | "Non-billable · {n}h — excluded from Billed Amount" |

## Screens

See [`16-billable-time.mock.html`](16-billable-time.mock.html) for the visual target. Four states are canonical:

1. **Add entry modal — billable toggle on** — the default. The toggle sits below the description field in its own bordered row with a short explanation.
2. **Add entry modal — non-billable** — same modal, toggle off, description switches to the "will not appear on Billed Amount" line.
3. **Weekly TimeGrid — mixed** — three project rows across a week; billable entries render solid, non-billable render dashed with a small **NB** tag; holiday day cell shows the amber tint from spec 03. Chip toolbar above the grid lets the viewer toggle billable/non-billable visibility. Daily totals split into `{billable}h` and `+{n}h nb`.
4. **Running Timer bar — non-billable** — the running-timer strip shows the red pulse, the project and note text, the tz-local start time labelled **"Non-billable · started 14:22"**, the current elapsed, an inline **Billable** toggle, and the Stop button.

## Flows

### Main Flow: Member logs a non-billable entry

1. Member clicks **+** on a day cell in the Weekly view (or **Log time** in the topbar).
2. System opens the Add Entry modal with `billable = true` as the default.
3. Member sets duration, project, task, description; toggles **Billable** off.
4. Toggle description flips to the "will not appear" copy.
5. Member clicks **Log time**.
6. System sends `POST …/entries` with `billable: false`.
7. On success: modal closes, toast **"Non-billable time logged."**, the new entry appears in the grid with the dashed treatment and **NB** tag.

### Alt Flow A: Timer started billable, toggled non-billable mid-run

1. Member starts a timer on **Internal Dashboard** — defaults to `billable = true`.
2. Ten minutes in, they realize it's a training session. They click the inline **Billable** toggle in the Running Timer bar.
3. System sends `PATCH …/timer` with `billable: false`.
4. Timer bar text updates to **"Non-billable · started {startTime}"**.
5. Member clicks **Stop**. Resulting entry has `billable = false`.

### Alt Flow B: Manager edits a user's entry to non-billable

1. Manager opens the user's Weekly view (via Members → user → Time).
2. Manager clicks a billable entry.
3. System opens the Edit modal with `billable = true`.
4. Manager toggles it off, saves.
5. System sends `PATCH …/entries/{id}` with `billable: false`.
6. On success: toast **"Entry updated."**, the entry re-renders with the dashed treatment.

### Alt Flow C: `user` tries to edit another member's entry

Modal is not offered; the entry is not clickable in another member's view for `user`. If the API is called directly, server returns 403.

### Alt Flow D: Filter chip toggles

Member clicks the **Non-Billable** chip in the toolbar. Grid re-fetches with `?billable=billable`, non-billable entries disappear, daily totals recompute to billable-only.

## UI Description

### Layout — Add / Edit modal

The toggle sits as the last field, in a dedicated bordered row (not a bare inline checkbox), to give it presence without stealing focus from the description. The row uses a two-column layout: `[title + one-line explanation]` on the left, `[toggle]` on the right. The toggle is a DS-style pill toggle (accent-filled when on, muted grey when off).

### Layout — Weekly TimeGrid

- **Cell rendering.** A billable entry keeps today's `--accent-soft` background and accent text. A non-billable entry uses `--bg-sunken` background, muted-text ink, a **1px dashed** border in `--border-strong`, and a tiny "NB" text tag pinned top-right.
- **Toolbar chips.** Two toggle chips (Billable, Non-Billable) using the same styling as existing filter chips in the TimeGrid (spec 12). Both are on by default; state is URL-persisted.
- **Legend swatch.** A small legend on the right of the toolbar: a solid accent square with "Billable" label and a dashed muted square with "Non-billable" label. Kept simple; no color-blindness concern since the shape (dashed vs solid) is the primary encoder.
- **Daily totals.** The bottom totals row shows the billable total prominently (mono, `--fs-14`) and, when non-billable exists, `+{n}h nb` in `--fs-11` `--text-muted` below it. When only billable exists, the row shows just one line.

### Layout — Running Timer bar

The bar (spec 12) gains a small toggle chip labelled **Billable** on the right, just before the Stop button. When off, the timer's project-line reads **"Non-billable · started {HH:MM}"** in muted text; when on, the "Non-billable · " prefix disappears.

### States

| State | Trigger | Rendered |
|---|---|---|
| Toggle on | Default | Filled accent toggle; description reads the "counts toward" text |
| Toggle off | Click | Muted toggle; description flips to "will not appear" text |
| Saving | Modal submit or timer PATCH | Toggle disables; button shows spinner |
| Error | Server 4xx/5xx | Toast; toggle re-enables at last chosen value |

### Responsive Behavior

**Desktop:** as above.
**Tablet:** the toolbar's Billable/Non-billable chips remain visible; the legend swatch collapses to icon-only.
**Mobile:** the toolbar chips wrap onto a second row; the Weekly view scrolls horizontally; the entry modal is full-screen. The Running Timer bar's Billable toggle moves into a `⋯` overflow menu to save horizontal space.

### Accessibility

- The toggle uses `role="switch"`, `aria-checked="true|false"`, and `aria-describedby` pointing at the description line so screen readers hear the current state and its meaning.
- Non-billable entries expose `aria-label="Non-billable · {duration} · {project}"` so the "NB" visual tag has an audio equivalent.
- The dashed-vs-solid distinction has a text equivalent — dashed entries carry the "NB" tag; colour alone never encodes state.

## Required `data-testid` Attributes

### Entry modal (extension)

- `time-entry-billable-toggle` — the switch itself
- `time-entry-billable-toggle-label` — the descriptive text
- `time-entry-log-btn` (existing from spec 12)

### Weekly / Monthly grid (extension)

- `time-entry-{id}` (existing) — carries a `data-billable="true|false"` attribute
- `time-grid-filter-billable`, `time-grid-filter-nonbillable`
- `time-grid-day-total-{yyyy-mm-dd}` — carries `data-billable-minutes` and `data-nonbillable-minutes` attributes

### Running Timer bar (extension)

- `running-timer-billable-toggle`
- `running-timer-status-line` — carries the "Non-billable · started …" text when non-billable

### Toasts

- `toast-time-logged` (existing, extended: reads different text for non-billable)
- `toast-time-updated` (existing)
- `toast-time-forbidden` (new)

## Security

### Authentication & Authorization

- Own-entry `billable` writes use the existing `edit-own-time` capability from spec 12.
- Cross-member `billable` edits require `edit-others-billable` (new); `user` and `viewer` cannot cross-edit.
- Server ignores any attempt by `user` to `POST/PATCH` for `membershipId != session.membershipId` — returns 403.

### Cross-organization protection

- Same as spec 12 — every query scopes by `session.organizationId`; the flag is stored on entries and timers already scoped.

### Input handling

- `billable` is parsed as a strict boolean; strings `"true"`/`"false"` are accepted (Nest's transform pipeline), other values return 422.

### Concurrency & audit

- Toggling on a running timer is a routine PATCH; no additional lock is needed because the timer is a single-row-per-member resource.
- Cross-member edits log `{ event: "time_entry_billable_changed", actorAccountId, membershipId, entryId, oldValue, newValue }` at info.

### Rate limiting

- App-wide default.

### Logging

- Standard entry mutation logs (spec 12) gain the `billable` value in their payload; nothing else new.

## Out of Scope

- Per-project default (`Project.defaultBillable`) — future spec.
- Per-client default.
- A "billable ratio" per member surfaced on the profile.
- Automated non-billable detection (e.g. tagging retros as non-billable via heuristics on the description).
- A separate "internal time" report — Time & Activity covers this via the Non-Billable column.
- Backfilling old entries as non-billable based on project/task heuristics.

## Test Cases

### Unit

- **TC-16-UNIT-01: Default is billable.** Constructing a `TimeEntry` without `billable` in the body returns an entity with `billable = true`.
- **TC-16-UNIT-02: Explicit false honored.** `{ billable: false }` returns `billable = false`.
- **TC-16-UNIT-03: String "false" coerced.** Nest's ValidationPipe coerces `"false"` → `false` (accepted).
- **TC-16-UNIT-04: Invalid value rejected.** `"maybe"` returns the invalid-billable-value error.
- **TC-16-UNIT-05: `splitByBillable` aggregator.** Given a list of `TimeEntry` objects, returns `{ billableMinutes, nonBillableMinutes }` accurately.

### Integration

- **TC-16-INT-01: Migration backfills existing rows.** After migration, every pre-existing `TimeEntry` reads `billable = true`.
- **TC-16-INT-02: Create billable — happy path.** POST `{ …, billable: true }` returns 201; the row reads `true`.
- **TC-16-INT-03: Create non-billable.** POST `{ …, billable: false }` returns 201; the row reads `false`.
- **TC-16-INT-04: Create without `billable`.** Defaults to `true`.
- **TC-16-INT-05: Patch flip billable → non-billable (own).** Own entry PATCH `{ billable: false }` returns 200 for `user`.
- **TC-16-INT-06: Patch flip on another member's entry (user).** Returns 403.
- **TC-16-INT-07: Patch flip on another member's entry (manager).** Returns 200.
- **TC-16-INT-08: Patch flip on another member's entry (admin).** Returns 200.
- **TC-16-INT-09: Timer starts billable by default.** POST `/timer` without `billable` — `RunningTimer.billable = true`.
- **TC-16-INT-10: Timer PATCH toggles billable.** PATCH `/timer { billable: false }` — the row reads `false`.
- **TC-16-INT-11: Timer stop copies billable to entry.** Start with `billable = false`, stop; resulting `TimeEntry.billable = false`.
- **TC-16-INT-12: Calendar returns `billable` per entry.** GET calendar — each entry has the field.
- **TC-16-INT-13: Calendar filter — billable.** GET `?billable=billable` returns only billable entries; totals reflect the filter.
- **TC-16-INT-14: Calendar filter — non-billable.** GET `?billable=non-billable` returns only non-billable.
- **TC-16-INT-15: Amounts Owed excludes non-billable.** Seed 40 h billable + 8 h non-billable for a member at €50 rate over a range. Amounts Owed returns €2,000 (40 × €50). Time & Activity returns 40 h billable, 8 h non-billable, €2,000 billed amount.
- **TC-16-INT-16: Vacation math unaffected.** Approve a vacation request in an org with mixed billable / non-billable entries; the deduction amount is identical to a same-seed run without the flag.
- **TC-16-INT-17: Cross-org IDOR blocked.** PATCH an entry from another org — 404.
- **TC-16-INT-18: Session revocation.** Rotate `securityStamp` mid-cycle — next PATCH returns 401.

### E2E

- **TC-16-E2E-01: User logs a non-billable entry — happy path.** User opens the Add Entry modal, toggles Billable off, saves; sees the non-billable toast and the dashed **NB** entry in the Weekly view. The day total shows `2h 00m + 1h 00m nb`.
  - **Selectors:** `time-entry-billable-toggle`, `time-entry-billable-toggle-label`, `time-entry-log-btn`, `toast-time-logged`, `time-entry-{id}`, `time-grid-day-total-{date}`.
- **TC-16-E2E-02: User toggles a running timer to non-billable — mid-flow.** User starts a timer, waits, clicks the Billable toggle in the bar, sees the "Non-billable · started …" text; stops the timer; the resulting entry is dashed in the grid.
  - **Selectors:** `running-timer-billable-toggle`, `running-timer-status-line`, `time-entry-{id}`.
- **TC-16-E2E-03: User cannot edit another user's entry — unsuccessful flow.** Alice opens Bob's Weekly view (via a legit route only if she's admin; otherwise it's not offered). As a plain user, the entries are not clickable; toggling by direct API call returns 403 and shows the "no permission" toast.
  - **Selectors:** `time-entry-{id}` (asserted read-only for the user), `toast-time-forbidden`.
- **TC-16-E2E-04: Filter chip hides non-billable.** User toggles the **Non-Billable** chip off; non-billable entries disappear from the grid; daily totals shrink accordingly.
  - **Selectors:** `time-grid-filter-nonbillable`, `time-grid-day-total-{date}`.
- **TC-16-E2E-05: Reports Amounts Owed reflects the flag.** Admin logs 40 h billable + 8 h non-billable for a member; opens Amounts Owed for the range; the member's total equals `40 h × rate`.
  - **Selectors:** `reports-amounts-owed-total-{membershipId}` (from the future reports spec).

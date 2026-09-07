# Patch note template

Section order for `specs/patches/PATCH-NNN-slug.md`. Six sections and no others — a seventh is
the entry condition failing.

## Frontmatter

```yaml
---
id: "PATCH-004"
title: The recipient is chosen before the fields that depend on it
surface: ui                       # ui | api | validation
supersedes: requests/03           # owning spec, or null when none covers this
requirement: REQ-03-014           # the requirement this replaces, or null
cases: [TC-03-E2E-07]
files: 2                          # product files, tests aside — the entry condition's bound
---
```

## Sections

### `## Why`

Two or three sentences. What is wrong with the current behaviour as experienced, and the
decision being made. No investigation — a patch has no cause to find. If you are explaining a
mechanism here, this is a bug report.

### `## The rule`

The whole new rule, stated so this file answers it alone. EARS phrasing, as in a spec:

> When no recipient is selected, the request form shall render the contact, priority and
> needed-by controls disabled, and shall enable them when a recipient is selected.

Include what the user sees when the rule is not met, and the boundary — what stays untouched.
Where this replaces a sentence in the owning spec, state the replacement in full; do not write
"as in requirement 14 but reordered".

### `## Contracts`

Only the rows this patch touches, in the shape a spec's contracts file uses. Omit a table with
no rows; never omit a row because it already exists.

| `data-testid` | Element | Notes |
|---|---|---|
| `request-form-recipient` | Recipient select | Moves above the project select |

| Message | Route | Where |
|---|---|---|
| `Choose a recipient first` | — | `packages/validation` |

### `## Cases`

Numbered into the owning spec's scheme. Preconditions, steps, expected result, and for E2E the
selectors. State for each that it fails against the current code.

### `## Blast radius`

One short list: every other place that renders or validates the thing being changed, and what
happens to it. "Nothing else renders this form" is a valid answer and must be shown, not
assumed — name the search that established it.

### `## Not in this patch`

What a reader might expect to be covered and is not, in one line each. This is where a patch
proves it knew its edges rather than missed them.

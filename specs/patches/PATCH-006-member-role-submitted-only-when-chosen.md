---
id: "PATCH-006"
title: A member's role is submitted only when it is chosen
surface: ui
supersedes: user-management/05
requirement: null
cases: []
files: 2
---

## Why

An admin cannot save anything on the About tab of a member whose stored role is the legacy
`member`: the form always submits `role`, so it sends `member` straight back, and the route
refuses it with `Invalid role`. The country and the job title are unreachable behind a role the
admin never touched and does not want to change. The decision is that editing a job title is not
an occasion to assign a role — a field the person did not fill in is not a field they submitted.

## The rule

WHERE the caller changes a member's role, THE SYSTEM SHALL submit `role` on
`PUT /api/organizations/{orgId}/members/{memberId}` and apply it exactly as it does today —
validated against `admin | manager | user | viewer`, refused with `Invalid role` when it is not
one of them, gated by the role-change authority matrix, and guarded by the zero-admin count.

WHERE the caller does not change it, THE SYSTEM SHALL omit `role` from the body, and the route
SHALL leave `Membership.role` exactly as it found it — validating nothing about it, checking no
change authority, and running no zero-admin count, because no change is being asked for.

**Presence decides, and this route already says so.** `countryCode` on the same body carries the
same rule for the same reason: a body without the key changes nothing. `role` now joins it.

**What this does not do.** It does not make `member` assignable — `isValidRole` is untouched, so
no write can put a legacy value into the column. It does not migrate an existing `member` row to
`user`; the row keeps what it holds until somebody deliberately picks a role, and every
capability check goes on reading it through `normalizeRole`, which already answers `user`. It
does not change a status code, a message, or a response body: a caller that keeps sending `role`
gets precisely the behaviour it gets today, including `Invalid role` for a value that is not in
the enum.

**What it looks like when it is wrong.** Saving a job title on a legacy-role member returns
`400 Invalid role` and nothing is stored.

## Contracts

No new `data-testid`. No new message. No route added and no response body changed.

| Field | Route | Change |
|---|---|---|
| `role` | `PUT /api/organizations/{orgId}/members/{memberId}` | Becomes optional in the request body; presence decides whether the column is written |

`MESSAGES.role.invalid` (`Invalid role`) still exists and is still what an out-of-enum `role`
is refused with — it is now unreachable by a caller who is not assigning a role.

## Cases

**None written, at the user's direction** — this was asked for as patch, code, commit, with the
regression and the verification explicitly waived.

That is a real cost and it is recorded rather than hidden: nothing in the suite will fail if the
form starts submitting `role` again, and nothing proves the omitted-key path leaves the column
alone. The case this patch would otherwise carry is `TC-05-INT-16` — save a legacy-`member`
row's job title with no `role` key, expect `200`, and expect `Membership.role` still `member` —
and it belongs at integration, where it costs about half a second.

## Blast radius

- **`grep -rn "members/\${.*}\`" apps/web`** — the About form is the only caller of this route
  that sends `role`. The invite flow writes a role through `POST /api/invitations`, a different
  route this patch does not touch.
- **The role picker itself is unchanged.** It still lists what the server's `availableRoles`
  offers and still submits a chosen value.
- **Every capability check is unaffected.** They read `normalizeRole(role)`, which maps `member`
  to `user` whatever this route does.
- **The zero-admin guard still fires** on every actual demotion away from `admin`, because a
  demotion is a submitted role.

## Not in this patch

- **The role picker shows a value that is not among its options.** A legacy-`member` row makes
  the control display the bare string `member` while its list offers Admin/Manager/User/Viewer.
  That is a second defect, cosmetic, and it is a bug report rather than a decision.
- **Migrating legacy `member` rows to `user`.** A migration is a spec's to reason about, and
  `normalizeRole` already makes the two equivalent everywhere it matters.
- **The disabled Projects, Roles and Payments tabs.** They are hard-coded `disabled: true` for
  every role in `buildTabs`; they are unbuilt screens, not a permission the admin is missing.

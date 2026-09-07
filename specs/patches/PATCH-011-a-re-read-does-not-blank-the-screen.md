---
id: "PATCH-011"
title: A re-read of the Holidays screen does not blank it first
surface: ui
supersedes: time-off/02
requirement: null
cases: []
files: 1
---

## Why

Every read on Settings › Holidays raises the same wait, whether it is answering a new question
or repeating the last one. So pressing **Refresh** — or ticking the sourcing checkbox, or
saving a holiday, or deleting one — replaced the summary and the table with preloaders for the
length of a round trip and then drew the whole screen again. On a fast reply that is a flash;
on a slow one it is the screen being thrown away and rebuilt in front of the person who asked
for one row to change.

The wait is right for a year tab and for the country filter: what is on screen there is the
answer to a different question, and holding it up would be a lie about which year is shown. It
is wrong for a re-read of the same question, where last moment's answer is the best thing
available until the new one arrives.

## The rule

THE SYSTEM SHALL keep the holiday list and the summary on screen while it re-reads them after
a write of its own — a sync, a holiday saved, a holiday deleted — and SHALL replace their
content only once the new content is in hand.

THE SYSTEM SHALL draw the loading state when it has nothing to show yet, and when a read
answers a question the screen was not already answering: the year tab and the country filter.

An error is unchanged: a re-read that fails still shows the error banner and its Retry, and
Retry itself still draws the wait, because at that point there is nothing on screen to keep.

**What it looks like when it is wrong.** Pressing Refresh empties the screen before filling it.

## Contracts

No route, no message, no `data-testid`. `holidays-loading-skeleton` still appears on the first
read of the screen and on a year or country change; `holiday-sourcing-status` still marks a
sync in flight, which is what says the screen is working while the rows stand.

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: `TC-02-E2E-01` waits for `holiday-sourcing-status` and then for it to go, which still
passes and no longer says anything about the table underneath. The case this would carry
asserts `holidays-table` is present continuously across a Refresh.

## Blast radius

- **Settings › Holidays only.** Both reads live in that page's own component.
- **The summary can now be a moment stale** — the previous figures stand while the new ones are
  fetched. They are figures for the same year, and the sync's own status line says a read is in
  flight, so there is no moment where a number is presented as settled while it is not.
- **A failed re-read still blanks the list**, because the error branch replaces it. That is the
  existing behaviour for a read that has no answer to show.
- **Nothing about the API changes.** The same requests are made, in the same order.

## Not in this patch

- **The summary not being re-read when a holiday is added or deleted.** It is stale until the
  next year change, and it was before this patch too. A separate defect.
- **The preloader that replaces the whole screen on the first load.** That one is a real wait
  with nothing behind it, and it stays.

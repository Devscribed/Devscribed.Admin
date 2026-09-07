---
id: "PATCH-007"
title: The holiday double answers an unseeded country with holidays, not with emptiness
surface: api
supersedes: time-off/02
requirement: null
cases: []
files: 1
---

## Why

Running the app locally, an admin whose organization has a Belarusian member is told
"Belarus: The holiday service lists no public holidays for this country this year." The service
lists ten. Nothing asked it: outside production the port selects the local double, and the
double answers every country it was not taught with an empty array — Belarus among them, and
every country but the eight in its table.

The sentence on screen is a claim about a third party, and in development it is false about
almost every country. Worse, an empty answer is *recorded*: it writes a `HolidayImport` with a
count of zero, and a sourced year is never re-asked, so pointing `HOLIDAY_PROVIDER` at `nager`
afterwards still shows nothing until somebody presses Refresh.

The decision is that an unseeded country is an ordinary covered country, not an empty one.

## The rule

WHERE the local driver is asked for a country it holds no entry for, THE SYSTEM SHALL answer a
small nationwide set of `Public` entries for the requested year, so that country is sourced like
any other.

THE SYSTEM SHALL keep answering an empty array for `VA` alone, which is the country the bundle
seeds to reach the covered-but-empty state deliberately.

Every other row of the double's table is unchanged: `PL`, `DE` and `US` keep their shapes, `MT`
keeps its malformed entries, `IN` and `AE` keep refusing the connection, and `AQ` keeps never
answering. A test that needs an empty country names `VA` or seeds one through the override hook,
which is what the integration suite already does.

**What this is not.** It is not a change to the real driver, to the port, to the provider
selection, or to any rule about what an import does with what it is handed. `nager` answers what
Nager answers. Production is untouched — the double runs only when `NODE_ENV` is not
`production` or `HOLIDAY_PROVIDER` says `fake`.

**What it looks like when it is wrong.** A country nobody seeded reports `empty` and the screen
says the service lists no holidays for it.

## Contracts

No route, no message, no `data-testid` and no response body changes. The double's own table is
the contract, and one row of it moves:

| Country | Was | Is |
|---|---|---|
| anything not otherwise named | An empty array — recorded as covered-but-empty | A small nationwide set, sourced like any covered country |
| `VA` | An empty array | Unchanged — the deliberate covered-but-empty case |

## Cases

**None written, at the user's direction** — asked for as patch, code, commit, with the
regression waived.

The cost: nothing will fail if the catch-all goes back to `empty`. The case this would carry is
`TC-02-INT-17` — ask the double for a country it does not name, expect entries rather than an
empty array — and it belongs at unit level against `defaultBehaviour`, where it costs nothing.

## Blast radius

- **The integration suite does not rely on the catch-all.** Its empty-country cases call
  `provider.answersEmpty('GB')` explicitly before asking, so they keep the behaviour they seed.
- **`TC-02-E2E-02` uses `GB` through the catch-all** and asserts only that
  `holiday-summary-country-GB` appears and disappears with the checkbox. It does not assert the
  country is empty, so it holds either way — and it now exercises a country with holidays in it,
  which is the more representative path.
- **The Vatican case keeps its meaning.** It named `VA` already, so covered-but-empty stays
  reachable on purpose rather than by accident — which is the whole reason to make this change.
- **The time-tracking `BY` case is untouched.** It creates its holiday by hand and never opens
  Settings › Holidays, and a sync runs only when that screen loads.
- **A developer's existing local data keeps its recorded emptiness.** A year already synced holds
  a `HolidayImport` with a count of zero and is never re-asked; Refresh is what re-asks it. That
  is the shipped rule and this patch does not change it.

## Not in this patch

- **Pointing local development at the real service.** `HOLIDAY_PROVIDER=nager` in
  `apps/api/.env` already does it; the keys are documented in `.env.example`. The default stays
  `fake` so a fresh clone needs no configuration and no test reaches the network.
- **Re-asking a country recorded as empty.** REQ-02-007 is deliberate — it is what makes an
  admin's deletions survive — and Refresh is its escape hatch.
- **The wording of the covered-but-empty message.** It is correct for a country that really is
  empty; the defect was the double claiming that state, not the sentence.

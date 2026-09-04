# 0012. A test reads its own interviewer's calendar, never the run's latest event

**Status:** current

## Rule

`GET /api/test/calendar/latest` takes `?mailbox=`, the interviewer's address, and the E2E
helpers that read an invite or a manage link out of it — `latestInviteLink` and
`latestManageLink` — require that address. No test asks for the process-wide latest event.

This is the calendar's copy of the rule the mail sink already had: `GET /api/test/mail/latest`
narrows to `?email=`, and a test reads the message sent to *its* address, not the last message
anyone was sent.

## What it replaced

The endpoint answered the last event the fake calendar had created, with no filter, and both
helpers read it that way. Every hiring E2E test books an interview and then reads "the latest"
invite to find its candidate card.

## Why

The fake calendar is one in-memory map inside one API process, and every Playwright worker
shares it. Between a test's booking and its read of the latest event, any other worker's booking
lands in the same map, and the test opens the other test's link. The signed-in member then reaches
another organization's candidate and gets the not-found state, so the card's fields are never
drawn and the first assertion on them fails with "element not found".

The window is a few milliseconds wide, which is why two workers passed a whole suite and five
produced one failure in one file. A green run at a low worker count said nothing about the race.

## What it costs

Every call site names the interviewer's mailbox. Each test already holds it — the organization
owner's email for a vacancy created with `createVacancy`, the member's email for one created with
`createVacancyFor` — so the cost is one argument, made required so that a new test cannot omit it
and put the race back.

The endpoint still answers unfiltered when `mailbox` is absent, as the mail sink does, so a manual
`curl` keeps working. The helpers are where the rule is enforced.

# 0011 — One toast queue for the whole app, and it stacks

**Decided** 2026-09-03.

## The rule now

The application has one toast queue: `ToastProvider` in `apps/web/src/toast.tsx`, mounted once in
the root layout, drawing the design system's `ToastHost` (decisions §54) in the top-right corner.
Every screen reaches it through `useToast()`, which returns:

- `push({ message, tone?, testId?, autoClose? })` — adds a line and returns its id. The message
  is a node, so a failure can carry its retry; `autoClose: 0` leaves a plate standing until it is
  dismissed, which is what a plate carrying a retry needs.
- `dismiss(id)` — takes a line down, which is how a screen retires a standing failure once the
  thing it reported has been fixed another way.
- `showToast(testId, message, tone = 'success')` — the older shape, kept so the thirty-eight
  screens that call it do not move. New code calls `push`.

**A new message adds a line. It never replaces one**, not even one carrying the same test id.
Two identical confirmations are two events — two interviews cancelled, two fields saved — and a
queue that collapsed them would be saying the second did not happen.

No screen mounts a `ToastHost` of its own. The queue is still the caller's, as §54 divides it;
the caller is the app, once.

## What it replaced

Two queues with different rules:

- **The root provider replaced by test id.** A message raised twice under one test id took the
  first one's place and restarted its clock, on two arguments: a column reading "Saved" over
  "Saved" says nothing the first did not, and two live nodes with one `data-testid` are an
  ambiguous locator that Playwright's strict mode is right to refuse.
- **Hiring had its own hook**, `apps/web/src/hiring/useToasts.ts`, with a stacking rule its
  specs required, a message that could be a node, a standing plate, and a `ToastHost` mounted
  on each of five screens. It existed because the root provider could not express what the
  hiring specs asked for, and it grew the capabilities the root one lacked.

The split held only by accident: no hiring file imported the root hook, so the day one did, two
columns would have drawn in the same corner over the same page.

## Why stacking won

The hiring specs state the rule and the reason (03 design §Toasts); the root provider's rule
lived in a code comment. Between a written requirement and a comment, the requirement wins, and
its reason is the better one for a product that confirms events rather than states: the plate
reports that something happened, and something that happened twice happened twice.

The locator argument is real and is paid for where it belongs. A test that repeats an action
inside one clock (3400ms) and then locates the plate by test id alone will find two; it locates
the last one, or waits for the first to leave. No case in the suite did this at the time of the
change — the E2E files that raise toasts were run after it and pass unchanged — so the cost is
a rule for future cases rather than a repair to present ones.

## What it costs

- **`showToast` keeps its `success` default.** Most confirmations should be untyped (§54), and
  the thirty-eight screens that chose green are re-decided one at a time, on the screen each is
  on, not by this change.
- **Ambiguous locators within one clock**, as above.
- **A standing failure is the caller's to take down.** `push` returns the id for that reason;
  a screen that raises `autoClose: 0` and forgets the id leaves a plate nobody can remove but
  the reader.

The specs amended: user-management 03 (design), which introduced the provider; user-management
04 and 07 (design), which described the old plate; hiring 03 (design), which described the
hiring queue as its own.

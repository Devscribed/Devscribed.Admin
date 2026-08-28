# implement — attempt 5

Run `2026-08-28T17-26-56_documents-04-signature-providers` · spec `specs/documents/04-signature-providers.md`
· branch `spec/signwell-provider` · diff base `57d55ac`.

QA sent back three E2E failures. All three are **fixed**, none is contested, and running them
surfaced two more defects in the same file that QA could not have reached because the reported ones
failed first. Every fix is in the E2E case or in the test-support fixture behind it; **no product
behaviour changed.**

---

## TC-04-E2E-01 — `check()` on a control the design system hides

**Fixed.** The witness is exactly right. `1_DS for dev/components/forms/Radio.jsx` renders the real
`<input type="radio">` at one pixel, `opacity: 0`, `pointer-events: none`, and draws the control as a
decorative `<span>` beside it. Playwright's `check()` requires the *target element itself* to receive
the pointer event, so the hit test lands on the span every time and the click is retried for the full
timeout. The control is not broken — a person clicks the `<label>` that wraps both, and the browser
turns that into activation of the input.

The case now clicks what a person clicks:

```ts
await page.getByTestId('signing-provider-option-signwell').locator('label').click();
await expect(signwell).toBeChecked();
await expect(builtIn).not.toBeChecked();
```

The two assertions after the click are the point of writing it this way. If the row ever stops being
clickable, the case fails on "the radio did not turn on" rather than on a thirty-second timeout that
says only that Playwright gave up.

**The confirmation checkbox had the same defect one screen later**, and QA never reached it because
the radio failed first: `signing-change-confirm` is a DS `Checkbox` with the same hidden input, and
`.check()` on it would have failed too — its test id is on the `<label>`, so `.check()` would not
even have found a checkbox. It is now `.click()`, which is what every other checkbox in this suite
already does (`signing-consent-checkbox` in `envelopes-signing.spec.ts`).

## TC-04-E2E-02 — the loading placeholder was raced, and two more things behind it

**Fixed**, and this one took three passes because each fix uncovered the next.

1. **The race QA reported.** The spec asks the case to see `sign-embedded-loading` appear *and be
   replaced*, which is a transition, and a transition cannot be observed if it is over before the
   assertion polls. The skeleton is unmounted by the iframe's own `load`, which against an
   in-process stub on the same host fires within milliseconds. Fixed with a **gate rather than a
   sleep**: the test holds the widget request until it has seen the placeholder, then releases it.
   A timing fix would only have moved the flake — the first `/sign/{token}` of a run also pays for
   Next compiling the route, so any delay long enough for a cold machine is wasted on a warm one.
   With a gate there is no number to get wrong.
2. **`goto` deadlocked against that gate.** Its default `waitUntil: 'load'` waits for subresources,
   and whether the iframe mounts before or after `load` depends on how long hydration takes — so the
   first (cold) attempt hung for the full 30s test timeout while the retry passed in 1.6s. Now
   `waitUntil: 'domcontentloaded'`, which is what a page holding one of its own subresources needs.
3. **The assertion after it could never have run.** `expect(new URL(signer.url()).origin).toBe(new
   URL(link).origin)` throws `TypeError: Invalid URL`, because `signingLinkFor` returns a *pathname*
   — `new URL(...).pathname`, so that `goto` resolves it against the base URL. The line had never
   executed, because the case failed above it every time. It now compares against our own origin,
   derived the way `helpers.ts` derives `API`, and additionally asserts the path is still the signing
   link:

   ```ts
   expect(new URL(signer.url()).origin).toBe(new URL(WEB).origin);
   expect(new URL(signer.url()).pathname).toBe(link);
   ```

### The real cause underneath it: a fixture that was global in a parallel suite

With the three above fixed the case still failed intermittently — and the failure snapshot showed the
signer looking at **the provider-unreachable card** for a link that was perfectly good.

`playwright.config.ts` sets `fullyParallel: true`, and `TC-04-E2E-03` flips the stub's health with a
single boolean on the one in-process stub. So the case whose whole job is to make the provider
unreachable was making it unreachable **for every case running beside it**. The stub's own comment
says it exists to make the provider unreachable "inside one test"; a global switch cannot honour that.

Fixed where the defect is, rather than by serialising the file:

- `stub-signwell-http-client.ts` — health is now a `Set` of unhealthy organization ids. Every call
  names the organization it acts for: `createDocument` from `body.metadata.organization_id`, and
  `getDocument` / `deleteDocument` / `completedPdf` from the metadata the create stored. `ping` and
  `hooks` are account-wide with no organization in scope and are always healthy — the settings
  screen's connection check is a statement about the vendor, not about one tenant, and no case
  asserts otherwise. `listDocuments` is the same: the orphan scan pages the whole account.
- `signwell-stub.controller.ts` — `POST /api/test/signwell/health` takes `orgId`, resolves it through
  the existing `resolveFixtureScope`, and **refuses** when no organization is in scope rather than
  falling back to global. A fixture that silently widens its own blast radius is the thing being
  fixed.
- The E2E helper names the organization it is switching.

I chose this over `test.describe.configure({ mode: 'serial' })` deliberately. Serial would have hidden
the hazard rather than removed it, left it waiting for the next case added to this file, cost the
parallelism the config's own comment says was measured ("6 → 205s with no flakes"), and made a single
failure skip the remaining four cases — which is exactly the information a QA cycle needs most.

## TC-04-E2E-04 — logging out is two clicks

**Fixed.** The control lives inside the account menu; `app-shell.spec.ts:34-35` is the established
two-line pattern and this case had only the second line. It now opens
`topbar-account-button` first.

---

## One thing outside the findings

The static gate blocked on `apps/api/test/database-url.ts`, which is **not this stage's file**: it
comes from `a68b7a6`, an operator commit that teaches the suite to learn the test database's port
from `.env` — the same 5433/5434 collision my earlier attempts worked around with an explicit
`TEST_DATABASE_URL`. The new helper carried an `eslint-disable-next-line
@typescript-eslint/no-var-requires` for a lazy `require('node:fs')`, and rule 2 reads the whole diff,
so the gate stops the run on it.

I removed the need for the suppression rather than the suppression itself: both are Node builtins with
nothing to defer, so they are now static `import`s at the top of the file and the disable is gone.
Behaviour is identical, and the change is proved by the run below — **every integration command in
this attempt ran without `TEST_DATABASE_URL` set**, which is what the operator's change was for and
what my earlier attempts could not do.

## What I ran

    npm run test:unit                                     19 files, 941 tests, all pass
    npx tsc --noEmit -p apps/api/tsconfig.json            clean
    npx tsc --noEmit -p apps/web/tsconfig.json            clean
    npm run build  (apps/web)                             succeeds
    terraform fmt -check -recursive                       clean
    node scripts/static-gate.mjs                          pass

Integration, from `apps/api`, **with no `TEST_DATABASE_URL` override**:

    npx jest --maxWorkers=4 test/signwell-send.spec.ts test/signwell-webhook.spec.ts \
      test/signwell-reconcile.spec.ts test/signwell-completion.spec.ts \
      test/signwell-client.spec.ts test/signing-settings.spec.ts test/signing-embedded.spec.ts \
      test/envelopes.spec.ts test/signing.spec.ts test/capability.spec.ts test/org-scope.spec.ts \
      test/document-templates.spec.ts test/outbox.spec.ts test/test-fixtures.spec.ts \
      test/drivers.spec.ts test/autofill.spec.ts
        -> 16 suites, 194 tests, all pass

E2E, from `e2e` — the exception to the usual rule, because these findings *are* E2E failures and
handing back an unverified fix would spend another whole cycle:

    CI=1 npx playwright test tests/signature-providers.spec.ts
        -> 5 passed (22.6s), no retries, no flakes
    CI=1 npx playwright test tests/signature-providers.spec.ts tests/regressions.spec.ts
        -> 14 passed (33.8s)
    CI=1 npx playwright test tests/signature-providers.spec.ts        (again, for the flake)
        -> 5 passed (21.6s)

Three clean runs rather than one, because two of the three defects here were intermittent and a
single green run is what let them ship in the first place. In the passing runs TC-04-E2E-02 and
TC-04-E2E-03 execute **concurrently** and both pass, which is the isolation fix doing its job.

## Files touched

| Finding | Files |
|---|---|
| TC-04-E2E-01, -02, -04 | `e2e/tests/signature-providers.spec.ts` |
| TC-04-E2E-02's root cause | `apps/api/src/signature/signwell/stub-signwell-http-client.ts`, `apps/api/src/test-support/signwell-stub.controller.ts` |
| static gate | `apps/api/test/database-url.ts` |

No product source changed. No assertion was removed or loosened — the E2E case gained six and lost
none — and the only suppression in the diff is now gone.

## Verdict

`pass`, no findings.

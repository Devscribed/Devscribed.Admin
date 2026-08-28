import { expect, test, type APIRequestContext } from './fixtures';
import {
  API,
  createEnvelope,
  createTemplate,
  inviteAndAcceptViaApi,
  login,
  signIn,
  signingLinkFor,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * specs/documents/04-signature-providers.md — the E2E row of its matrix.
 *
 * Five cases, and each is here only because its assertion is out of reach of an API test:
 * a browser is what can say that the address bar never leaves our origin, that a frame's
 * `src` is what the provider returned, that a control is not drawn for a manager, and that
 * a nav item a role cannot use is absent rather than dead. Everything a server decides —
 * who may change the provider, what a webhook is answered with, which columns a send pins
 * — is proved at integration, where it costs half a second instead of eight.
 *
 * The provider is the **stub driver** (`SIGNWELL_DRIVER=stub`, set by
 * `playwright.config.ts`), so nothing here reaches SignWell, spends their create budget,
 * or depends on their availability.
 */

/**
 * **Both fields are sender-owned, and that is a constraint of the driver rather than a
 * simplification.** The stub materializes one required signature field per recipient and
 * nothing else, because it is handed a rendered PDF and cannot read text tags out of it
 * (`stub-signwell-http-client.ts` says so at its head). A signer-owned field would emit a
 * `{{Text_n}}` tag the stub never turns into a field, and requirement 38 would then abort
 * every send here with `document_fields_not_materialized` before a single assertion ran.
 * The signer-owned tag path is a server rule and is proved where it costs half a second:
 * TC-04-INT-01 sends it, TC-04-INT-03a watches the parse land, TC-04-INT-03b watches a
 * tag that failed to parse abort the send, and TC-04-UNIT-01..03 pin the translation.
 */
const FIELDS = [
  { key: 'full_name', label: 'Full name', required: true, filledBy: 'sender', order: 1 },
  {
    key: 'contractor_bank',
    label: 'Bank details',
    type: 'multiline',
    required: true,
    filledBy: 'sender',
    order: 2,
  },
];

const BODY = '<p>AGREEMENT with {{full_name}}.</p><p>Bank details: {{contractor_bank}}</p>';

/**
 * Every required sender-owned field, so the send passes spec 02 requirement 7 and the
 * frozen HTML carries no `{{…}}` a text tag would have to be invented for.
 */
const FIELD_VALUES = {
  full_name: 'Alex Kaminski',
  contractor_bank: 'IBAN DE02 1203 0000 0000 2020 51',
};

/**
 * Our own origin, derived exactly as `helpers.ts` derives `API` and as playwright.config.ts
 * derives its `baseURL`. TC-04-E2E-02 needs it as a value rather than as a default, because
 * the thing it asserts is that the address bar is still ours after the widget loads.
 */
const WEB = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

const SIGNING_SETTINGS = (orgId: string) => `/org/${orgId}/settings/signing`;

/** Headers for `/api/test/*`, empty locally exactly as `helpers.ts` builds them. */
const FIXTURE_HEADERS: Record<string, string> = process.env.E2E_FIXTURE_TOKEN
  ? { authorization: `Bearer ${process.env.E2E_FIXTURE_TOKEN}` }
  : {};

/** An organization with a published template, signed in on `request`. */
async function seedOrganization(
  request: APIRequestContext,
): Promise<{ orgId: string; adminEmail: string; templateId: string }> {
  const adminEmail = uniqueEmail('provider-admin');
  const { organizationId } = await signupOrg(request, {
    orgName: 'Provider Co',
    email: adminEmail,
    timezone: 'Europe/Berlin',
  });
  const templateId = await createTemplate(request, organizationId, {
    name: 'Contractor agreement',
    bodyHtml: BODY,
    fields: FIELDS,
    publish: true,
  });
  return { orgId: organizationId, adminEmail, templateId };
}

/** Points the organization at SignWell through the product's own endpoint. */
async function useSignWell(request: APIRequestContext, orgId: string): Promise<void> {
  const response = await request.put(`${API}/api/organizations/${orgId}/settings/signing`, {
    data: { provider: 'signwell', confirmed: true },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not select SignWell (${response.status()} ${await response.text()})`,
    );
  }
}

/**
 * TC-04-E2E-03's switch: the stub answers 503 for **this organization**, then recovers.
 *
 * The organization is named because the suite runs `fullyParallel` and every case seeds its
 * own: a switch that applied to the whole stub would take the provider away from whatever
 * else is mid-flight, which is precisely how TC-04-E2E-02 came to open a good link and be
 * shown the "we can't open this document right now" card.
 */
async function setProviderHealth(
  request: APIRequestContext,
  orgId: string,
  healthy: boolean,
): Promise<void> {
  const response = await request.post(`${API}/api/test/signwell/health`, {
    headers: FIXTURE_HEADERS,
    data: { orgId, healthy },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not set provider health (${response.status()})`);
  }
}

async function completeViaStub(
  request: APIRequestContext,
  orgId: string,
  envelopeId: string,
): Promise<void> {
  const response = await request.post(`${API}/api/test/signwell/complete`, {
    headers: FIXTURE_HEADERS,
    data: { orgId, envelopeId },
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not complete through the stub (${response.status()} ${await response.text()})`,
    );
  }
}

test.describe('Spec 04 — signature providers', () => {
  test('TC-04-E2E-01: an admin switches the organization to SignWell', async ({
    page,
    request,
  }) => {
    const { orgId, adminEmail, templateId } = await seedOrganization(request);
    // One in-flight document, so the modal has a count to name.
    await createEnvelope(request, orgId, {
      templateId,
      fieldValues: FIELD_VALUES,
      signers: [
        { name: 'Pat Owner', email: 'company@provider.test' },
        { name: 'Alex Kaminski', email: uniqueEmail('counterparty') },
      ],
      send: true,
    });

    await signIn(page, adminEmail);
    await page.goto(SIGNING_SETTINGS(orgId));
    await expect(page.getByTestId('signing-settings')).toBeVisible();

    const builtIn = page.getByTestId('signing-provider-option-internal').getByRole('radio');
    const signwell = page.getByTestId('signing-provider-option-signwell').getByRole('radio');
    await expect(builtIn).toBeChecked();
    await expect(page.getByTestId('signing-provider-status-signwell')).toContainText(/test mode/i);

    /*
     * Clicked the way a person clicks it, and not with `check()`.
     *
     * The design system's `Radio` hides the real `<input>` at one pixel with
     * `pointer-events: none` and draws the control as a `<span>` beside it, so the input
     * itself can never pass Playwright's actionability check — the pointer event lands on
     * the decorative span every time, and `check()` retries for its whole timeout. What a
     * signer or an admin actually clicks is the `<label>` wrapping both, which is what the
     * browser turns into activation of the control. It is the same reason every checkbox
     * in this suite is `click()`ed rather than `check()`ed — see
     * `signing-consent-checkbox` in envelopes-signing.spec.ts.
     *
     * The assertion after it is the point of writing it this way: if the row ever stops
     * being clickable the case fails on "the radio did not turn on", not on a thirty-second
     * timeout that says only that Playwright gave up.
     */
    await page.getByTestId('signing-provider-option-signwell').locator('label').click();
    await expect(signwell).toBeChecked();
    await expect(builtIn).not.toBeChecked();

    await page.getByTestId('signing-provider-save').click();

    const modal = page.getByTestId('signing-change-modal');
    await expect(modal).toBeVisible();
    await expect(page.getByTestId('signing-change-inflight')).toContainText('1');

    // The one place a disabled submit is permitted: a deliberate confirmation.
    const submit = page.getByTestId('signing-change-submit');
    await expect(submit).toBeDisabled();
    // The label, for the reason above: the DS checkbox hides its input too.
    await page.getByTestId('signing-change-confirm').click();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(page.getByTestId('toast-signing-provider-saved')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('signing-provider-status-signwell')).toContainText(/active/i);
    await expect(page.getByTestId('signing-test-mode-banner')).toBeVisible();
  });

  test('TC-04-E2E-02: the signing page hosts the widget on our origin', async ({
    page,
    request,
    browser,
  }) => {
    // Whichever case reaches `/sign/{token}` first pays for Next compiling the route, which
    // is seconds on a cold dev server and nothing at all afterwards. That cost is the run's,
    // not this assertion's, and it should not be what decides whether the case passes.
    test.slow();
    const { orgId, templateId } = await seedOrganization(request);
    await useSignWell(request, orgId);
    const counterparty = uniqueEmail('counterparty');
    const envelope = await createEnvelope(request, orgId, {
      templateId,
      fieldValues: FIELD_VALUES,
      signers: [
        { name: 'Pat Owner', email: counterparty },
        { name: 'Alex Kaminski', email: uniqueEmail('second') },
      ],
      send: true,
    });
    expect(envelope.id).toBeTruthy();

    const link = await signingLinkFor(request, counterparty);

    // A fresh context: the signing surface is session-less and authorized by its token
    // alone, so opening it in the admin's tab would prove nothing.
    const context = await browser.newContext();
    const signer = await context.newPage();
    try {
      /*
       * The spec asks this case to see `sign-embedded-loading` appear **and be replaced**,
       * which is a transition and not a state — and a transition cannot be observed if it is
       * over before the assertion polls. The skeleton is unmounted by the iframe's own
       * `load`, and against an in-process stub on the same host that fires within
       * milliseconds of the frame mounting, so the case was reading a page where the widget
       * had already arrived and failing on "element(s) not found".
       *
       * So the widget is held until this test lets it go, rather than raced with a sleep.
       * A timing fix would only move the flake: the first `/sign/{token}` of a run also pays
       * for Next compiling the route, which is seconds, and a delay long enough to cover
       * that on a cold machine is a delay wasted on every warm one. A gate has no such
       * number in it — the placeholder is visible because the widget provably cannot have
       * loaded yet.
       *
       * Nothing about what is under test moves: the page still has to render the
       * placeholder itself, and it still has to replace it with the frame on the widget's
       * own `load`. A real widget over a real network is slower than the stub, not faster,
       * so a held one is the more production-like of the two.
       */
      let releaseWidget = (): void => undefined;
      const widgetHeld = new Promise<void>((resolve) => {
        releaseWidget = resolve;
      });
      await signer.route('**/api/test/signwell/widget*', async (route) => {
        await widgetHeld;
        await route.continue();
      });

      /*
       * `domcontentloaded`, because the default `load` waits for every subresource — and
       * this case is deliberately holding one of them. Whether the iframe mounts before or
       * after `load` depends on how long hydration and the token fetch take, so the default
       * deadlocked `goto` against the gate on a cold run and resolved fine on a warm one:
       * a 30s test timeout on the first attempt and 1.6s on the retry.
       */
      await signer.goto(link, { waitUntil: 'domcontentloaded' });

      // The skeleton holds the frame's box before the widget arrives, so the page does not
      // reflow when it does. The generous timeout is the route compile on a cold run, not
      // the widget: that one is not going anywhere until the line below.
      await expect(signer.getByTestId('sign-embedded-loading')).toBeVisible({
        timeout: 30_000,
      });

      releaseWidget();
      const frame = signer.getByTestId('sign-embedded-frame');
      await expect(frame).toBeVisible();
      // Replaced, not merely covered.
      await expect(signer.getByTestId('sign-embedded-loading')).toHaveCount(0);

      /*
       * The browser never left our origin — the widget is framed, not navigated to.
       *
       * Compared against our origin and not against the link, which is a *pathname*:
       * `signingLinkFor` returns `new URL(...).pathname` so that `goto` resolves it against
       * the base URL, and `new URL(pathname)` throws. That line could never have run — the
       * case failed above it every time — which is how it survived to be found by a run that
       * got further.
       */
      expect(new URL(signer.url()).origin).toBe(new URL(WEB).origin);
      expect(new URL(signer.url()).pathname).toBe(link);

      // The frame carries the URL the provider returned, not one this page invented.
      const src = await frame.getAttribute('src');
      const surface = await (
        await request.get(`${API}/api/sign/${link.split('/sign/')[1]}`)
      ).json();
      expect(src).toBe(surface.embeddedSigningUrl);

      await expect(signer.getByTestId('sign-test-badge')).toBeVisible();
      // Our own signature capture is not drawn: their widget owns the act of signing.
      await expect(signer.getByTestId('signing-signature-canvas')).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test('TC-04-E2E-03: an unreachable provider keeps the link usable', async ({
    request,
    browser,
  }) => {
    const { orgId, templateId } = await seedOrganization(request);
    await useSignWell(request, orgId);
    const counterparty = uniqueEmail('counterparty');
    await createEnvelope(request, orgId, {
      templateId,
      fieldValues: FIELD_VALUES,
      signers: [
        { name: 'Pat Owner', email: counterparty },
        { name: 'Alex Kaminski', email: uniqueEmail('second') },
      ],
      send: true,
    });
    const link = await signingLinkFor(request, counterparty);

    const context = await browser.newContext();
    const signer = await context.newPage();
    try {
      await setProviderHealth(request, orgId, false);
      await signer.goto(link);

      const error = signer.getByTestId('sign-embedded-error');
      await expect(error).toBeVisible();
      // The card's whole job: nothing has been lost and the link still works.
      await expect(error).toContainText('your link still works');

      await setProviderHealth(request, orgId, true);
      await signer.getByTestId('sign-embedded-retry').click();
      await expect(signer.getByTestId('sign-embedded-frame')).toBeVisible();

      // The token was not consumed by the failure: it still opens.
      await signer.reload();
      await expect(signer.getByTestId('sign-embedded-frame')).toBeVisible();
    } finally {
      await setProviderHealth(request, orgId, true);
      await context.close();
    }
  });

  test('TC-04-E2E-04: a manager sees the setting but cannot change it', async ({
    page,
    request,
  }) => {
    const { orgId, adminEmail } = await seedOrganization(request);
    const managerEmail = uniqueEmail('manager');
    const userEmail = uniqueEmail('user');
    // `inviteAndAcceptViaApi` leaves the cookie jar as the invitee, so the admin signs
    // back in before issuing the second invitation — a manager cannot invite.
    await inviteAndAcceptViaApi(request, managerEmail, 'manager');
    await login(request, adminEmail);
    await inviteAndAcceptViaApi(request, userEmail, 'user');

    await signIn(page, managerEmail);
    await page.goto(SIGNING_SETTINGS(orgId));

    await expect(page.getByTestId('signing-settings')).toBeVisible();
    await expect(page.getByTestId('signing-provider-status-internal')).toContainText(/active/i);
    // Not drawn rather than drawn-and-disabled: a control this role cannot use is absent.
    await expect(page.getByTestId('signing-provider-save')).toHaveCount(0);
    await expect(
      page.getByTestId('signing-provider-option-signwell').getByRole('radio'),
    ).toBeDisabled();

    // A `user` gets the not-found page, and no Settings item to reach it with.
    // Logging out is two clicks: the control lives inside the account menu, which is what
    // `topbar-account-button` opens — the same two lines app-shell.spec.ts uses.
    await page.getByTestId('topbar-account-button').click();
    await page.getByTestId('logout-button').click();
    await page.waitForURL('**/login');
    await signIn(page, userEmail);
    await expect(page.getByTestId('nav-settings')).toHaveCount(0);
    await page.goto(SIGNING_SETTINGS(orgId));
    await expect(page.getByTestId('signing-settings')).toHaveCount(0);
  });

  test('TC-04-E2E-05: the envelope detail names the provider and marks a test document', async ({
    page,
    request,
  }) => {
    const { orgId, adminEmail, templateId } = await seedOrganization(request);
    await useSignWell(request, orgId);
    const envelope = await createEnvelope(request, orgId, {
      templateId,
      fieldValues: FIELD_VALUES,
      signers: [
        { name: 'Pat Owner', email: uniqueEmail('first') },
        { name: 'Alex Kaminski', email: uniqueEmail('second') },
      ],
      send: true,
    });
    await completeViaStub(request, orgId, envelope.id);

    await signIn(page, adminEmail);
    await page.goto(`/org/${orgId}/documents/${envelope.id}`);

    await expect(page.getByTestId('envelope-provider')).toHaveText('Signed via SignWell');
    await expect(page.getByTestId('envelope-test-badge')).toBeVisible();
    // `envelope-download-btn` is spec 02's id for a control that already exists, and
    // spec 04 defers to it rather than naming it again.
    await expect(page.getByTestId('envelope-download-btn')).toBeVisible();
    // Requirement 28 — no Certificate of Completion of ours is issued or offered.
    await expect(page.getByTestId('envelope-certificate-link')).toHaveCount(0);
  });
});

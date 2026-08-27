import { expect, test } from '@playwright/test';
import {
  addMemberToOrganization,
  createEnvelope,
  createTemplate,
  registerOrganization,
  setMembershipRole,
  signIn,
  uniqueEmail,
} from './helpers';

/**
 * The dev outbox — the screen that lets a person send an envelope and then read what went
 * out, on an environment where mail is simulated rather than delivered.
 *
 * It is a product screen, not a fixture, so it is tested like one: through the browser,
 * with the ordinary session, and never with the fixture token. The token route
 * `/api/test/mail` is what the rest of this suite reads; if these tests used it too they
 * would prove nothing about the screen a person actually opens.
 *
 * The load-bearing case is the last one. An outbox that showed every organization's mail
 * would hand a signing link — which is enough to sign *as its recipient* — to anyone with
 * an account on a shared stand.
 */

const OUTBOX = (orgId: string) => `/org/${orgId}/outbox`;

const FIELDS = [
  { key: 'full_name', label: 'Full name', required: true, filledBy: 'sender', order: 1 },
];

const BODY = '<p>AGREEMENT with {{full_name}}</p>';

async function seedSentEnvelope(
  request: Parameters<typeof registerOrganization>[0],
  prefix: string,
): Promise<{ orgId: string; adminEmail: string; signerEmail: string; title: string }> {
  const adminEmail = uniqueEmail(prefix);
  const { orgId } = await registerOrganization(request, adminEmail, 'Outbox Ltd');
  const templateId = await createTemplate(request, orgId, {
    name: 'Contractor agreement BY',
    bodyHtml: BODY,
    fields: FIELDS,
    publish: true,
  });

  const signerEmail = uniqueEmail(`${prefix}-signer`);
  const title = `Contractor agreement — ${prefix}`;
  await createEnvelope(request, orgId, {
    templateId,
    title,
    fieldValues: { full_name: 'Alex Kaminski' },
    signers: [
      { name: 'Pat Owner', email: adminEmail },
      { name: 'Alex Kaminski', email: signerEmail },
    ],
    send: true,
  });

  return { orgId, adminEmail, signerEmail, title };
}

test.describe('Dev outbox', () => {
  test('TC-OB-E2E-01: an admin sees the invitation that was sent, and its link opens the signing page', async ({
    page,
    request,
    browser,
  }) => {
    const fixture = await seedSentEnvelope(request, 'ob-admin');

    await signIn(page, fixture.adminEmail);
    await page.goto(OUTBOX(fixture.orgId));

    await expect(page.getByTestId('outbox-page')).toBeVisible();
    await expect(page.getByTestId('outbox-table')).toBeVisible();

    // The first signer is the admin themselves — signing is sequential, so exactly one
    // invitation exists at this point and it is addressed to them.
    const row = page.getByTestId('outbox-row').first();
    await expect(row).toContainText(fixture.adminEmail);
    await expect(row).toContainText(fixture.title);

    const link = await page.getByTestId('outbox-link').first().getAttribute('href');
    expect(link).toContain('/sign/');

    // Opened the way a recipient would: a fresh context with no session at all. A signer
    // is authorized by their token, and following the link from the admin's own tab would
    // prove nothing about that.
    const context = await browser.newContext();
    const signerPage = await context.newPage();
    await signerPage.goto(link!);
    await expect(signerPage.getByTestId('signing-page')).toBeVisible();
    await context.close();
  });

  test('TC-OB-E2E-02: the outbox is empty before anything is sent', async ({ page, request }) => {
    const adminEmail = uniqueEmail('ob-empty');
    const { orgId } = await registerOrganization(request, adminEmail, 'Outbox Ltd');

    await signIn(page, adminEmail);
    await page.goto(OUTBOX(orgId));

    await expect(page.getByTestId('outbox-empty')).toBeVisible();
    await expect(page.getByTestId('outbox-table')).toHaveCount(0);
  });

  test('TC-OB-E2E-03: a regular user has no outbox and no link to one', async ({
    page,
    request,
  }) => {
    const fixture = await seedSentEnvelope(request, 'ob-user');
    // A second person rather than a demotion: the sole admin cannot be demoted, and the
    // envelope has to have been sent by somebody for there to be an outbox to hide.
    const member = await addMemberToOrganization(request, fixture.orgId, {
      firstName: 'Ulad',
      lastName: 'User',
    });

    await signIn(page, member.email);

    await expect(page.getByTestId('app-sidebar')).toBeVisible();
    await expect(page.getByTestId('nav-outbox')).toHaveCount(0);

    await page.goto(OUTBOX(fixture.orgId));
    // Generous, and not because the refusal is slow. This is the first case in the file to
    // render a 404 at all, and the dev server compiles Next's built-in one on demand the
    // first time something asks for it — which costs more than the default 5s expect
    // timeout on a cold worker. The deployed run, serving a built app, answers immediately.
    await expect(page.getByText('This page could not be found')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('outbox-page')).toHaveCount(0);
  });

  test('TC-OB-E2E-04: the outbox never shows another organization mail', async ({
    page,
    request,
  }) => {
    // Two organizations, each with an envelope in flight. The second admin is moved into
    // the first organization's *neighbour*, not into it, so both exist side by side on the
    // one environment — which is exactly the situation a shared stand is in.
    const theirs = await seedSentEnvelope(request, 'ob-theirs');
    const mine = await seedSentEnvelope(request, 'ob-mine');

    await signIn(page, mine.adminEmail);
    await page.goto(OUTBOX(mine.orgId));

    await expect(page.getByTestId('outbox-table')).toBeVisible();
    await expect(page.getByTestId('outbox-row')).toHaveCount(1);

    // Their envelope, their signer, their signing link: none of it is here.
    const body = await page.content();
    expect(body).not.toContain(theirs.title);
    expect(body).not.toContain(theirs.adminEmail);
    expect(body).not.toContain(theirs.signerEmail);
  });

  test('TC-OB-E2E-05: a manager can read the outbox, because a manager sends envelopes', async ({
    page,
    request,
  }) => {
    const fixture = await seedSentEnvelope(request, 'ob-manager');
    const manager = await addMemberToOrganization(request, fixture.orgId, {
      firstName: 'Marina',
      lastName: 'Kovaleva',
    });
    await setMembershipRole(request, fixture.orgId, manager.email, 'manager');

    await signIn(page, manager.email);
    await page.goto(OUTBOX(fixture.orgId));

    await expect(page.getByTestId('outbox-page')).toBeVisible();
    // Two messages, not one: inviting the manager sent them an invitation, and an
    // invitation belongs to the organization that sent it, so the outbox shows it. That
    // is the point of the screen rather than an accident of the fixture — an admin with
    // no mail provider reaches an accept link the same way they reach a signing one.
    await page.getByTestId('outbox-type-filter').click();
    await page.getByRole('option', { name: 'Signing invitations' }).click();
    await expect(page.getByTestId('outbox-row')).toHaveCount(1);
    await expect(page.getByTestId('outbox-row').first()).toContainText(fixture.title);
  });
});

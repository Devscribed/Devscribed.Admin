import { expect, test } from './fixtures';
import {
  createEnvelope,
  createTemplate,
  registerOrganization,
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
});

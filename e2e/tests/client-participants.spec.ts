import { expect, test, type APIRequestContext, type Page } from './fixtures';
import {
  API,
  VALID,
  acceptInvitationViaApi,
  archiveRequestTopicViaApi,
  assignProjectMembersViaApi,
  findMember,
  latestInvitationToken,
  listRequestTopicsViaApi,
  login,
  signupOrg,
  uniqueEmail,
} from './helpers';

/**
 * Requests spec 03 — a person at a client as a signed-in principal.
 *
 * Every precondition below goes through this spec's own product routes or a helper that
 * already exists; nothing here is a fixture of its own.
 */

/** Signs in through the UI and waits for the destination this principal lands on. */
async function signInUi(page: Page, email: string, destination: 'members' | 'requests'): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(VALID.password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL(`**/${destination}`);
}

/** Drops the cookie and signs in as somebody else. */
async function switchUi(
  page: Page,
  email: string,
  destination: 'members' | 'requests',
): Promise<void> {
  await page.context().clearCookies();
  await signInUi(page, email, destination);
}

async function createClientViaApi(
  request: APIRequestContext,
  organizationId: string,
  name: string,
): Promise<string> {
  const response = await request.post(`${API}/api/organizations/${organizationId}/clients`, {
    data: { name },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create client ${name} (${response.status()})`);
  }
  return (await response.json()).client.id as string;
}

async function createClientProjectViaApi(
  request: APIRequestContext,
  organizationId: string,
  name: string,
  clientId: string,
): Promise<string> {
  const response = await request.post(`${API}/api/organizations/${organizationId}/projects`, {
    data: { name, clientId },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not create project ${name} (${response.status()})`);
  }
  return (await response.json()).id as string;
}

async function inviteContactViaApi(
  request: APIRequestContext,
  organizationId: string,
  clientId: string,
  email: string,
): Promise<void> {
  const response = await request.post(
    `${API}/api/organizations/${organizationId}/clients/${clientId}/contacts`,
    { data: { email } },
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not invite ${email} (${response.status()})`);
  }
}

interface ContactRow {
  id: string;
  email: string;
  status: string;
}

async function listContactsViaApi(
  request: APIRequestContext,
  organizationId: string,
  clientId: string,
): Promise<ContactRow[]> {
  const response = await request.get(
    `${API}/api/organizations/${organizationId}/clients/${clientId}/contacts`,
  );
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not list contacts (${response.status()})`);
  }
  return ((await response.json()) as { contacts: ContactRow[] }).contacts;
}

/** Invites an address to a client and accepts it, leaving the jar as the new contact. */
async function inviteAndAcceptContact(
  request: APIRequestContext,
  organizationId: string,
  clientId: string,
  email: string,
  firstName = 'Dana',
): Promise<string> {
  await inviteContactViaApi(request, organizationId, clientId, email);
  const token = await latestInvitationToken(request, email);
  await acceptInvitationViaApi(request, {
    token,
    firstName,
    lastName: 'Stone',
    password: VALID.password,
  });
  const contacts = await listContactsViaApi(request, organizationId, clientId).catch(() => []);
  const row = contacts.find((contact) => contact.email === email);
  return row?.id ?? '';
}

async function raiseClientRequestViaApi(
  request: APIRequestContext,
  organizationId: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await request.post(`${API}/api/organizations/${organizationId}/requests`, {
    data: body,
  });
  if (!response.ok()) {
    throw new Error(
      `Precondition failed: could not raise the request (${response.status()} ${await response.text()})`,
    );
  }
  return (await response.json()).id as string;
}

async function clientTopicId(
  request: APIRequestContext,
  organizationId: string,
  name = 'Access',
): Promise<string> {
  const topics = await listRequestTopicsViaApi(request, organizationId);
  const topic = topics.find((t) => t.name === name && t.audience === 'client');
  if (!topic) throw new Error(`Precondition failed: no client topic named "${name}"`);
  return topic.id;
}

test.describe('Client participants (requests spec 03)', () => {
  // TC-03-E2E-01
  test('invites a contact, signs them in on their requests, and refuses a second invitation', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('c03admin');
    const { organizationId } = await signupOrg(request, {
      orgName: 'Contacts Inc',
      email: adminEmail,
    });
    const clientId = await createClientViaApi(request, organizationId, 'Acme Contacts');
    const projectId = await createClientProjectViaApi(
      request,
      organizationId,
      'Acme Redesign',
      clientId,
    );
    const admin = await findMember(request, organizationId, adminEmail);
    await assignProjectMembersViaApi(request, organizationId, projectId, [admin.id]);

    const contactEmail = uniqueEmail('c03contact');

    await signInUi(page, adminEmail, 'members');
    await page.goto(`/org/${organizationId}/clients/${clientId}`);
    await expect(page.getByTestId('client-contacts-section')).toBeVisible();
    await expect(page.getByTestId('client-contacts-empty-state')).toBeVisible();

    await page.getByTestId('client-contact-invite-btn').click();
    await expect(page.getByTestId('client-contact-invite-modal')).toBeVisible();
    await page.getByTestId('client-contact-invite-email').fill(contactEmail);
    await page.getByTestId('client-contact-invite-submit').click();
    await expect(page.getByTestId('client-contact-invite-modal')).toBeHidden();

    // The invited address is listed before it has been accepted.
    const invited = (await listContactsViaApi(request, organizationId, clientId)).find(
      (contact) => contact.email === contactEmail,
    );
    expect(invited?.status).toBe('invited');
    await expect(page.getByTestId(`client-contact-row-${invited!.id}`)).toBeVisible();

    // Accept through the accept screen, which is the staff invitation's own.
    const token = await latestInvitationToken(request, contactEmail);
    await page.context().clearCookies();
    await page.goto(`/accept-invite?token=${encodeURIComponent(token)}`);
    await page.getByTestId('accept-first-name-input').fill('Dana');
    await page.getByTestId('accept-last-name-input').fill('Stone');
    await page.getByTestId('accept-password-input').fill(VALID.password);
    await page.getByTestId('accept-submit-button').click();
    await page.waitForURL('**/requests');

    // A request addressed to them, raised by the admin who works on the project.
    await login(request, adminEmail);
    const contacts = await listContactsViaApi(request, organizationId, clientId);
    const contact = contacts.find((row) => row.email === contactEmail)!;
    expect(contact.status).toBe('active');
    await raiseClientRequestViaApi(request, organizationId, {
      topicId: await clientTopicId(request, organizationId),
      title: 'Read access to the analytics warehouse',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.id,
    });

    await switchUi(page, contactEmail, 'requests');
    await expect(page.getByTestId('requests-page')).toBeVisible();
    await expect(page.getByText('Read access to the analytics warehouse')).toBeVisible();
    await expect(page.getByTestId('requests-new-btn')).toHaveCount(0);

    // Back as the admin: the same address again keeps the modal open with the error.
    await switchUi(page, adminEmail, 'members');
    await page.goto(`/org/${organizationId}/clients/${clientId}`);
    await page.getByTestId('client-contact-invite-btn').click();
    await page.getByTestId('client-contact-invite-email').fill(contactEmail);
    await page.getByTestId('client-contact-invite-submit').click();
    await expect(page.getByTestId('client-contact-invite-modal')).toBeVisible();
    await expect(page.getByTestId('client-contact-invite-error-email')).toHaveText(
      'This person is already a contact of a client in this workspace',
    );
    await expect(page.getByTestId('client-contact-invite-email')).toHaveValue(contactEmail);
  });

  // TC-03-E2E-02
  test('draws the requests entry and nothing else for a contact, and every entry for an admin', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('c03nav');
    const { organizationId } = await signupOrg(request, {
      orgName: 'Navigation Inc',
      email: adminEmail,
    });
    const clientId = await createClientViaApi(request, organizationId, 'Acme Navigation');
    const contactEmail = uniqueEmail('c03navcontact');
    await inviteAndAcceptContact(request, organizationId, clientId, contactEmail);

    await signInUi(page, contactEmail, 'requests');
    await expect(page.getByTestId('sidebar-requests-link')).toBeVisible();
    await expect(page.getByTestId('nav-members')).toHaveCount(0);
    await expect(page.getByTestId('nav-projects')).toHaveCount(0);
    await expect(page.getByTestId('nav-clients')).toHaveCount(0);

    // A destination the caller cannot use is not reachable by typing either: the route
    // each page reads answers 404, so no screen renders behind it.
    await page.goto(`/org/${organizationId}/members`);
    await expect(page.getByTestId('members-list')).toHaveCount(0);
    await page.goto(`/org/${organizationId}/projects`);
    await expect(page.getByTestId('projects-page')).toHaveCount(0);
    await page.goto(`/org/${organizationId}/clients`);
    await expect(page.getByTestId('clients-page')).toHaveCount(0);

    await switchUi(page, adminEmail, 'members');
    await expect(page.getByTestId('nav-members')).toBeVisible();
    await expect(page.getByTestId('nav-projects')).toBeVisible();
    await expect(page.getByTestId('nav-clients')).toBeVisible();
  });

  // TC-03-E2E-03
  // Mutates the contact's session state — every other case in this file signs the same
  // kind of principal in, so this one runs on its own.
  test.describe.serial('removal', () => {
    test('removing a contact ends their live session on the next call', async ({
      browser,
      request,
    }) => {
      const adminEmail = uniqueEmail('c03rm');
      const { organizationId } = await signupOrg(request, {
        orgName: 'Removal Inc',
        email: adminEmail,
      });
      const clientId = await createClientViaApi(request, organizationId, 'Acme Removal');
      const projectId = await createClientProjectViaApi(
        request,
        organizationId,
        'Acme Removal Redesign',
        clientId,
      );
      const admin = await findMember(request, organizationId, adminEmail);
      await assignProjectMembersViaApi(request, organizationId, projectId, [admin.id]);

      const contactEmail = uniqueEmail('c03rmcontact');
      await inviteAndAcceptContact(request, organizationId, clientId, contactEmail);
      await login(request, adminEmail);
      const contact = (await listContactsViaApi(request, organizationId, clientId)).find(
        (row) => row.email === contactEmail,
      )!;
      const requestId = await raiseClientRequestViaApi(request, organizationId, {
        topicId: await clientTopicId(request, organizationId),
        title: 'Access while signed in',
        projectId,
        assigneeKind: 'client',
        assigneeClientMembershipId: contact.id,
      });

      const contactContext = await browser.newContext();
      const contactPage = await contactContext.newPage();
      const adminContext = await browser.newContext();
      const adminPage = await adminContext.newPage();

      try {
        await signInUi(contactPage, contactEmail, 'requests');
        await contactPage.goto(`/org/${organizationId}/requests/${requestId}`);
        await expect(contactPage.getByTestId('request-detail-page')).toBeVisible();

        await signInUi(adminPage, adminEmail, 'members');
        await adminPage.goto(`/org/${organizationId}/clients/${clientId}`);
        await expect(adminPage.getByTestId(`client-contact-row-${contact.id}`)).toBeVisible();
        await expect(
          adminPage.getByTestId(`client-contact-row-${contact.id}-remove-btn`),
        ).toBeVisible();
        await adminPage.getByTestId(`client-contact-row-${contact.id}-remove-btn`).click();
        await expect(
          adminPage.getByTestId(`client-contact-row-${contact.id}-remove-btn`),
        ).toHaveCount(0);

        await contactPage.reload();
        await contactPage.waitForURL('**/login');
        await expect(contactPage.getByTestId('request-detail-page')).toHaveCount(0);
        await expect(contactPage.getByTestId('requests-page')).toHaveCount(0);
      } finally {
        await contactContext.close();
        await adminContext.close();
      }
    });
  });

  // TC-03-E2E-04
  test('offers the addressee kind, the contact picker and the per-audience catalogue', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('c03modal');
    const { organizationId } = await signupOrg(request, {
      orgName: 'Modal Inc',
      email: adminEmail,
    });
    const clientId = await createClientViaApi(request, organizationId, 'Acme Modal');
    const projectId = await createClientProjectViaApi(
      request,
      organizationId,
      'Acme Modal Redesign',
      clientId,
    );
    const admin = await findMember(request, organizationId, adminEmail);
    await assignProjectMembersViaApi(request, organizationId, projectId, [admin.id]);

    const contactEmail = uniqueEmail('c03modalcontact');
    await inviteAndAcceptContact(request, organizationId, clientId, contactEmail);
    await login(request, adminEmail);

    await signInUi(page, adminEmail, 'members');
    await page.goto(`/org/${organizationId}/requests`);
    await page.getByTestId('requests-new-btn').click();

    // The staff catalogue before the switch: a seeded staff topic is on offer.
    await page.getByTestId('request-new-topic').click();
    await expect(page.getByRole('option', { name: 'VPN' })).toBeVisible();
    await page.getByRole('option', { name: 'VPN' }).click();
    await expect(page.getByTestId('request-new-assignee-member')).toBeVisible();

    // Choosing the client kind replaces the member picker and re-reads the catalogue.
    await page.getByTestId('request-new-assignee-kind').click();
    await page.getByRole('option', { name: 'Client' }).click();
    await expect(page.getByTestId('request-new-assignee-client')).toBeVisible();
    await expect(page.getByTestId('request-new-assignee-member')).toHaveCount(0);

    await page.getByTestId('request-new-topic').click();
    await expect(page.getByRole('option', { name: 'VPN' })).toHaveCount(0);
    await expect(page.getByRole('option', { name: 'Access' })).toBeVisible();
    await page.getByRole('option', { name: 'Access' }).click();

    await page.getByTestId('request-new-title').fill('Warehouse access, please');

    // Submitting with no contact chosen shows the addressee error and leaves the submit
    // control enabled — a submit control is never disabled for validation.
    await page.getByTestId('request-new-submit').click();
    await expect(page.getByTestId('request-new-error-assignee')).toBeVisible();
    await expect(page.getByTestId('request-new-submit')).toBeEnabled();

    await page.getByTestId('request-new-assignee-client').click();
    await page.getByRole('option', { name: /Dana Stone/ }).click();

    await page.getByTestId('request-new-project').click();
    await page.getByRole('option', { name: 'Acme Modal Redesign' }).click();

    await page.getByTestId('request-new-submit').click();
    await expect(page.getByTestId('request-new-modal')).toBeHidden();
    await expect(page.getByText('Warehouse access, please')).toBeVisible();

    // With both client topics archived, the client audience has no catalogue: the picker
    // is replaced and no submit control is drawn — per audience, not per modal.
    const topics = await listRequestTopicsViaApi(request, organizationId);
    for (const topic of topics.filter((t) => t.audience === 'client' && t.status === 'active')) {
      await archiveRequestTopicViaApi(request, organizationId, topic.id);
    }

    await page.reload();
    await page.getByTestId('requests-new-btn').click();
    await expect(page.getByTestId('request-new-topic')).toBeVisible();
    await page.getByTestId('request-new-assignee-kind').click();
    await page.getByRole('option', { name: 'Client' }).click();
    await expect(page.getByTestId('request-new-topic-empty')).toBeVisible();
    await expect(page.getByTestId('request-new-submit')).toHaveCount(0);

    await page.getByTestId('request-new-assignee-kind').click();
    await page.getByRole('option', { name: 'Colleague' }).click();
    await expect(page.getByTestId('request-new-topic')).toBeVisible();
    await expect(page.getByTestId('request-new-submit')).toBeVisible();
  });

  // TC-03-E2E-05
  test('lets the addressee contact write, answer and decline, and draws no grant', async ({
    page,
    request,
  }) => {
    const adminEmail = uniqueEmail('c03act');
    const { organizationId } = await signupOrg(request, {
      orgName: 'Answering Inc',
      email: adminEmail,
    });
    const clientId = await createClientViaApi(request, organizationId, 'Acme Answering');
    const projectId = await createClientProjectViaApi(
      request,
      organizationId,
      'Acme Answering Redesign',
      clientId,
    );
    const admin = await findMember(request, organizationId, adminEmail);
    await assignProjectMembersViaApi(request, organizationId, projectId, [admin.id]);

    const contactEmail = uniqueEmail('c03actcontact');
    await inviteAndAcceptContact(request, organizationId, clientId, contactEmail);
    await login(request, adminEmail);
    const contact = (await listContactsViaApi(request, organizationId, clientId)).find(
      (row) => row.email === contactEmail,
    )!;
    const topicId = await clientTopicId(request, organizationId);
    const toAnswer = await raiseClientRequestViaApi(request, organizationId, {
      topicId,
      title: 'The one to answer',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.id,
    });
    const toDecline = await raiseClientRequestViaApi(request, organizationId, {
      topicId,
      title: 'The one to decline',
      projectId,
      assigneeKind: 'client',
      assigneeClientMembershipId: contact.id,
    });

    await signInUi(page, contactEmail, 'requests');
    await page.goto(`/org/${organizationId}/requests/${toAnswer}`);
    await expect(page.getByTestId('request-detail-page')).toBeVisible();
    await expect(page.getByTestId('request-detail-assignee')).toContainText('Dana Stone');
    await expect(page.getByTestId('request-detail-assignee')).toContainText('Acme Answering');
    await expect(page.getByTestId('request-detail-grant-btn')).toHaveCount(0);
    await expect(page.getByTestId('client-contacts-empty-state')).toHaveCount(0);

    await page.getByTestId('request-detail-composer').fill('Looking into it now.');
    await page.getByTestId('request-detail-composer-submit').click();
    await expect(page.getByTestId('request-detail-thread')).toContainText('Looking into it now.');

    await page.getByTestId('request-detail-answer-btn').click();
    await expect(page.getByTestId('request-detail-status')).toContainText('In progress');

    await page.goto(`/org/${organizationId}/requests/${toDecline}`);
    await page.getByTestId('request-detail-decline-btn').click();
    await page.getByTestId('request-detail-decline-reason').fill('We cannot open that system.');
    await page.getByTestId('request-detail-decline-confirm').click();
    await expect(page.getByTestId('request-detail-status')).toContainText('Closed');
    await expect(page.getByTestId('request-detail-thread')).toContainText(
      'We cannot open that system.',
    );
  });
});

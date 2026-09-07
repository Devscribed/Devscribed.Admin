import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { APIRequestContext, Page } from '@playwright/test';
import { API, VALID, inviteAndAcceptViaApi, login, uniqueEmail } from './helpers';

/**
 * The walkthrough kit: what a QA pass needs to drive the product by hand, so that a
 * walkthrough spends its time on the change rather than on rediscovering how to sign in.
 *
 * A walkthrough is a Playwright spec (`tests/qa-look.spec.ts`, copied from
 * `tests/qa-look.template.ts`) rather than a standalone script, and that decides three
 * things it therefore never has to get right itself:
 *
 * - **The pair and the database.** `playwright.config.ts` starts the API and the web app on
 *   ports it claims and against `devscribed_e2e`, wherever that is on this machine. A
 *   walkthrough names no port, writes no `DATABASE_URL`, and starts and stops no server.
 * - **Errors it was not looking for.** Importing `test` from `./fixtures` brings the
 *   `console.error` / `pageerror` / failed-request guard with it, which is most of what
 *   looking at a screen is for.
 * - **Seeding.** `./helpers` already reaches every state the product can be in through the
 *   API. Reimplementing one is how a walkthrough runs out of time.
 *
 * Nothing here is imported by the suite. It exists for the copied spec, which is ignored by
 * git and deleted when the pass is over.
 */

/** Where a walkthrough's screenshots land. Ignored by git; safe to overwrite between runs. */
export const LOOK_DIR = join(__dirname, '..', '.qa-look');

/**
 * A screenshot under a name a verdict can cite. Returns the path, so the note that
 * describes what was seen can point at the file that shows it.
 */
export async function shot(page: Page, name: string): Promise<string> {
  mkdirSync(LOOK_DIR, { recursive: true });
  const path = join(LOOK_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  return path;
}

/** Signs in through the UI — the browser's session, not the API request context's. */
export async function signInUi(
  page: Page,
  email: string,
  password: string = VALID.password,
): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-email-input').fill(email);
  await page.getByTestId('login-password-input').fill(password);
  await page.getByTestId('login-submit-button').click();
  await page.waitForURL('**/org/**');
}

/**
 * A member of `admin`'s organization, at `role`, ready to sign in with.
 *
 * Accepting an invitation switches the request context's cookie jar to the new member, so
 * this puts the admin back afterwards. Without that, the second call of a walkthrough is
 * refused for want of permission to invite.
 */
export async function addMember(
  request: APIRequestContext,
  admin: { email: string; password?: string },
  role: string,
  names: { firstName: string; lastName: string },
): Promise<{ email: string; password: string; fullName: string }> {
  const email = uniqueEmail(role);
  await inviteAndAcceptViaApi(request, email, role, names);
  await login(request, admin.email, admin.password ?? VALID.password);
  return {
    email,
    password: VALID.password,
    fullName: `${names.firstName} ${names.lastName}`,
  };
}

/**
 * A fresh organization and its admin, signed in on the request context.
 *
 * `signupOrg` needs an org name and an email; a walkthrough needs neither to be memorable.
 */
export async function seedOrg(
  request: APIRequestContext,
  label = 'walkthrough',
): Promise<{ organizationId: string; email: string; password: string; fullName: string }> {
  const email = uniqueEmail('admin');
  const response = await request.post(`${API}/api/signup`, {
    data: {
      orgName: `QA ${label}`,
      firstName: 'Ada',
      lastName: 'Admin',
      email,
      password: VALID.password,
      timezone: 'UTC',
    },
  });
  if (!response.ok()) {
    throw new Error(`Precondition failed: could not sign up ${email} (${response.status()})`);
  }
  const body = await response.json();
  return {
    organizationId: body.organization.id,
    email,
    password: VALID.password,
    fullName: 'Ada Admin',
  };
}

/**
 * Picks an option from one of the design system's listboxes.
 *
 * These render as a button with `aria-haspopup="listbox"`, not as a `<select>`, so
 * `selectOption` fails on every one of them.
 */
export async function chooseOption(page: Page, testId: string, label: string | RegExp): Promise<void> {
  await page.getByTestId(testId).click();
  await page.getByRole('option', { name: label }).click();
}

export { VALID, uniqueEmail } from './helpers';

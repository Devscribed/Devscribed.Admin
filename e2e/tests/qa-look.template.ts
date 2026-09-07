/**
 * Template for a QA walkthrough. Copy, do not edit in place:
 *
 *   cp tests/qa-look.template.ts tests/qa-look.spec.ts
 *   CI=1 npx playwright test tests/qa-look.spec.ts --reporter=list
 *
 * Then read the PNGs it names, and delete `tests/qa-look.spec.ts` when the pass is over.
 * That copy is ignored by git, so it can never reach a branch or the deploy gate.
 *
 * One `test` per area of the change. A failing walkthrough is a finding like any other:
 * the trace and the screenshots are its witness.
 *
 * Nothing below decides a port, a database or a server — see `qa-kit.ts`.
 */
import { expect, test } from './fixtures';
import { addMember, chooseOption, seedOrg, shot, signInUi } from './qa-kit';

test.describe('walkthrough', () => {
  test('the area, from every side that touches it', async ({ page, request, browser }) => {
    // ---- seed -------------------------------------------------------------
    const admin = await seedOrg(request, 'walkthrough');
    const user = await addMember(request, admin, 'user', { firstName: 'Uma', lastName: 'User' });
    const viewer = await addMember(request, admin, 'viewer', { firstName: 'Vic', lastName: 'Viewer' });

    // ---- the side that acts ----------------------------------------------
    await signInUi(page, user.email);
    await page.goto(`/org/${admin.organizationId}/<the route under test>`);
    await shot(page, 'user-landing');

    // A design system listbox is a button, not a <select>.
    // await chooseOption(page, '<some-select-testid>', 'Some Label');

    // ---- the side that responds ------------------------------------------
    // A second context, because signing in as somebody else in the same one ends the
    // first session. Both sides of an interaction get walked, not just the one that
    // starts it.
    const second = await browser.newContext();
    const adminPage = await second.newPage();
    await signInUi(adminPage, admin.email);
    await adminPage.goto(`/org/${admin.organizationId}/<the route under test>`);
    await shot(adminPage, 'admin-landing');
    await second.close();

    // ---- the side that may only look -------------------------------------
    const third = await browser.newContext();
    const viewerPage = await third.newPage();
    await signInUi(viewerPage, viewer.email);
    await viewerPage.goto(`/org/${admin.organizationId}/<the route under test>`);
    await shot(viewerPage, 'viewer-landing');
    await third.close();

    // An assertion is not the point of a walkthrough — the screenshots are — but one
    // that names what must not be on the screen costs nothing and cannot be misread.
    await expect(page.getByTestId('<something that must be there>')).toBeVisible();
  });
});

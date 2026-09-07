import { expect, test, type Page } from '@playwright/test';
import { bookInterview, createVacancy, registerOrganization, signIn, uniqueEmail } from './helpers';

/**
 * design-system 01 — Responsive & Pointer.
 *
 * Everything here is invisible to the rest of the suite, which runs at 1280 × 720 with a fine
 * pointer: every rule below `xl`, and every rule under a coarse pointer, is unobservable there.
 * That is what makes the change safe against regression and what makes these cases necessary.
 */

/** The well is the padded child of the scroller after the navbar; it carries a class now. */
const wellPadding = (page: Page) =>
  page.evaluate(() => {
    const well = document.querySelector('.ds-app-shell-well');
    return well ? getComputedStyle(well).padding : null;
  });

const navbarPadding = (page: Page) =>
  page.evaluate(() => {
    const bar = document.querySelector('.ds-navbar');
    return bar ? getComputedStyle(bar).paddingLeft : null;
  });

test.describe('the shell below xl', () => {
  test('TC-DS01-E2E-01: the rail is a left drawer over a painted scrim', async ({ page, request }) => {
    const email = uniqueEmail('ds01-shell');
    await registerOrganization(request, email);
    await signIn(page, email);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect(page.getByTestId('page-title')).toBeVisible();

    const rail = page.locator('.ds-app-shell-nav');
    const burger = page.getByRole('button', { name: 'Open navigation' });

    // 1 — closed, the rail is off-screen to the LEFT.
    const closed = await rail.boundingBox();
    expect(closed!.x + closed!.width).toBeLessThanOrEqual(0);

    // 2 — open: flush left, 340 wide, over a scrim that is painted and clears the navbar.
    await burger.click();
    await page.waitForTimeout(400);
    const open = await rail.boundingBox();
    expect(Math.round(open!.x)).toBe(0);
    expect(Math.round(open!.width)).toBe(340);

    const scrim = page.getByTestId('app-shell-scrim');
    const paint = await scrim.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, top: s.top };
    });
    expect(paint.background).toBe('rgba(0, 0, 0, 0.6)');
    expect(paint.top).toBe('60px'); // the navbar, not 0 — focus returns to a control up there

    // 3 — focus moved into the drawer.
    expect(await page.evaluate(() => document.querySelector('.ds-app-shell-nav')!.contains(document.activeElement))).toBe(true);

    // 4 — Escape returns it to the hamburger.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))).toBe('Open navigation');

    // 5 — the scrim closes it too.
    await burger.click();
    await page.waitForTimeout(400);
    /* The drawer is 340 wide against the left edge, so the only part of the scrim a reader can
       actually reach at 360 is the 20px strip beside it. Clicking at x: 10 would land on the
       drawer, which is the point of a scrim. */
    await scrim.click({ position: { x: 352, y: 20 } });
    await page.waitForTimeout(400);
    const shut = await rail.boundingBox();
    expect(shut!.x + shut!.width).toBeLessThanOrEqual(0);

    // 6 — edge case 4: crossing xl with the drawer open draws nothing twice.
    await burger.click();
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.waitForTimeout(300);
    expect(await page.locator('[data-testid="nav-item-members"]').count()).toBeLessThanOrEqual(1);
    await expect(scrim).toBeHidden();

    // 7 — at xl the hamburger and the scrim are not visible; at 360 they are.
    await expect(burger).toBeHidden();
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    await expect(burger).toBeVisible();

    // 8 — the title is present at both widths, at the two-step ladder.
    const type = async () =>
      page.getByTestId('page-title').evaluate((el) => {
        const s = getComputedStyle(el);
        return `${s.fontSize}/${s.lineHeight}`;
      });
    expect(await type()).toBe('20px/30px');
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.waitForTimeout(200);
    await expect(page.getByTestId('page-title')).toBeVisible();
    expect(await type()).toBe('24px/36px');
  });

  test('TC-DS01-E2E-02: the well and the navbar step their padding at md', async ({ page, request }) => {
    const email = uniqueEmail('ds01-well');
    await registerOrganization(request, email);
    await signIn(page, email);

    /* Polled rather than measured after a fixed pause. A resize is applied asynchronously, and
       under a loaded machine 120ms is sometimes not enough — which made this the one case in the
       file that flaked. Nothing here is racing the product; it is racing the browser. */
    const settles = async (width: number, expected: string) => {
      await page.setViewportSize({ width, height: 800 });
      await expect.poll(() => wellPadding(page), { message: `well at ${width}` }).toBe(expected);
      await expect.poll(() => navbarPadding(page), { message: `navbar at ${width}` }).toBe(expected);
    };

    for (const width of [360, 576, 767]) await settles(width, '16px');
    for (const width of [768, 992, 1440]) await settles(width, '25px');
  });
});

test.describe('the stamp', () => {
  test('TC-DS01-E2E-03: three attributes on <html>, before hydration', async ({ page, request, browser }) => {
    // 2 — the writer is an inline script, and the server does not guess the rung.
    const html = await (await request.get('/login')).text();
    expect(html).toContain('viewport-stamp');
    expect(/<html[^>]*data-bp/.test(html)).toBe(false);

    // 3 — the attribute is already set at `interactive`, before React hydrates.
    await page.addInitScript(() => {
      (window as unknown as { __early?: string | null }).__early = null;
      document.addEventListener('readystatechange', () => {
        const w = window as unknown as { __early?: string | null };
        if (document.readyState === 'interactive' && w.__early == null) {
          w.__early = document.documentElement.getAttribute('data-bp');
        }
      });
    });

    // 1 — a rung per width.
    const rungs: [number, string][] = [
      [360, 'xs'], [576, 'sm'], [768, 'md'], [992, 'lg'], [1200, 'xl'], [1440, 'xxl'],
    ];
    for (const [width, rung] of rungs) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/login');
      const read = await page.evaluate(() => [
        document.documentElement.getAttribute('data-bp'),
        document.documentElement.getAttribute('data-pointer'),
        document.documentElement.getAttribute('data-motion'),
      ]);
      expect(read, `at ${width}`).toEqual([rung, 'fine', 'full']);
    }
    expect(await page.evaluate(() => (window as unknown as { __early?: string }).__early)).toBe('xxl');

    // The rung follows a resize with no reload (§02.10).
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(150);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-bp'))).toBe('xs');

    // 4 — reduced motion is stamped from the query, not guessed.
    const reduced = await browser.newContext({ reducedMotion: 'reduce' });
    const other = await reduced.newPage();
    await other.goto('/login');
    expect(await other.evaluate(() => document.documentElement.getAttribute('data-motion'))).toBe('reduced');
    await reduced.close();
  });
});

test.describe('the pointer', () => {
  test('TC-DS01-E2E-05: every target reaches 44 on a coarse pointer, and none moves on a fine one', async ({ browser, request }) => {
    const email = uniqueEmail('ds01-targets');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org);

    const measure = async (coarse: boolean, width: number) => {
      const context = await browser.newContext(
        coarse
          ? { hasTouch: true, isMobile: true, viewport: { width, height: 800 } }
          : { viewport: { width, height: 800 } },
      );
      const page = await context.newPage();
      await signIn(page, email);
      await page.goto(`/org/${org.orgId}/hiring/vacancies`);
      await expect(page.getByTestId(`vacancy-actions-menu-${vacancy.id}`)).toBeVisible();
      const kebab = await page.getByTestId(`vacancy-actions-menu-${vacancy.id}`).boundingBox();
      await page.getByTestId(`vacancy-actions-menu-${vacancy.id}`).click();
      await page.waitForTimeout(250);
      const item = await page.getByTestId(`vacancy-action-copy-link-${vacancy.id}`).boundingBox();
      const pointer = await page.evaluate(() => document.documentElement.getAttribute('data-pointer'));
      await context.close();
      return { kebab, item, pointer };
    };

    const coarse = await measure(true, 360);
    expect(coarse.pointer).toBe('coarse');
    expect(coarse.kebab!.width).toBeGreaterThanOrEqual(44);
    expect(coarse.kebab!.height).toBeGreaterThanOrEqual(44);
    expect(coarse.item!.height).toBeGreaterThanOrEqual(44);

    const fine = await measure(false, 1280);
    expect(fine.pointer).toBe('fine');
    expect(Math.round(fine.kebab!.width)).toBe(32);
    expect(Math.round(fine.kebab!.height)).toBe(32);
  });

  test('TC-DS01-E2E-06: board drag follows the pointer, not the width', async ({ browser, request }) => {
    const email = uniqueEmail('ds01-drag');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org);
    await bookInterview(request, vacancy.publicSlug, { email: uniqueEmail('ds01-cand') });

    const read = async (coarse: boolean) => {
      const context = await browser.newContext(
        coarse
          ? { hasTouch: true, isMobile: true, viewport: { width: 900, height: 800 } }
          : { viewport: { width: 900, height: 800 } },
      );
      const page = await context.newPage();
      await signIn(page, email);
      await page.goto(`/org/${org.orgId}/hiring/vacancies/${vacancy.id}`);
      const card = page.locator('[data-board-card]').first();
      await expect(card).toBeVisible();
      const out = {
        draggable: await card.getAttribute('draggable'),
        cursor: await card.evaluate((el) => getComputedStyle(el).cursor),
      };
      await context.close();
      return out;
    };

    /* The same width, twice. This is the pair the old width test got wrong in both directions. */
    expect(await read(false)).toEqual({ draggable: 'true', cursor: 'grab' });
    const coarse = await read(true);
    expect(coarse.draggable).toBe('false');
    expect(coarse.cursor).not.toBe('grab');
  });

  test('TC-DS01-E2E-04: a tap leaves no latched hover behind', async ({ browser, request }) => {
    const email = uniqueEmail('ds01-hover');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org);

    const context = await browser.newContext({
      hasTouch: true,
      isMobile: true,
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    await signIn(page, email);
    await page.goto(`/org/${org.orgId}/hiring/vacancies`);
    await expect(page.getByTestId(`vacancy-title-${vacancy.id}`)).toBeVisible();

    const row = page.locator(`[data-testid="vacancy-row-${vacancy.id}"]`).first();
    await row.dispatchEvent('mouseenter');
    await page.waitForTimeout(120);
    const tint = await row.evaluate((el) => getComputedStyle(el).backgroundColor);
    /* The row keeps the card surface: a coarse pointer sets no hover, so there is nothing to
       stay set after the finger leaves. */
    expect(tint).not.toBe('rgb(248, 250, 252)');
    await context.close();
  });
});

test.describe('a blocked reason on touch', () => {
  test('TC-DS01-E2E-07: the reason is visible text under a coarse pointer, and it wraps', async ({ browser, request }) => {
    const email = uniqueEmail('ds01-reason');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org, {
      title: 'A vacancy with a title long enough that the reason beneath it has to wrap onto a second line',
    });
    await bookInterview(request, vacancy.publicSlug, { email: uniqueEmail('ds01-reason-cand') });

    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 360, height: 800 } });
    const page = await context.newPage();
    await signIn(page, email);

    // 1-3 — the vacancy with applications cannot be deleted, and says so on the item itself.
    await page.goto(`/org/${org.orgId}/hiring/vacancies`);
    await page.getByTestId(`vacancy-actions-menu-${vacancy.id}`).click();
    const reason = page.getByTestId(`vacancy-delete-guard-message-${vacancy.id}`);
    await expect(reason).toBeVisible();
    const shape = await reason.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: Math.round(r.width), height: Math.round(r.height) };
    });
    /* Visible text with real size, not the 1px clipped box the hidden copy has above `sm`. */
    expect(shape.width).toBeGreaterThan(20);
    // 5 — edge case 12: it wraps rather than truncating.
    expect(shape.height).toBeGreaterThan(20);
    await page.keyboard.press('Escape');

    /* The fifth reason requirement 48 reaches — `Cannot remove the last admin` on the members
       list — has **no route through the UI**, and that is a fact about the product rather than
       about this case. `MembersTable.tsx:117` draws no row menu for the caller`s own row, and
       the last admin in a fresh organization *is* the caller. A second admin would make neither
       of them last. So the item exists and cannot be opened, and the relocation of its message
       is asserted at unit level instead, by TC-DS01-UNIT-07 in `packages/validation`. */
    await context.close();
  });
});

test.describe('the strip and the page', () => {
  test('TC-DS01-E2E-08: the board tab strip is one line and scrolls inside itself', async ({ page, request }) => {
    const email = uniqueEmail('ds01-tabs');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org);
    await bookInterview(request, vacancy.publicSlug, { email: uniqueEmail('ds01-tabs-cand') });

    await page.setViewportSize({ width: 360, height: 800 });
    await signIn(page, email);
    await page.goto(`/org/${org.orgId}/hiring/vacancies/${vacancy.id}`);
    await expect(page.getByTestId('board-tab-scheduled')).toBeVisible();

    const strip = page.locator('[role="tablist"]').first();
    const shape = await strip.evaluate((el) => ({
      height: el.clientHeight,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      wrap: getComputedStyle(el).flexWrap,
    }));
    // 1 — one row. Two would be about 80px; the strip's own row is well under 60.
    expect(shape.wrap).toBe('nowrap');
    expect(shape.height).toBeLessThan(60);
    expect(shape.scrollWidth).toBeGreaterThan(shape.clientWidth);

    // 2 — and the page body does not scroll with it.
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // 3-4 — the last tab is reachable and lands inside the strip's visible box.
    await strip.evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await page.getByTestId('board-tab-offer').click();
    await expect(page.getByTestId('board-column-offer')).toBeVisible();
    const inside = await page.getByTestId('board-tab-offer').evaluate((tab) => {
      const box = tab.getBoundingClientRect();
      const rail = (tab.closest('[role="tablist"]') as HTMLElement).getBoundingClientRect();
      return box.left >= rail.left - 1 && box.right <= rail.right + 1;
    });
    expect(inside).toBe(true);
  });

  test('TC-DS01-E2E-11: no page scrolls horizontally at 360', async ({ page, request }) => {
    const email = uniqueEmail('ds01-overflow');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org);
    await bookInterview(request, vacancy.publicSlug, { email: uniqueEmail('ds01-overflow-cand') });

    await page.setViewportSize({ width: 360, height: 800 });
    await signIn(page, email);

    const routes: [string, string][] = [
      [`/org/${org.orgId}/members`, 'page-title'],
      [`/org/${org.orgId}/hiring/vacancies`, 'page-title'],
      [`/org/${org.orgId}/hiring/vacancies/${vacancy.id}`, 'page-title'],
      [`/org/${org.orgId}/hiring/candidates`, 'page-title'],
      [`/org/${org.orgId}/hiring/settings`, 'page-title'],
    ];

    for (const [route, arrival] of routes) {
      await page.goto(route);
      await expect(page.getByTestId(arrival)).toBeVisible();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `horizontal overflow on ${route}`).toBeLessThanOrEqual(0);
    }

    // The public booking page renders outside AppShell and gets the same promise.
    await page.goto(`/book/${vacancy.publicSlug}`);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const publicOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(publicOverflow, 'horizontal overflow on the booking page').toBeLessThanOrEqual(0);
  });
});

test.describe('overlay panels below sm', () => {
  test('TC-DS01-E2E-09: a Modal and a ConfirmDialog are sheets below 576 and dialogs above it', async ({ page, request }) => {
    const email = uniqueEmail('ds01-sheet');
    const org = await registerOrganization(request, email);
    const vacancy = await createVacancy(request, org);
    await signIn(page, email);

    const box = async (testId: string) => {
      const el = page.getByTestId(testId);
      await expect(el).toBeVisible();
      return el.evaluate((node) => {
        const s = getComputedStyle(node);
        const r = node.getBoundingClientRect();
        return {
          left: Math.round(r.left),
          width: Math.round(r.width),
          bottom: Math.round(r.bottom),
          topRadius: s.borderTopLeftRadius,
          bottomRadius: s.borderBottomLeftRadius,
          heightRatio: r.height / window.innerHeight,
        };
      });
    };

    // 1 — the Modal, as a sheet.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/org/${org.orgId}/hiring/vacancies`);
    await page.getByTestId('vacancy-new-button').click();
    const sheet = await box('vacancy-dialog');
    expect(sheet.left).toBe(0);
    expect(sheet.width).toBe(360);
    expect(sheet.bottom).toBe(800);
    expect(sheet.bottomRadius).toBe('0px');
    expect(sheet.topRadius).not.toBe('0px');
    expect(sheet.heightRatio).toBeLessThanOrEqual(0.92);
    await expect(page.getByTestId('sheet-actions')).toBeVisible();

    // 2 — the same dialog, centred, above sm.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(200);
    const modal = await box('vacancy-dialog');
    expect(modal.width).toBeLessThanOrEqual(Math.round(900 * 0.7) + 1);
    expect(modal.left).toBeGreaterThan(0);
    await page.keyboard.press('Escape');

    // 3 — the ConfirmDialog is the second implementation of the same form, so it is asserted.
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(200);
    await page.getByTestId(`vacancy-actions-menu-${vacancy.id}`).click();
    await page.getByTestId(`vacancy-action-close-${vacancy.id}`).click();
    const confirm = await box('vacancy-close-confirm');
    expect(confirm.left).toBe(0);
    expect(confirm.width).toBe(360);
    expect(confirm.bottom).toBe(800);
    expect(confirm.bottomRadius).toBe('0px');
    expect(confirm.topRadius).not.toBe('0px');

    // 4 — and it is a centred box again above sm.
    await page.setViewportSize({ width: 900, height: 800 });
    await page.waitForTimeout(200);
    const confirmWide = await box('vacancy-close-confirm');
    expect(confirmWide.width).toBeLessThanOrEqual(600);
    expect(confirmWide.bottom).toBeLessThan(800);
  });

  test('TC-DS01-E2E-10: the filters panel is a trapped sheet below 576 and an untrapped drawer above it', async ({ page, request }) => {
    const email = uniqueEmail('ds01-drawer');
    const org = await registerOrganization(request, email);
    await signIn(page, email);

    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`/org/${org.orgId}/hiring/candidates`);
    await page.getByTestId('candidates-filters-open').click();
    const panel = page.getByTestId('candidates-filters');
    await expect(panel).toBeVisible();
    /* The panel slides for 0.3s and is never unmounted, so `toBeVisible` resolves while it is
       still on its way in. Measuring then reads a box mid-transition. */
    await page.waitForTimeout(500);

    // 1 — a full-width sheet that says it is modal.
    const shape = await panel.evaluate((node) => {
      const r = node.getBoundingClientRect();
      return { left: Math.round(r.left), width: Math.round(r.width), bottom: Math.round(r.bottom) };
    });
    expect(shape.left).toBe(0);
    expect(shape.width).toBe(360);
    expect(shape.bottom).toBe(800);
    await expect(panel).toHaveAttribute('aria-modal', 'true');
    await expect(page.getByTestId('sheet-actions')).toBeVisible();

    // 2 — focus is trapped: tabbing past the last control comes back inside.
    for (let i = 0; i < 25; i += 1) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.querySelector('[data-testid="candidates-filters"]')!.contains(document.activeElement))).toBe(true);

    // 3 — Escape closes it and focus returns to the button that opened it.
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))).toBe('candidates-filters-open');

    // 4 — above sm it is the right-edge drawer again, and it does not trap.
    await page.setViewportSize({ width: 992, height: 800 });
    await page.waitForTimeout(200);
    await page.getByTestId('candidates-filters-open').click();
    await expect(panel).toBeVisible();
    await page.waitForTimeout(500);
    await expect(panel).not.toHaveAttribute('aria-modal', 'true');
    const drawer = await panel.evaluate((node) => Math.round(node.getBoundingClientRect().width));
    expect(drawer).toBe(340);
  });
});

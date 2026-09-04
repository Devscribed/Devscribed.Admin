import { expect, test } from './fixtures';
import { registerAccount, uniqueEmail } from './helpers';

/**
 * `InfoBanner` paints each tone from tokens rather than from literals, and the whole point of
 * that is that **nothing renders differently** from one route to the next.
 *
 * A text diff cannot show that. The failure it misses is a token that resolves to nothing on a
 * route whose stylesheet never loaded it — the banner then paints transparent-on-transparent
 * and the page still "works". `@devscribed/ds/styles.css` is imported exactly once, in the root
 * layout, so every route in the product depends on that one import being reached; a banner is
 * the cheapest place to catch it having not been.
 *
 * So the assertions run in a real browser and compare colours the browser resolved, never a
 * hand-typed `rgb()` string: an `rgb()` constant would fail on a serialisation change in
 * Chromium and pass on a genuine regression measured in a couple of units.
 *
 * **What this case used to assert, and no longer can.** It was written against
 * `1_DS for dev/components/feedback/InfoBanner.jsx` and pinned twelve `--banner-{tone}-{slot}`
 * tokens to the eight `oklch(...)` literals a refactor had just promoted them out of — the
 * claim being that the promotion changed no value. That component, those twelve tokens and the
 * `--accent` / `--amber-800` / `--error-500` / `--success-700` the comparison read are all
 * deleted; the refactor they guarded has no subject left to regress. That half is
 * **retired**, and what replaces it is `ds:check`, which fails on any value in `packages/ds`
 * outside the token vocabulary unless it carries a stated `@literal` reason — a static gate
 * over every component rather than an eight-second browser check over one.
 *
 * The half that survives the repaint is the one above, because it is a claim about *the
 * stylesheet reaching the route*, which no design system makes untrue.
 */

/** tone → the two tokens the banner paints from. §7 — `warning` and `error` are one
 *  treatment under two names, which is why they name the same pair. */
const TONES: Record<string, { fill: string; line: string }> = {
  info: { fill: 'var(--color-info-tint)', line: 'var(--status-info)' },
  warning: { fill: 'var(--color-error-tint)', line: 'var(--status-error)' },
  error: { fill: 'var(--color-error-tint)', line: 'var(--status-error)' },
  success: { fill: 'rgba(39, 199, 154, 0.1)', line: 'var(--status-success)' },
};

/**
 * Paints a colour on a throwaway element and hands back what the browser computed.
 *
 * Both sides of every comparison below go through here, so the assertion is about the colour
 * and not about how this Chromium happens to serialise one. `transparent` comes back for a
 * value the browser could not resolve — an undefined custom property, most of all — which is
 * exactly the failure mode this test exists to catch.
 */
const paint = (page: import('@playwright/test').Page, values: string[]) =>
  page.evaluate((list) => {
    const probe = document.createElement('div');
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    document.body.appendChild(probe);
    try {
      return list.map((value) => {
        probe.style.removeProperty('background-color');
        probe.style.setProperty('background-color', value);
        return getComputedStyle(probe).backgroundColor;
      });
    } finally {
      probe.remove();
    }
  }, values);

test.describe('DS — InfoBanner tone tokens', () => {
  // TC-DS-BANNER-E2E-01
  test('every tone token resolves on a real route, and is what the banner paints', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('banner');
    await registerAccount(request, email);

    await page.goto('/login');

    // (a) Every token each tone paints from resolves to a real colour on this route.
    const values = Object.values(TONES).flatMap((tone) => [tone.fill, tone.line]);
    const names = Object.entries(TONES).flatMap(([tone]) => [`${tone}.fill`, `${tone}.line`]);
    const resolved = await paint(page, values);

    for (const [index, name] of names.entries()) {
      expect(resolved[index], `${name} (${values[index]}) must resolve to a colour`).not.toBe(
        'rgba(0, 0, 0, 0)',
      );
    }

    // …and §7's claim holds in the browser rather than only in the source: `warning` and
    // `error` are one treatment under two names, so they resolve to the same two colours.
    const [warningFill, warningLine, errorFill, errorLine] = await paint(page, [
      TONES.warning.fill,
      TONES.warning.line,
      TONES.error.fill,
      TONES.error.line,
    ]);
    expect(warningFill).toBe(errorFill);
    expect(warningLine).toBe(errorLine);

    // (b) The rendered banner paints from those tokens and nothing else.
    await page.getByTestId('login-email-input').fill(email);
    await page.getByTestId('login-password-input').fill('wrongpass1');
    await page.getByTestId('login-submit-button').click();

    const banner = page.getByTestId('login-error-message');
    await expect(banner).toBeVisible();

    const painted = await banner.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, border: style.borderTopColor };
    });
    const [tokenBackground, tokenBorder] = await paint(page, [
      TONES.error.fill,
      TONES.error.line,
    ]);

    expect(painted.background).toBe(tokenBackground);
    expect(painted.border).toBe(tokenBorder);
  });
});

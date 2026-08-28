import { expect, test } from '@playwright/test';
import { registerAccount, uniqueEmail } from './helpers';

/**
 * InfoBanner's four tone triplets used to be twelve inline values inside the component —
 * eight of them raw `oklch(...)` literals. They are tokens now
 * (`--banner-{tone}-{bg,border,ink}`), and the whole point of that move is that **nothing
 * renders differently**.
 *
 * A text diff cannot show that. Two failures survive one:
 *
 *  1. a token that resolves to nothing on a route whose CSS never loaded it — the banner
 *     then paints transparent-on-transparent and the page still "works";
 *  2. a background quietly snapped to the nearest existing scale step (`--error-100`
 *     instead of a new `--error-50`), which is six sRGB units and looks like tidying.
 *
 * So the assertions run in a real browser and compare colours the browser resolved, never
 * a hand-typed `rgb()` string: an `rgb()` constant would fail on a serialisation change in
 * Chromium and pass on a genuine regression measured in a couple of units.
 *
 * `EXPECTED` is the pre-refactor source of `1_DS for dev/components/feedback/InfoBanner.jsx`,
 * copied character for character. Comparing each token against it *through the browser's own
 * colour pipeline* is what pins requirement 2 — the promotion changed no value.
 */

/** tone → slot → the value the component applied before the tokens existed. */
const EXPECTED: Record<string, Record<string, string>> = {
  info: {
    border: 'oklch(0.85 0.06 292)',
    bg: 'oklch(0.97 0.02 292)',
    ink: 'var(--accent)',
  },
  warning: {
    border: 'oklch(0.82 0.09 74)',
    bg: 'oklch(0.96 0.04 74)',
    ink: 'var(--amber-800)',
  },
  error: {
    border: 'oklch(0.8 0.1 25)',
    bg: 'oklch(0.96 0.03 25)',
    ink: 'var(--error-500)',
  },
  success: {
    border: 'oklch(0.8 0.08 160)',
    bg: 'oklch(0.96 0.03 160)',
    ink: 'var(--success-700)',
  },
};

const TONES = Object.keys(EXPECTED);
const SLOTS = ['bg', 'border', 'ink'];

/**
 * Paints a colour on a throwaway element and hands back what the browser computed.
 *
 * Both sides of every comparison below go through here, so the assertion is about the
 * colour and not about how this Chromium happens to serialise one. `transparent` comes
 * back for a value the browser could not resolve — an undefined custom property, most of
 * all — which is exactly the first failure mode this test exists to catch.
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
  test('the twelve --banner-* tokens resolve, hold their original values, and are what the banner paints', async ({
    page,
    request,
  }) => {
    const email = uniqueEmail('banner');
    await registerAccount(request, email);

    await page.goto('/login');

    // (a) Every token is defined on this route and resolves to a real colour.
    const declared = await page.evaluate((names) => {
      const root = getComputedStyle(document.documentElement);
      return names.map((name) => root.getPropertyValue(name).trim());
    }, TONES.flatMap((tone) => SLOTS.map((slot) => `--banner-${tone}-${slot}`)));
    expect(declared).not.toContain('');

    // …and each resolves to the same colour the component applied before the promotion.
    const names = TONES.flatMap((tone) => SLOTS.map((slot) => `--banner-${tone}-${slot}`));
    const originals = TONES.flatMap((tone) => SLOTS.map((slot) => EXPECTED[tone][slot]));
    const resolved = await paint(
      page,
      names.map((name) => `var(${name})`).concat(originals),
    );
    const actual = resolved.slice(0, names.length);
    const expected = resolved.slice(names.length);

    expect(actual).not.toContain('rgba(0, 0, 0, 0)'); // an undefined token paints transparent
    for (const [index, name] of names.entries()) {
      expect(actual[index], `${name} must still be ${originals[index]}`).toBe(expected[index]);
    }

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
      'var(--banner-error-bg)',
      'var(--banner-error-border)',
    ]);

    expect(painted.background).toBe(tokenBackground);
    expect(painted.border).toBe(tokenBorder);
  });
});

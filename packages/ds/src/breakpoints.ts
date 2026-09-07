/**
 * The responsive ladder — spec `design-system/01-responsive` §01.
 *
 * Six named widths, and the only width names `packages/ds` and any document revised on or after
 * that spec may use. The numbers live here **and** in `base.css`, as media-query literals, and
 * in `tokens/spacing.css`, where `--layout-breakpoint-desktop` already names the `xl` rung.
 * CSS cannot read a JavaScript constant and a custom property cannot appear in a media query, so
 * the duplication is structural rather than careless; `npm run ds:check` fails when the three
 * disagree (§01.5), which is what makes it safe.
 */

export const RUNGS = ['xs', 'sm', 'md', 'lg', 'xl', 'xxl'] as const;

export type Rung = (typeof RUNGS)[number];

/**
 * The width each rung *starts* at. A rung applies from its own number up to the next one minus
 * one, which is why `base.css` spells the upper bounds 575 / 767 / 991 / 1199 / 1439.
 */
export const BREAKPOINTS: Record<Rung, number> = {
  xs: 0,
  sm: 576,
  md: 768,
  lg: 992,
  xl: 1200,
  xxl: 1440,
};

/** §01.2 — below this nothing is verified and no rule is promised. */
export const MIN_SUPPORTED_WIDTH = 360;

/** The rung a viewport width falls in. The lower bound is inclusive: 576 is `sm`, 575 is `xs`. */
export function rungFor(width: number): Rung {
  let found: Rung = 'xs';
  for (const rung of RUNGS) {
    if (width >= BREAKPOINTS[rung]) found = rung;
  }
  return found;
}

export type Pointer = 'fine' | 'coarse';

/**
 * §02.9 — one axis, not two. `fine` only when the pointer can hover *and* is precise; everything
 * else is `coarse`.
 *
 * CSS spells the coarse branch `@media (hover: none), (pointer: coarse)`. That is the same
 * predicate by De Morgan's law — `NOT (hover AND fine)` is `(NOT hover) OR (NOT fine)` — rather
 * than a second rule that happens to agree, and `breakpoints.test.ts` holds the two together.
 *
 * A stylus reports `fine` with no hover and therefore lands in `coarse`: it gets the larger
 * targets, which is right, and loses board drag, which is the cost recorded in Known Gaps.
 */
export function pointerFrom(canHover: boolean, isFine: boolean): Pointer {
  return canHover && isFine ? 'fine' : 'coarse';
}

export type Motion = 'full' | 'reduced';

/** The three media queries the stamp evaluates, named so the script and the hooks cannot drift. */
export const QUERIES = {
  hover: '(hover: hover)',
  fine: '(pointer: fine)',
  reducedMotion: '(prefers-reduced-motion: reduce)',
} as const;

/** The attributes the stamp writes on `<html>`, and the hooks read back. */
export const STAMP = {
  breakpoint: 'data-bp',
  pointer: 'data-pointer',
  motion: 'data-motion',
} as const;

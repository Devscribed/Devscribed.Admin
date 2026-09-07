'use client';

import React from 'react';
import {
  BREAKPOINTS,
  QUERIES,
  STAMP,
  pointerFrom,
  rungFor,
  type Motion,
  type Pointer,
  type Rung,
} from './breakpoints';

/**
 * The five hooks that read the viewport — spec `design-system/01-responsive` §02.
 *
 * Each **seeds itself from the stamp** the root layout writes on `<html>` before first paint, so
 * the first client render is already right. The hook these replace started `false` and settled
 * after mount, which is why a phone's first frame drew every board card draggable.
 *
 * **A component may not call `matchMedia` directly** (§02.12). The fallback below is the one
 * exception and it is inside the hook, where there is a single implementation of it: a hook that
 * finds no stamped attribute reads the query itself on mount, which is exactly today's behaviour,
 * so a stripped or blocked stamp degrades to what already ships rather than to nothing.
 */

const isBrowser = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function';

function readStamp(attribute: string): string | null {
  if (typeof document === 'undefined') return null;
  return document.documentElement.getAttribute(attribute);
}

/**
 * Subscribes to one media query and returns whether it matches.
 *
 * `initial` is what the first render uses — the stamped answer where there is one. On the server
 * and before the stamp exists it is the wide, fine, full-motion default the app has always
 * assumed, which is safe because every screen that switches structure renders a loader until a
 * client fetch resolves (§Edge cases 8 and 9), so nothing structural reaches the server's markup.
 */
function useQuery(query: string, initial: boolean): boolean {
  const [matches, setMatches] = React.useState(initial);

  React.useEffect(() => {
    if (!isBrowser()) return undefined;
    const list = window.matchMedia(query);
    setMatches(list.matches);
    const onChange = (event: MediaQueryListEvent) => setMatches(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, [query]);

  return matches;
}

/**
 * Any media query, for the two screens that switch **structure** rather than styling — the board's
 * five columns becoming a tab strip, a row's buttons becoming a menu. A media query cannot express
 * either.
 *
 * Moved here from `apps/web/src/hiring/useMediaQuery.ts` (§02.11). Unlike that one it starts from
 * the stamp where the query is one the stamp answers, so a caller no longer has to treat the wide
 * layout as something that arrives.
 */
export function useMediaQuery(query: string): boolean {
  const seed = React.useMemo(() => {
    if (!isBrowser()) return false;
    return window.matchMedia(query).matches;
  }, [query]);
  return useQuery(query, seed);
}

/** Which of the six rungs the viewport is in. */
export function useBreakpoint(): Rung {
  const stamped = readStamp(STAMP.breakpoint) as Rung | null;
  const [rung, setRung] = React.useState<Rung>(
    stamped ?? (isBrowser() ? rungFor(window.innerWidth) : 'xl'),
  );

  React.useEffect(() => {
    if (!isBrowser()) return undefined;
    const read = () => setRung(rungFor(window.innerWidth));
    read();
    /* One listener per rung boundary rather than a resize handler: a media query fires only when
       the answer changes, where `resize` fires on every pixel and re-renders every consumer. */
    const lists = (Object.keys(BREAKPOINTS) as Rung[])
      .filter((name) => BREAKPOINTS[name] > 0)
      .map((name) => window.matchMedia(`(min-width: ${BREAKPOINTS[name]}px)`));
    lists.forEach((list) => list.addEventListener('change', read));
    return () => lists.forEach((list) => list.removeEventListener('change', read));
  }, []);

  return rung;
}

/**
 * `fine` or `coarse` — the axis all three pointer rules share: hover is for a pointer that can
 * hover, a 44px target is for one that cannot, and drag is for one that is precise.
 */
export function usePointer(): Pointer {
  const stamped = readStamp(STAMP.pointer) as Pointer | null;
  const canHover = useQuery(QUERIES.hover, stamped ? stamped === 'fine' : true);
  const isFine = useQuery(QUERIES.fine, stamped ? stamped === 'fine' : true);
  return pointerFrom(canHover, isFine);
}

/**
 * Whether a control may report hover at all (§06.30). Every hover state in this system is React
 * state driven by `onMouseEnter`, so on a touch device a tap sets it and nothing clears it until
 * something else is tapped.
 */
export function useHoverable(): boolean {
  return usePointer() === 'fine';
}

/**
 * A hover state that only a fine pointer can set — §06.30, applied.
 *
 * It is a drop-in for `React.useState(false)`, which is deliberate: twenty-one components hold a
 * hover state and every one of them sets it from `onMouseEnter` and clears it from
 * `onMouseLeave`. Gating the **setter** rather than each handler means one line changes per
 * component and no handler composition is disturbed — a caller's own `onMouseEnter` still runs,
 * it just no longer paints a hover the reader cannot un-hover.
 *
 * On a coarse pointer the value is pinned to `false`, so a state set while a mouse was attached
 * is released the moment it is not.
 */
export function useHoverState(): [boolean, (next: boolean) => void] {
  const hoverable = useHoverable();
  const [hovered, setHovered] = React.useState(false);
  const set = React.useCallback(
    (next: boolean) => setHovered(hoverable ? next : false),
    [hoverable],
  );
  React.useEffect(() => {
    if (!hoverable) setHovered(false);
  }, [hoverable]);
  return [hovered, set];
}

/**
 * The same rule for a hovered **row index** rather than a boolean — `Select`'s option list and
 * `ReportGroupBody`'s rows both track which row the pointer is over, as `-1` for none.
 */
export function useHoverIndex(): [number, (next: number) => void] {
  const hoverable = useHoverable();
  const [index, setIndex] = React.useState(-1);
  const set = React.useCallback(
    (next: number) => setIndex(hoverable ? next : -1),
    [hoverable],
  );
  React.useEffect(() => {
    if (!hoverable) setIndex(-1);
  }, [hoverable]);
  return [index, set];
}

/** `full` or `reduced`. The only reader of `prefers-reduced-motion` in the product. */
export function useMotion(): Motion {
  const stamped = readStamp(STAMP.motion) as Motion | null;
  const reduced = useQuery(QUERIES.reducedMotion, stamped === 'reduced');
  return reduced ? 'reduced' : 'full';
}

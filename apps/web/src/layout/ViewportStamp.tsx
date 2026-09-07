/**
 * From `@devscribed/ds/breakpoints`, the package's third published entry point, **not** from its
 * root. The root carries `'use client'`, so a server component importing through it receives a
 * client-reference stub rather than the values — measured: the layout threw
 * `RUNGS is not iterable` and every page 500'd. The ladder is data, not a component, and the
 * stamp is the one consumer that must read it on the server, so it gets an entry point of its own
 * rather than a deep import.
 */
import { BREAKPOINTS, QUERIES, RUNGS, STAMP } from '@devscribed/ds/breakpoints';

/**
 * The pre-paint stamp — spec `design-system/01-responsive` §02.
 *
 * Writes `data-bp`, `data-pointer` and `data-motion` on `<html>` **before first paint**, so the
 * first client render is already right. It has to be a synchronous inline script: a React effect
 * runs after paint, which is the wrong first frame this exists to remove.
 *
 * The application's CSP permits it — `script-src` carries `'unsafe-inline'` with no nonce and no
 * `strict-dynamic` (`apps/web/next.config.mjs:121-129`) — and that policy applies only to
 * `/sign/:path*`, where the stamp is equally welcome.
 *
 * **The ladder's numbers are interpolated from `BREAKPOINTS`**, not retyped, so this file cannot
 * drift from `packages/ds/src/breakpoints.ts`. `base.css` is the one copy that must be checked
 * rather than shared, because CSS cannot read a JavaScript constant; `npm run ds:check` does that
 * check (§01.5).
 */

/* The rungs, largest first, so the script can return on the first match. */
const ladder = [...RUNGS]
  .filter((rung) => BREAKPOINTS[rung] > 0)
  .sort((a, b) => BREAKPOINTS[b] - BREAKPOINTS[a])
  .map((rung) => [BREAKPOINTS[rung], rung] as const);

const script = `(function(){
  var d=document.documentElement;
  var L=${JSON.stringify(ladder)};
  var hover=window.matchMedia(${JSON.stringify(QUERIES.hover)});
  var fine=window.matchMedia(${JSON.stringify(QUERIES.fine)});
  var motion=window.matchMedia(${JSON.stringify(QUERIES.reducedMotion)});
  function rung(){
    var w=window.innerWidth;
    for(var i=0;i<L.length;i++){ if(w>=L[i][0]) return L[i][1]; }
    return ${JSON.stringify(RUNGS[0])};
  }
  function write(){
    d.setAttribute(${JSON.stringify(STAMP.breakpoint)},rung());
    d.setAttribute(${JSON.stringify(STAMP.pointer)},hover.matches&&fine.matches?'fine':'coarse');
    d.setAttribute(${JSON.stringify(STAMP.motion)},motion.matches?'reduced':'full');
  }
  write();
  /* §02.10 — all three follow their query. A media query fires only when the answer changes,
     where a resize handler fires on every pixel. */
  for(var i=0;i<L.length;i++){ window.matchMedia('(min-width:'+L[i][0]+'px)').addEventListener('change',write); }
  hover.addEventListener('change',write);
  fine.addEventListener('change',write);
  motion.addEventListener('change',write);
})();`;

export function ViewportStamp() {
  return <script data-testid="viewport-stamp" dangerouslySetInnerHTML={{ __html: script }} />;
}

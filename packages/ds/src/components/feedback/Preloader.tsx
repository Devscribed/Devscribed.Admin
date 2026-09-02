import React from 'react';

export interface PreloaderProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Dot diameter: 12 for the page/overlay loader, 8 for the in-table load-more row. */
  size?: number;
  /** Margin around each dot: 7 for the overlay, 5 in tables. */
  margin?: number;
  /** Centres the loader absolutely with `z-index: 1002`, as Preloader's own `.overlay` does. */
  overlay?: boolean;
  /** Divides the 0.75s duration and the 0.12s-per-dot stagger together. */
  speedMultiplier?: number;
  /** §23 — every other attribute reaches the wrapper; `style` merges over the painted one. */
}

/* The loader is a **pulse, not a spin**: three dots at `--color-blue`, each pulsing on a
   0.75s cycle staggered by 0.12s, so they read as one object breathing rather than three
   things moving. `speedMultiplier` divides both numbers together, which is what keeps the
   stagger proportional at any speed.

   Two sizes, and only two: 12/7 stands in for a screen, 8/5 sits in a table row waiting for
   the next page. A third would be a loader nobody could place.

   §69 — the keyframes live in `base.css`, not in a module-scope `document.head.appendChild`
   here. A side effect that runs once on whichever page first imports this component fails
   silently everywhere it does not run, and a loader whose dots do not move is
   indistinguishable from a screen that has stopped. */

export function Preloader({
  size = 12, margin = 7, overlay = false, speedMultiplier = 1,
  /* §23 — everything reaches the wrapper. A loader standing in for a screen's content has to
     be findable by a test and announceable as `role="status"`; one that is neither is a
     picture of waiting. */
  style, ...rest
}: PreloaderProps) {
  return (
    <span
      {...rest}
      style={{
        ...(overlay
          ? { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1002 }
          : { display: 'inherit' }),
        ...style,
      }}
    >
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          style={{
            /* @literal a second blue, one step off `--color-blue`. Reconciling the two is a
               visual decision, not a substitution. */
            display: 'inline-block', backgroundColor: '#0168fa', width: size, height: size,
            margin, borderRadius: '100%',
            animation: `ds-pulse-loader ${0.75 / speedMultiplier}s ${(i * 0.12) / speedMultiplier}s infinite cubic-bezier(0.2, 0.68, 0.18, 1.08)`,
            animationFillMode: 'both',
          }}
        />
      ))}
    </span>
  );
}

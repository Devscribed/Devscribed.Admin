'use client';

import type { ReactNode } from 'react';

/**
 * A caption inside an application panel — `Candidate's note`, `Criteria`.
 *
 * These were `SectionLabel`, and `SectionLabel` is gone (D4). Phase 3 settled the replacement
 * for a caption over a whole surface — it becomes that surface's `Card` title at `<h2>`
 * (reversal 5, [ledger §27]) — but these two sit *inside* a panel that already has a heading,
 * so they are the level below it rather than a second one at the same level. The outline the
 * card ends up with is `PageTitle`'s `<h1>` → the application's `<h2>` → these.
 *
 * Blue's headline scale bottoms out at headline-6, which the application heading takes. Below
 * it, blue's own way of marking something small as emphatic is body-s at medium weight — nav
 * links, `Badge`, `Table`'s header. That is what this is, in `--text-primary` so it reads as a
 * heading rather than as the secondary ink a `FieldLabel` uses.
 *
 * Sentence case, not the uppercase Meridian drew: blue's only uppercase treatment anywhere is
 * `PageTabs` (the call Phase 4 made for spec 03's column headers and group labels).
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        margin: 0,
        fontSize: 'var(--font-size-s)',
        fontWeight: 'var(--font-weight-medium)',
        lineHeight: 'var(--line-height-base)',
        color: 'var(--text-primary)',
      }}
    >
      {children}
    </h3>
  );
}

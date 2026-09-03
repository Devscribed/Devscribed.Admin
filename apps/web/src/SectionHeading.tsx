'use client';

import type { ReactNode } from 'react';
import { fieldLabelStyle } from '@devscribed/ds';

/**
 * A caption inside a panel that already has a heading — `Criteria`, `From the candidate`,
 * `Candidate's note`, and a signer's position in an envelope's signing order.
 *
 * These were `SectionLabel`, and `SectionLabel` is gone (D4). Phase 3 settled the replacement
 * for a caption over a whole surface — it becomes that surface's `Card` title at `<h2>`
 * (reversal 5, [decisions §27]) — but these sit *inside* a panel that already has a heading, so
 * they are the level below it rather than a second one at the same level. The outline the card
 * ends up with is `PageTitle`'s `<h1>` → the application's `<h2>` → these.
 *
 * **The paint is `fieldLabelStyle` ([decisions §74])**, and that is the point of it. This card is
 * four captions in two columns, and two of them are not captions at all — `Interview notes` and
 * `Conclusion` are `TextArea`'s own labels, drawn by the design system. Painting the other two
 * as body-s medium in `--text-primary` set them a size up and a shade darker than the two
 * beside them, so a column of four labels read as two kinds of thing for no reason a member
 * could act on. They are one kind of thing: the name of the block under it.
 *
 * The element does not follow the paint. A `FieldLabel` is a `<label>` and belongs to a
 * control; `From the candidate` names a file row and `Candidate's note` names a paragraph, so
 * this stays a real `<h3>` and only borrows the geometry — which includes the 10px indent, the
 * deploy's own, so the caption starts where every field label on the screen starts.
 */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3
      style={{
        ...fieldLabelStyle,
        display: 'block',
        // Longhands, never the `margin` shorthand: `fieldLabelStyle` already carries a
        // `marginBottom`, and a key that exists in a spread keeps its position when it is
        // overwritten — so a later `margin: 0` would be emitted *after* it and win.
        marginTop: 0,
        marginBottom: 4,
        // The label's own `nowrap` protects a form row from a two-line label. A caption
        // over a 240px column has nothing to protect and everything to lose by it.
        whiteSpace: 'normal',
      }}
    >
      {children}
    </h3>
  );
}

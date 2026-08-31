import React from 'react';

/**
 * Card — §12. Blue never promoted a general content surface, but it specifies the treatment
 * exactly: a white `--surface-card` box, a 1px `--border-default` hairline, the 8px workhorse
 * radius, and no shadow — "static cards use a border, not a shadow, until hovered"
 * (readme → Visual foundations → Borders & shadows). `NavigationCard` is that same treatment
 * wearing a fixed 250px width, a click handler and a title/description pair instead of
 * `children`: a dashboard tile, not a substitute for this.
 *
 * Nothing here hovers. Blue's `--shadow-card-hover` and its `scale(1.01)` belong to
 * `NavigationCard`, which is a control; painting them on a static container would promise a
 * click that is not there.
 */
export function Card({
  title, action, padded = true, clip = true, style, children,
  /* §27 — prod's card headings are `<div>`s, because prod's card headings are `<div>`s. A
     screen that replaced its captions with card titles is relying on them to *be* the outline
     under `PageTitle`'s `<h1>`, and blue already renders that one as a real heading. Every
     value below is unchanged; only the element is. */
  titleAs: TitleTag = 'h2',
  ...rest
}) {
  return (
    <div
      {...rest}
      style={{
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-l)',
        fontFamily: 'var(--font-family-base)',
        /* Clipping is what rounds an edge-to-edge `Table`'s square corners to the card's own
           radius — and it is also what cuts off any popover opened inside the card, since a
           `Select` drops its list into the card's box. A card that hosts one turns it off. */
        overflow: clip ? 'hidden' : 'visible',
        ...style,
      }}
    >
      {(title || action) && (
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 'var(--space-5)', padding: 'var(--space-6) var(--space-6) 0',
          }}
        >
          <TitleTag
            style={{
              fontWeight: 'var(--headline-6-weight)', fontSize: 'var(--headline-6-size)',
              lineHeight: 'var(--headline-6-line)', letterSpacing: 'var(--headline-6-tracking)',
              color: 'var(--text-primary)',
            }}
          >
            {title}
          </TitleTag>
          {action}
        </div>
      )}
      <div style={{ padding: padded ? 'var(--space-6)' : 0 }}>{children}</div>
    </div>
  );
}

import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * Header line. Drawn only when `title` or `action` is given — at the headline-6 step on a
   * `default` card, and as the small-caps micro label on a `panel`.
   */
  title?: React.ReactNode;
  /**
   * §66 — `default` is blue's 8px hairline card, for a box among boxes. `panel` is the
   * treatment its *large* white sections take (the Timesheets calendar card, the report
   * tables): `--radius-xl` over `--shadow-card-soft`, no border, and a small-caps title.
   */
  variant?: 'default' | 'panel';
  /** §27 — element for that header line. A real heading by default, so a page whose captions
   *  are card titles has an outline under `PageTitle`'s `<h1>`. Paint is unaffected. */
  titleAs?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'div';
  /** Trailing element in the header row (an Edit link, a count, a button). */
  action?: React.ReactNode;
  /** 16px body padding. Set false for an edge-to-edge `Table`. Default true. */
  padded?: boolean;
  /**
   * Clips content to the card's radius. Default true, which is what rounds an edge-to-edge
   * `Table`'s corners — and what cuts off a `Select` popover opened inside the card. Set
   * `false` on any card that hosts one.
   */
  clip?: boolean;
  children?: React.ReactNode;
}

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
 *
 * §66 — `variant="panel"` is the app's *other* white surface, and it is as measured as this
 * one: the Timesheets calendar card and the report tables are not 8px-with-a-hairline, they
 * are a 20px radius over a 120px-blur 5% lift with no border at all. The two are a scale
 * decision, not a style one — a hairline is what separates a 300px box from the boxes beside
 * it, and a section as wide as the column it is in has nothing beside it to be separated
 * from, so the border becomes an outline drawn around the whole page. The public booking and
 * manage screens are made of these, which is why the variant exists rather than three
 * screens spelling the same three declarations.
 *
 * A panel's title is the small-caps micro label that leads a section in this app (the
 * Timesheets day header) rather than headline-6: at this size the heading is not competing
 * with the card next to it, it is competing with the page's own `<h1>` two rows up. It stays
 * a real `<h2>` — prod draws it as a `<span>`, and that is §27's argument, not a decision.
 */
export function Card({
  title, action, padded = true, clip = true, variant = 'default', style, children,
  /* §27 — prod's card headings are `<div>`s, because prod's card headings are `<div>`s. A
     screen that replaced its captions with card titles is relying on them to *be* the outline
     under `PageTitle`'s `<h1>`, and blue already renders that one as a real heading. Every
     value below is unchanged; only the element is. */
  titleAs: TitleTag = 'h2',
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      style={{
        backgroundColor: 'var(--surface-card)',
        ...(variant === 'panel'
          ? { borderRadius: 'var(--radius-xl)', boxShadow: 'var(--shadow-card-soft)' }
          : { border: '1px solid var(--border-default)', borderRadius: 'var(--radius-l)' }),
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
            style={variant === 'panel'
              ? {
                fontWeight: 'var(--font-weight-medium)', fontSize: 'var(--font-size-xs)',
                lineHeight: '18px', textTransform: 'uppercase', color: 'var(--text-secondary)',
              }
              : {
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

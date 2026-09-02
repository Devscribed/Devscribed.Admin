import React from 'react';

export interface CardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /**
   * Header line. Drawn only when `title` or `action` is given — at the headline-6 step on a
   * `default` card, and as the small-caps micro label on a `panel`.
   */
  title?: React.ReactNode;
  /**
   * §66 — `default` is the 8px hairline card, for a box among boxes. `panel` is the treatment
   * a *large* white section takes: `--radius-xl` over `--shadow-card-soft`, no border, and a
   * small-caps title.
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
 * Card — §12. The general content surface: a white `--surface-card` box, a 1px
 * `--border-default` hairline, the 8px workhorse radius, and no shadow. **A static card uses a
 * border, not a shadow, until hovered** — that is the system's rule for depth, and it is why
 * nothing here hovers: `--shadow-card-hover` and `scale(1.01)` belong to controls, and painting
 * them on a static container promises a click that is not there. `BoardCard` (§42) takes them
 * precisely because it *is* a control.
 *
 * §66 — `variant="panel"` is the *other* white surface: a 20px radius over a 120px-blur 5%
 * lift, with no border at all. The two are a scale decision, not a style one — a hairline is
 * what separates a 300px box from the boxes beside it, and a section as wide as the column it
 * is in has nothing beside it to be separated from, so the border becomes an outline drawn
 * around the whole page. The public booking and manage screens are made of these, which is why
 * the variant exists rather than three screens spelling the same three declarations.
 *
 * A panel's title is the small-caps micro label that leads a section rather than headline-6: at
 * this size the heading is not competing with the card next to it, it is competing with the
 * page's own `<h1>` two rows up. It is still a real `<h2>`, which is §27.
 */
export function Card({
  title, action, padded = true, clip = true, variant = 'default', style, children,
  /* §27 — a card heading is a real heading. A screen that replaced its captions with card
     titles is relying on them to *be* the outline under `PageTitle`'s `<h1>`, and a `<div>`
     is not in that outline. The paint does not depend on the element, so a caller who needs a
     different level changes only the level. */
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

import React from 'react';
import { isKeyboardFocus } from '../core/focus-visible';

export interface NavigationCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** A glyph. The card draws the tinted square around it; the caller supplies only the mark. */
  leading?: React.ReactNode;
  /** The quiet line at the foot of the card: who this is for, what it costs, when it ran. */
  caption?: React.ReactNode;
  /**
   * §84 — where it goes. With an `href` this is a real `<a>`; without one it is a `<button>`.
   * A `<div onClick>` was neither, which is why the restored version could not be tabbed to,
   * middle-clicked, or opened in a new tab — the same argument `Button` makes at §38 and
   * `Table` at §18.
   */
  href?: string;
  onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * NavigationCard — a card that is a link: a title, a sentence saying what is behind it, and an
 * optional glyph and footnote.
 *
 * §84 — **it is one control, and it is the element it behaves like.** A card whose whole face
 * is clickable is a link when it navigates and a button when it does not, and the tag decides
 * everything a hand-rolled `<div onClick>` has to reimplement badly: the tab stop, `Enter`, the
 * announced role, the browser's own open-in-new-tab and copy-address. So `href` picks the tag,
 * and the paint is identical either way.
 *
 * The card is a fixed 250px rather than a grid cell that stretches. A description of two or
 * three lines has a width at which it reads, and a row of these on a wide screen would
 * otherwise draw one-line cards a thousand pixels across. The caller lays them out in a
 * wrapping row; the card decides how wide a card is.
 *
 * Hover lifts it: the border goes transparent, the box scales 1%, and `--shadow-card-hover`
 * paints under it — the surface rises rather than changing colour, so nothing in the palette
 * has to mean "hovered".
 */
export function NavigationCard({
  title, description, leading, caption, href, onClick, style, ...rest
}: NavigationCardProps) {
  const [hover, setHover] = React.useState(false);
  const [focus, setFocus] = React.useState(false);
  const Tag = (href ? 'a' : 'button') as React.ElementType;

  return (
    <Tag
      {...rest}
      {...(href ? { href } : { type: 'button' })}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      /* §68 — a keyboard's ring, not a pointer's. */
      onFocus={(event: React.FocusEvent<HTMLElement>) => setFocus(isKeyboardFocus(event.currentTarget))}
      onBlur={() => setFocus(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
        gap: 'var(--space-4)',
        /* 250px is the card's own width — see above. */
        width: 250, boxSizing: 'border-box', textAlign: 'left',
        backgroundColor: 'var(--surface-card)',
        border: `var(--border-width-hairline) solid ${hover ? 'transparent' : 'var(--border-default)'}`,
        borderRadius: 'var(--radius-l)',
        padding: 'var(--space-6)',
        cursor: 'pointer', textDecoration: 'none',
        fontFamily: 'var(--font-family-base)',
        transition: 'var(--transition-card-hover)',
        transform: hover ? 'scale(1.01)' : 'none',
        boxShadow: focus
          ? 'var(--shadow-focus-input)'
          : hover ? 'var(--shadow-card-hover)' : 'none',
        ...style,
      }}
    >
      {leading && (
        <span
          aria-hidden
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 'var(--control-height)', height: 'var(--control-height)',
            borderRadius: 'var(--radius-l)',
            backgroundColor: 'var(--color-blue-light)', color: 'var(--color-blue)',
          }}
        >
          {leading}
        </span>
      )}
      <span
        style={{
          fontWeight: 'var(--headline-6-weight)', fontSize: 'var(--headline-6-size)',
          lineHeight: 'var(--headline-6-line)', letterSpacing: 'var(--headline-6-tracking)',
          color: 'var(--text-primary)',
        }}
      >
        {title}
      </span>
      {description != null && description !== '' && (
        <span style={{ fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-base)', color: 'var(--text-secondary)' }}>
          {description}
        </span>
      )}
      {caption != null && caption !== '' && (
        /* Pushed to the foot of the card, so a row of cards with descriptions of different
           lengths still lines its footnotes up. */
        <span
          style={{
            marginTop: 'auto', paddingTop: 'var(--space-4)',
            fontSize: 'var(--font-size-xs)', lineHeight: 'var(--line-height-xs)',
            color: 'var(--text-tertiary)',
          }}
        >
          {caption}
        </span>
      )}
    </Tag>
  );
}

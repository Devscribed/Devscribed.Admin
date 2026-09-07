import React from 'react';
import { useHoverable } from '../../useViewport';

export interface RecordFact {
  /** The column heading this value sat under. Becomes the fact's `<dt>`. */
  label: React.ReactNode;
  value: React.ReactNode;
}

export interface RecordCardProps extends Omit<React.HTMLAttributes<HTMLElement>, 'title'> {
  /** §97 — the service line's left half. A status pill, or nothing. */
  status?: React.ReactNode;
  /** §97 — the service line's right half. The row's kebab, or nothing. */
  actions?: React.ReactNode;
  /** §97 — 14/20, clamped to two lines. What the row *is*. */
  title?: React.ReactNode;
  /** §97 — 12/16 secondary, one line. */
  subtitle?: React.ReactNode;
  /** §97 — a chip strip on one line. Whoever fills it decides what fits; the card only holds it. */
  badges?: React.ReactNode;
  /** §97 — label/value pairs, drawn as a real `<dl>`. */
  facts?: RecordFact[];
  /** Turns the card into a real anchor, exactly as `rowHref` does to a row (§18). */
  href?: string;
  /** §34 — grayscale and unclickable: a removed member, an archived record. */
  disabled?: boolean;
  /** §34 — dimmed while a request is in flight over it. Still readable, still clickable. */
  busy?: boolean;
}

/**
 * RecordCard — §97. The anatomy of a list row when it is not a row.
 *
 * ```
 * ┌──────────────────────────────┐
 * │ ⟨Open⟩                    ⋮  │  service line
 * │ Senior React Engineer        │  title, two lines then an ellipsis
 * │ pat@example.com              │  subtitle
 * │ ⟨React⟩ ⟨Senior⟩ ⟨+2⟩        │  badges, one line
 * │ Interviewer      Pat Owner   │  facts
 * └──────────────────────────────┘
 * ```
 *
 * **It is its own component and not a branch inside `Table`**, so the anatomy can be drawn and
 * reviewed with no table around it. The arrow never reverses: `RecordList` (§98) imports both,
 * this file imports neither `Table` nor anything that knows a table exists.
 *
 * The facts are a real `<dl>`: a fact's label is *attached* to its value for a reader rather
 * than merely sitting to the left of it, which is the whole reason a card can carry values a
 * table put under a heading row.
 *
 * Geometry is in `base.css` rather than here — the two-line clamp and the coarse-pointer service
 * line are both media-query work, and splitting the card's numbers across a stylesheet and a
 * style object would be two places for them to drift.
 */
export function RecordCard({
  status, actions, title, subtitle, badges, facts = [],
  href, disabled, busy,
  className, style, onClick, children, ...rest
}: RecordCardProps) {
  /* §06.32 — the tint comes from the handler, so the guard sits at the top of it: on a touch
     screen a tint set by a tap is never released. The same rule `Table`'s row takes. */
  const hoverable = useHoverable();
  const Root: React.ElementType = href && !disabled ? 'a' : 'div';
  const clickable = !disabled && (href || onClick);
  return (
    <Root
      {...rest}
      href={href && !disabled ? href : undefined}
      onClick={disabled ? undefined : onClick}
      className={['ds-record-card', className].filter(Boolean).join(' ')}
      style={{
        backgroundColor: disabled ? 'var(--surface-disabled)' : 'var(--surface-card)',
        filter: disabled ? 'grayscale(1)' : 'none',
        /* §34 — a busy card is still a card: dimmed, still readable, still clickable. Only
           `disabled` takes the heavier grayscale, because that one is not coming back. */
        opacity: disabled ? 0.6 : busy ? 0.55 : 1,
        cursor: disabled ? 'default' : clickable ? 'pointer' : 'default',
        /* A disabled card is not hoverable either: the tint would promise a click. */
        pointerEvents: disabled ? 'none' : undefined,
        ...style,
      }}
      onMouseEnter={(e: React.MouseEvent<HTMLElement>) => { if (!disabled && hoverable && clickable) e.currentTarget.style.backgroundColor = 'var(--color-row-hover)'; }}
      onMouseLeave={(e: React.MouseEvent<HTMLElement>) => { if (!disabled) e.currentTarget.style.backgroundColor = 'var(--surface-card)'; }}
    >
      {/* Drawn for either half. A category has no status and the line exists for its menu
          alone, rather than being dropped and leaving the kebab to find its own corner. */}
      {(status || actions) && (
        <div className="ds-record-card-service">
          <span className="ds-record-card-status">{status}</span>
          {actions && <span className="ds-record-card-actions">{actions}</span>}
        </div>
      )}
      {title != null && <div className="ds-record-card-title">{title}</div>}
      {subtitle != null && <div className="ds-record-card-subtitle">{subtitle}</div>}
      {badges != null && <div className="ds-record-card-badges">{badges}</div>}
      {facts.length > 0 && (
        <dl className="ds-record-card-facts">
          {facts.map((fact, i) => (
            <React.Fragment key={i}>
              <dt className="ds-record-card-fact-label">{fact.label}</dt>
              <dd className="ds-record-card-fact-value">{fact.value}</dd>
            </React.Fragment>
          ))}
        </dl>
      )}
      {children}
    </Root>
  );
}

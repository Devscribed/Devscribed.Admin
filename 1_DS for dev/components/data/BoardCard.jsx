import React from 'react';
import { Badge } from '../feedback/Badge.jsx';
import { Tooltip } from '../feedback/Tooltip.jsx';

/**
 * Meridian's motion rule is fast and unstyled, and a lift is decoration: the travelling
 * placeholder is what carries the information, so a visitor who has asked for less
 * motion loses nothing by losing the transform.
 */
function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/**
 * One draggable card on a board: a name, when it is, and the two marks a column can put
 * on it.
 *
 * Presentational and drag-mechanical only. What the statuses are, which column a card
 * may move to, and what a drop writes are all the caller's.
 *
 * A card being dragged with a pointer is simply not rendered — its gap is the
 * `BoardColumn` placeholder, which travels to wherever the drop would land. A card held
 * by the *keyboard* stays rendered and travels with the target itself, so it keeps both
 * its focus and the reader's eye.
 *
 * **Space picks the card up rather than activating it**, which is the one place this
 * departs from a native button. Enter opens the card instead. A board whose cards
 * activated on Space could not be dragged with a keyboard at all, and the drag is the
 * screen's whole purpose; the hint that says so is rendered by the caller, once, rather
 * than repeated on every card.
 */
export function BoardCard({
  cardId,
  name,
  when,
  /** Renders the date faint. The card does not move and nothing else changes. */
  past = false,
  cancelled = false,
  cancelledLabel = 'Cancelled',
  /** The reason for the marker. Absent means no marker — the common case. */
  flag = null,
  hasCv = false,
  cvLabel = 'CV',
  /** Accessible name — "{name}, {column}, {date}". Built by the caller, which knows the column. */
  label,
  draggable = true,
  /** Held by the keyboard: the card travels with the target rather than leaving a gap. */
  lifted = false,
  onOpen,
  onDragStart,
  onDragEnd,
  onKeyDown,
  style,
  ...rest
}) {
  const reducedMotion = useReducedMotion();
  const flagId = flag ? `board-card-flag-${cardId}` : undefined;

  return (
    <div
      {...rest}
      data-board-card=""
      data-testid={`board-card-${cardId}`}
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-describedby={flagId}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={onKeyDown}
      onClick={onOpen}
      style={{
        display: 'grid',
        gap: 3,
        padding: '10px 12px',
        background: 'var(--bg-panel)',
        border: `1px solid ${lifted ? 'var(--accent-border)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-xl)',
        boxShadow: lifted ? 'var(--shadow-pop)' : 'var(--shadow-card)',
        transform: lifted && !reducedMotion ? 'translateY(-1px)' : undefined,
        transition: reducedMotion
          ? undefined
          : 'box-shadow var(--duration-base) var(--easing-standard), transform var(--duration-base) var(--easing-standard)',
        cursor: draggable ? 'grab' : 'pointer',
        opacity: cancelled ? 0.65 : 1,
        userSelect: 'none',
        ...style,
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.background = 'var(--hover-bg-tint)';
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'var(--bg-panel)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span
          data-testid={`board-card-name-${cardId}`}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontFamily: 'var(--font-display)',
            fontWeight: 500,
            fontSize: 'var(--fs-15)',
            color: 'var(--text)',
          }}
        >
          {name}
        </span>
        {flag && (
          <Tooltip
            content={flag}
            id={flagId}
            placement="left"
            testId={`board-card-no-conclusion-tooltip-${cardId}`}
            style={{ display: 'inline-block' }}
          >
            {/* Amber is Meridian's reserved warning hue, and a recorded outcome with no
                reason behind it is precisely a guarded state. The meaning lives in the
                tooltip the card points `aria-describedby` at, never in the colour. */}
            <span
              data-testid={`board-card-no-conclusion-${cardId}`}
              style={{ color: 'var(--tracker)', fontSize: 'var(--fs-13)', lineHeight: 1 }}
            >
              ⚑
            </span>
          </Tooltip>
        )}
      </div>

      <div
        data-testid={`board-card-when-${cardId}`}
        style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 400,
          fontSize: 'var(--fs-13)',
          fontVariantNumeric: 'tabular-nums',
          color: past ? 'var(--text-faint)' : 'var(--text-muted)',
        }}
      >
        {when}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {hasCv && (
          <span
            data-testid={`board-card-cv-${cardId}`}
            style={{ fontSize: 'var(--fs-12)', color: 'var(--text-sub)' }}
          >
            <span aria-hidden>📄 </span>
            {cvLabel}
          </span>
        )}
        {cancelled && (
          <Badge tone="inactive" data-testid={`board-card-cancelled-${cardId}`}>
            {cancelledLabel}
          </Badge>
        )}
      </div>
    </div>
  );
}

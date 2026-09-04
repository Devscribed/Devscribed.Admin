import React from 'react';
import { isKeyboardFocus } from '../core/focus-visible';
import { Badge } from '../core/Badge';
import { FlagIcon } from '../icons/Icon';

/**
 * §42 — the surface is `Card`'s treatment (§12) and the hover is the pair §12 declined,
 * precisely because a static container is not a control. This one is.
 */
export interface BoardCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onDragStart' | 'onDragEnd' | 'onKeyDown'> {
  /** The application id. Every `data-testid` on the card is suffixed with it. */
  cardId: string;
  name: React.ReactNode;
  /** The interview's date and time, already formatted in the viewer's zone. */
  when: React.ReactNode;
  /** Recedes the date by one level. The card does not move and nothing else changes. */
  past?: boolean;
  cancelled?: boolean;
  /** What the badge paints — a first name, because a board card is a glance. */
  cancelledLabel?: React.ReactNode;
  /**
   * The whole fact — who, when, why — which becomes the badge's accessible **name**. Not a
   * native `title`: on an element that already has text content `title` is a *description*,
   * and the text content still wins the name computation.
   */
  cancelledTooltip?: string | null;
  /**
   * The missing-conclusion marker's reason. Absent means no marker. It is drawn in
   * `--status-warning`, given to the pointer as the glyph's own `title`, and wired as the
   * card's `aria-describedby` — the colour is never the only signal.
   */
  flag?: string | null;
  /** Accessible name — "{name}, {column}, {date}". Built by the caller, which knows the column. */
  label?: string;
  draggable?: boolean;
  /** Held by the keyboard: the card is lifted rather than replaced by its gap. */
  lifted?: boolean;
  onOpen?: () => void;
  onDragStart?: (event: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd?: (event: React.DragEvent<HTMLDivElement>) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Motion in this system is minimal and utilitarian — 0.1–0.3s state changes and nothing else —
 * and everything this card animates is decoration: the travelling placeholder is what carries
 * the information, so a visitor who has asked for less motion loses nothing by losing the
 * transform.
 */
function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/* Present to a screen reader, absent to everything else. The marker's meaning has to be in
   the tree at all times so `aria-describedby` always resolves — which is the property the
   bubble it replaces was chosen for. */
const VISUALLY_HIDDEN: React.CSSProperties = {
  position: 'absolute',
  width: 1,
  height: 1,
  overflow: 'hidden',
  clip: 'rect(0 0 0 0)',
};

/**
 * BoardCard — §42. One draggable card on a board: a name, when it is, and the two marks a
 * column can put on it.
 *
 * Every value is the system's existing vocabulary rather than a new one. The surface is
 * `Card`'s (§12) — white, a 1px `--border-default` hairline, the 8px workhorse radius, no
 * shadow at rest — and the hover is the `--shadow-card-hover` + `scale(1.01)` pair §12
 * declined. That is not a contradiction, it is §12's own condition: those belong to a control,
 * and painting them on a static container promises a click that is not there. This card *is* a
 * control — it opens the candidate — so the promise is true and the treatment is right.
 *
 * Presentational and drag-mechanical only. What the statuses are, which column a card may
 * move to, and what a drop writes are all the caller's.
 *
 * A card being dragged with a pointer is simply not rendered — its gap is the `BoardColumn`
 * placeholder, which travels to wherever the drop would land. A card held by the *keyboard*
 * stays rendered and lifted, and only the target travels, so it keeps both its focus and the
 * reader's eye.
 *
 * **Space picks the card up rather than activating it**, which is the one place this departs
 * from a native button; `Enter` opens it instead. A board whose cards activated on Space
 * could not be dragged with a keyboard at all, and the drag is the screen's whole purpose.
 * The hint that says so is rendered by the caller, once, rather than repeated on every card.
 */
export function BoardCard({
  cardId,
  name,
  when,
  /** Recedes the date by one level. The card does not move and nothing else changes. */
  past = false,
  cancelled = false,
  cancelledLabel = 'Cancelled',
  /** The whole fact — who, when, why. Becomes the badge's accessible name. */
  cancelledTooltip = null,
  /** The reason for the marker. Absent means no marker — the common case. */
  flag = null,
  /** Accessible name — "{name}, {column}, {date}". Built by the caller, which knows the column. */
  label,
  draggable = true,
  /** Held by the keyboard: the card is lifted rather than replaced by its gap. */
  lifted = false,
  onOpen,
  onDragStart,
  onDragEnd,
  onKeyDown,
  style,
  ...rest
}: BoardCardProps) {
  const reducedMotion = useReducedMotion();
  const [hover, setHover] = React.useState(false);
  const [focused, setFocused] = React.useState(false);
  const flagId = flag ? `board-card-flag-${cardId}` : undefined;

  /* Three states over one surface, in the order they win. On hover the border goes transparent
     as the shadow paints, so the edge is replaced rather than doubled. Lifted outranks it: a
     card in somebody's hand says so with the popover shadow and the one emphasis colour the
     palette has. */
  const edge = (): React.CSSProperties => {
    if (lifted) return { borderColor: 'var(--action-primary)', boxShadow: 'var(--shadow-popover)' };
    if (hover) return { borderColor: 'transparent', boxShadow: 'var(--shadow-card-hover)' };
    return { borderColor: 'var(--border-default)', boxShadow: 'none' };
  };

  const painted = edge();
  /* Composed rather than replaced: a card that gains focus while held keeps both marks, which
     is §31's answer on `ToggleButton` and for §31's reason — the ring is the only thing saying
     where the next keystroke lands. */
  if (focused) {
    painted.boxShadow =
      painted.boxShadow === 'none'
        ? 'var(--shadow-focus-input)'
        : `${painted.boxShadow}, var(--shadow-focus-input)`;
  }

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
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      /* §68 — a keyboard's ring, not a pointer's. The ring matters most here, because a
         card held mid-drag has nothing else saying where the arrow keys apply. */
      onFocus={(event) => setFocused(isKeyboardFocus(event.currentTarget))}
      onBlur={() => setFocused(false)}
      style={{
        display: 'grid',
        /* 6px and 12px, which are the two steps a card this small has room for: the three
           lines in it are one fact each and read as a block, not as three sections. */
        gap: 'var(--space-2)',
        padding: 'var(--space-5)',
        backgroundColor: 'var(--surface-card)',
        border: 'var(--border-width-hairline) solid',
        borderRadius: 'var(--radius-l)',
        fontFamily: 'var(--font-family-base)',
        transform: lifted && !reducedMotion ? 'translateY(-1px)' : hover && !reducedMotion ? 'scale(1.01)' : 'none',
        transition: reducedMotion ? undefined : 'var(--transition-card-hover)',
        cursor: draggable ? 'grab' : 'pointer',
        /* The system's disabled reading — transparency, no second ink. The card keeps its
           column and its assessment; it is not struck through and not moved. */
        opacity: cancelled ? 0.65 : 1,
        userSelect: 'none',
        ...painted,
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          data-testid={`board-card-name-${cardId}`}
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 'var(--font-weight-medium)',
            /* 14px, not 16. A board is five columns of these at 220px, and the name is the
               only thing on the card that must never wrap — the step down is what buys the
               characters, and `--font-size-s` at `medium` is what every other name in the
               product is set in. */
            fontSize: 'var(--font-size-s)',
            color: 'var(--text-primary)',
          }}
        >
          {name}
        </span>
        {flag && (
          <>
            {/* `--status-warning`, because the status palette is scoped to real state and an
                interview with no recorded outcome is exactly that. The colour is never the only
                signal — the meaning is the card's own description, below. */}
            <span
              data-testid={`board-card-no-conclusion-${cardId}`}
              title={flag}
              aria-hidden
              style={{ display: 'flex', color: 'var(--status-warning)', flexShrink: 0 }}
            >
              <FlagIcon />
            </span>
            <span id={flagId} style={VISUALLY_HIDDEN}>
              {flag}
            </span>
          </>
        )}
      </div>

      <div
        data-testid={`board-card-when-${cardId}`}
        style={{
          fontSize: 'var(--font-size-xs)',
          fontVariantNumeric: 'tabular-nums',
          /* The date is the reason to look at the card, so while the interview is still ahead
             it is read at full strength and only *recedes* once it is behind — which is the
             opposite of the earlier reading, where an upcoming interview was already quieter
             than the name above it and a past one quieter still. Two inks, one step apart. */
          color: past ? 'var(--text-secondary)' : 'var(--text-primary)',
        }}
      >
        {when}
      </div>

      {/* §42 — a third line only when there is something on it. The card carried a `CV` mark
          here on every card, which is to say on every card: a booking cannot be made without
          a CV, so the mark distinguished nothing and cost a row of height in a column that is
          scrolling. What is left is the one thing that is not always true. */}
      {cancelled && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
          {/* The badge is truncated to a first name by design — a board card is a glance —
              so the whole fact is its accessible **name**, not what is drawn. It has to be an
              `aria-label`: a native `title` on an element that already has text content
              becomes its *description*, and the text content still wins the name
              computation. */}
          <Badge
            status="inactive"
            /* Outlined. A solid red pill is the loudest thing the palette can paint, and a
               called-off interview is a fact about a card already dimmed to 0.65 — the fill
               would make the one card nobody has to act on the first the eye lands on. */
            outlined
            size="s"
            aria-label={cancelledTooltip || undefined}
            data-testid={`board-card-cancelled-${cardId}`}
          >
            {cancelledLabel}
          </Badge>
        </div>
      )}
    </div>
  );
}

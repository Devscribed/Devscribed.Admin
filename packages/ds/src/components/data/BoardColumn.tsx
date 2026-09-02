import React from 'react';

/**
 * §43 — **designed, not measured**, though the shape is one blue already draws: a
 * `--surface-sunken` well holding white cards, which is `AppShell`'s own arrangement one
 * level down. The name is a label *on* that ground, not a card title above it.
 *
 * Presentational and drag-mechanical only. The column converts a pointer position into a
 * **slot index** and hands it back; which columns exist, what a slot means, and what a drop
 * writes are all the caller's.
 */
export interface BoardColumnProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onDrop'> {
  /** Suffixes the column's own `data-testid`s. Never interpreted. */
  status: string;
  name: React.ReactNode;
  count?: number;
  emptyLabel?: React.ReactNode;
  /** Heading level for the column name. Defaults to `h2`, under a `PageTitle` `<h1>`. */
  nameAs?: React.ElementType;
  /** Drops the head, for a column that is already named by the tab strip that chose it. */
  hideHeader?: boolean;
  /**
   * Where the placeholder opens its gap, as a slot index into the column **without** the card
   * in flight. `null` renders none.
   */
  placeholderIndex?: number | null;
  /** Measured from the card at pick-up, so the gap is exactly the size it will fill. */
  placeholderHeight?: number;
  /** Called on every `dragover` with the slot a drop at the pointer would take. */
  onDragOverIndex?: (index: number) => void;
  /** Called on drop with that same slot index. */
  onDrop?: (index: number) => void;
  onDragLeave?: (event: React.DragEvent<HTMLDivElement>) => void;
  children?: React.ReactNode;
}

/**
 * BoardColumn — §43. One column of a board: a head carrying its name and count, and a
 * scrolling body of cards with a card-sized placeholder holding open the gap a drop would
 * land in.
 *
 * **Designed, not measured**, like `BoardCard` (§42) — but the shape is one blue already
 * draws twice. The whole column is a `--surface-sunken` well holding white cards, which is
 * `AppShell`'s own arrangement one level down: blue's single answer to "a container of
 * things" is a recessed ground with white panels on it, and a kanban column is exactly that.
 *
 * **The head sits inside the well rather than above it in a card of its own.** The first
 * version of this entry wrapped the well in a `Card` (§12) and gave it `Card`'s title row at
 * blue's headline-6 over a hairline — five bordered white boxes each containing a grey box,
 * with a 24px heading on top of a 14px card. That is a container drawn twice. A column is not
 * a card; it is the ground the cards are on, and its name is a label on that ground: the
 * label takes `--font-size-s` at `--font-weight-medium`, which is exactly the weight a
 * `BoardCard`'s own name takes, and the count sits beside it rather than pushed to the far
 * edge — five columns of one word each, and a count 200px away from what it counts reads as
 * a column of its own.
 *
 * Presentational and drag-mechanical only. It converts a pointer position into a **slot
 * index** — how many cards sit above the pointer — and hands that back; what the slots mean,
 * and what a drop at one writes, belong to the caller.
 *
 * The index counts **cards only**: the placeholder is excluded, so the index is always one
 * into the column as it will be *without* the card in flight. That is what keeps the
 * arithmetic stable while the gap itself moves around under the pointer — a placeholder
 * counted as a slot would shift the answer by one the moment it appeared.
 */
export function BoardColumn({
  status,
  name,
  count = 0,
  emptyLabel = 'Nothing here yet.',
  /** Heading level for the column name. The board's columns sit under a `PageTitle` `<h1>`. */
  nameAs: NameTag = 'h2',
  /**
   * Drops the head. Below the board's breakpoint the column *is* the panel a tab strip
   * chose, and that strip's chosen tab already carries this column's name and count — a
   * heading under it would be the same two facts twice, 8px apart.
   */
  hideHeader = false,
  /** Where the placeholder opens its gap, as a slot index. `null` renders none. */
  placeholderIndex = null,
  /** Measured from the card in flight, so its gap is exactly the size it will fill. */
  placeholderHeight = 76,
  onDragOverIndex,
  onDrop,
  onDragLeave,
  children,
  style,
  ...rest
}: BoardColumnProps) {
  const body = React.useRef<HTMLDivElement | null>(null);
  const cards = React.Children.toArray(children);

  /** How many cards sit entirely above the pointer — the slot a drop would take. */
  const slotAt = (clientY: number) => {
    const node = body.current;
    if (!node) return 0;
    // Cards only. The placeholder carries no `data-board-card`, so the gap it opens never
    // counts itself as a slot.
    const items = [...node.querySelectorAll('[data-board-card]')];
    for (const [at, item] of items.entries()) {
      const rect = item.getBoundingClientRect();
      if (clientY < rect.top + rect.height / 2) return at;
    }
    return items.length;
  };

  const placeholder = (
    <div
      key="board-placeholder"
      data-board-placeholder=""
      data-testid={`board-placeholder-${status}`}
      aria-hidden
      style={{
        height: placeholderHeight,
        // In a scrolling flex column an empty box is the first thing to be squeezed.
        flexShrink: 0,
        borderRadius: 'var(--radius-l)',
        /* The gap is the well showing through, outlined in the one emphasis colour blue has.
           A tinted fill would be a second object on a board that must only ever show one. */
        backgroundColor: 'var(--surface-sunken)',
        border: '1px dashed var(--action-primary)',
        boxSizing: 'border-box',
      }}
    />
  );

  const slots = [...cards];
  if (placeholderIndex !== null) {
    slots.splice(Math.min(Math.max(placeholderIndex, 0), cards.length), 0, placeholder);
  }

  return (
    <section
      {...rest}
      data-testid={`board-column-${status}`}
      // The count is inside the region's own name: "Maybe, 2 cards" is what a screen reader
      // needs on arrival, and the visible count is not in its label otherwise.
      aria-label={`${name}, ${count} ${count === 1 ? 'card' : 'cards'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-3)',
        minWidth: 0,
        /* The well *is* the column. The cards are the only white on the board. */
        backgroundColor: 'var(--surface-sunken)',
        borderRadius: 'var(--radius-l)',
        /* 2px at the sides, because the body inside it carries the real 8px: a column that
           scrolls has to put its scrollbar against its own edge, not 8px in from it. */
        padding: 'var(--space-4) 2px',
        boxSizing: 'border-box',
        fontFamily: 'var(--font-family-base)',
        ...style,
      }}
    >
      {!hideHeader && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: '0 var(--space-4)',
            flexShrink: 0,
          }}
        >
          <NameTag
            style={{
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 'var(--font-weight-medium)',
              fontSize: 'var(--font-size-s)',
              lineHeight: '20px',
              color: 'var(--text-primary)',
            }}
          >
            {name}
          </NameTag>
          <span
            data-testid={`board-column-count-${status}`}
            style={{
              flexShrink: 0,
              fontSize: 'var(--font-size-xs)',
              fontVariantNumeric: 'tabular-nums',
              color: 'var(--text-secondary)',
            }}
          >
            {count}
          </span>
        </div>
      )}

      <div
        ref={body}
        onDragOver={(event) => {
          if (!onDragOverIndex) return;
          // Without this the browser refuses the drop outright.
          event.preventDefault();
          onDragOverIndex(slotAt(event.clientY));
        }}
        onDragLeave={onDragLeave}
        onDrop={(event) => {
          if (!onDrop) return;
          event.preventDefault();
          onDrop(slotAt(event.clientY));
        }}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-3)',
          padding: 'var(--space-2) var(--space-3)',
          // One card's worth, so an empty column is still a target worth aiming at.
          minHeight: 76,
          overflowY: 'auto',
        }}
      >
        {slots.length === 0 ? (
          /* Top-left and quiet, not centred: a centred sentence in an empty column is the
             most prominent thing on a board whose other four columns have work in them. */
          <p
            data-testid={`board-column-empty-${status}`}
            style={{
              margin: 0,
              padding: 2,
              fontSize: 'var(--font-size-xs)',
              color: 'var(--text-secondary)',
            }}
          >
            {emptyLabel}
          </p>
        ) : (
          slots
        )}
      </div>
    </section>
  );
}

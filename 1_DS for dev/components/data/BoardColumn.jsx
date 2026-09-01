import React from 'react';

/**
 * BoardColumn — §43. One column of a board: a head carrying its name and count, and a
 * scrolling body of cards with a card-sized placeholder holding open the gap a drop would
 * land in.
 *
 * **Designed, not measured**, like `BoardCard` (§42) — but the shape is one blue already
 * draws twice. The column is a `Card` (§12): white, a 1px `--border-default` hairline, the
 * 8px radius, no shadow. Its body is a `--surface-sunken` well holding white cards, which is
 * `AppShell`'s own arrangement one level down — blue's single answer to "a container of
 * things" is a recessed ground with white panels on it, and a kanban column is exactly that.
 * The head is `Card`'s title row: a real heading at blue's headline-6, in sentence case,
 * because blue's one uppercase is `PageTabs` and the narrow board's tab strip is already it.
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
}) {
  const body = React.useRef(null);
  const cards = React.Children.toArray(children);

  /** How many cards sit entirely above the pointer — the slot a drop would take. */
  const slotAt = (clientY) => {
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
        border: '1px dashed var(--action-primary)',
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
        minWidth: 0,
        backgroundColor: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-l)',
        fontFamily: 'var(--font-family-base)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          padding: 'var(--space-4) var(--space-5)',
          backgroundColor: 'var(--surface-card)',
          borderBottom: '1px solid var(--border-default)',
        }}
      >
        <NameTag
          style={{
            minWidth: 0,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            fontWeight: 'var(--headline-6-weight)',
            fontSize: 'var(--headline-6-size)',
            lineHeight: 'var(--headline-6-line)',
            letterSpacing: 'var(--headline-6-tracking)',
            color: 'var(--text-primary)',
          }}
        >
          {name}
        </NameTag>
        <span
          data-testid={`board-column-count-${status}`}
          style={{
            flexShrink: 0,
            fontWeight: 'var(--font-weight-medium)',
            fontSize: 'var(--font-size-s)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-secondary)',
          }}
        >
          {count}
        </span>
      </div>

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
          padding: 'var(--space-3)',
          backgroundColor: 'var(--surface-sunken)',
          // One card's worth, so an empty column is still a target worth aiming at.
          minHeight: 84,
          overflowY: 'auto',
        }}
      >
        {slots.length === 0 ? (
          <p
            data-testid={`board-column-empty-${status}`}
            style={{
              margin: 'auto 0',
              textAlign: 'center',
              fontSize: 'var(--font-size-s)',
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

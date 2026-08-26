import React from 'react';
import { SectionLabel } from '../typography/SectionLabel.jsx';

/**
 * One column of a board: a sticky head carrying its name and count, and a scrolling body
 * of cards with a card-sized placeholder holding open the gap a drop would land in.
 *
 * Presentational and drag-mechanical only. It converts a pointer position into a **slot
 * index** — how many cards sit above the pointer — and hands that back; what the slots
 * mean, and what a drop at one writes, belong to the caller.
 *
 * The index counts **cards only**: the placeholder is excluded, so the index is always
 * one into the column as it will be *without* the card in flight. That is what keeps the
 * arithmetic stable while the gap itself moves around under the pointer — a placeholder
 * counted as a slot would shift the answer by one the moment it appeared.
 */
export function BoardColumn({
  status,
  name,
  count = 0,
  emptyLabel = 'Nothing here yet.',
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
    // Cards only. The placeholder carries no `data-board-card`, so the gap it opens
    // never counts itself as a slot.
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
        borderRadius: 'var(--radius-xl)',
        background: 'var(--bg-sunken)',
        border: '1px dashed var(--accent-border)',
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
      // The count is inside the region's own name: "Maybe, 2 cards" is what a screen
      // reader needs on arrival, and the visible count is not in its label otherwise.
      aria-label={`${name}, ${count} ${count === 1 ? 'card' : 'cards'}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-xl)',
        background: 'var(--bg-panel-2)',
        overflow: 'hidden',
        ...style,
      }}
    >
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '9px 12px',
          background: 'var(--bg-sunken)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <SectionLabel style={{ margin: 0 }}>{name}</SectionLabel>
        <span
          data-testid={`board-column-count-${status}`}
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'var(--fs-13)',
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-muted)',
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
          gap: 'var(--sp-4)',
          padding: 'var(--sp-4)',
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
              fontSize: 'var(--fs-13)',
              color: 'var(--text-muted)',
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

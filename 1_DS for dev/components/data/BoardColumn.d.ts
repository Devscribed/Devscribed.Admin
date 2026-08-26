import * as React from 'react';

export interface BoardColumnProps
  extends Omit<React.HTMLAttributes<HTMLElement>, 'onDrop' | 'onDragLeave'> {
  /** Identifies the column in every `data-testid` it renders. */
  status: string;
  name: React.ReactNode;
  count?: number;
  emptyLabel?: string;
  /** Where the placeholder opens its gap, as a slot index. `null` renders none. */
  placeholderIndex?: number | null;
  /** Measured from the card in flight, so its gap is exactly the size it will fill. */
  placeholderHeight?: number;
  /** The slot the pointer is currently over, counting cards only. */
  onDragOverIndex?: (index: number) => void;
  onDrop?: (index: number) => void;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  children?: React.ReactNode;
}

/**
 * One column of a board: a sticky head with its name and count, and a scrolling body of
 * cards with a card-sized placeholder holding open the gap a drop would land in.
 *
 * The slot index it reports counts **cards only** — the placeholder is never a slot — so
 * it is always an index into the column as it will be without the card in flight.
 */
export declare function BoardColumn(props: BoardColumnProps): JSX.Element;

import { HTMLAttributes, ReactNode } from 'react';

/**
 * §43 — **designed, not measured**, though the shape is one blue already draws: a `Card`
 * (§12) whose body is a `--surface-sunken` well holding white cards, which is `AppShell`'s
 * own arrangement one level down.
 *
 * Presentational and drag-mechanical only. The column converts a pointer position into a
 * **slot index** and hands it back; which columns exist, what a slot means, and what a drop
 * writes are all the caller's.
 */
export interface BoardColumnProps
  extends Omit<HTMLAttributes<HTMLElement>, 'onDrop'> {
  /** Suffixes the column's own `data-testid`s. Never interpreted. */
  status: string;
  name: ReactNode;
  count?: number;
  emptyLabel?: ReactNode;
  /** Heading level for the column name. Defaults to `h2`, under a `PageTitle` `<h1>`. */
  nameAs?: keyof JSX.IntrinsicElements;
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
  children?: ReactNode;
}

export function BoardColumn(props: BoardColumnProps): JSX.Element;

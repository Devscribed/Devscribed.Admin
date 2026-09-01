'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  APPLICATION_STATUS_LABELS,
  BOARD_COLUMNS,
  HIRING_MESSAGES,
  neighboursAt,
  type ApplicationStatus,
} from '@devscribed/validation';
import type { Board, BoardColumnData } from '@/hiring/types';

/**
 * A drag in progress, pointer or keyboard.
 *
 * `from.index` is where the card sits in its own column now. `to.index` is a slot in the
 * target column **as it will be without the card in flight** — the same list the server
 * resolves neighbours against, so there is no rendered-versus-model conversion anywhere:
 * the column never renders the card being dragged, and the placeholder that stands in for
 * it is not counted as a slot.
 */
export interface Drag {
  mode: 'pointer' | 'keyboard';
  /** `held` until the target first moves — the two are announced differently. */
  phase: 'held' | 'moving';
  applicationId: string;
  name: string;
  /** The card's own height, measured at pick-up, so its gap is exactly its size. */
  height: number | null;
  from: { status: ApplicationStatus; index: number };
  to: { status: ApplicationStatus; index: number };
}

export interface Placement {
  status: ApplicationStatus;
  afterApplicationId: string | null;
  beforeApplicationId: string | null;
  /** Where the card lands in the target column, for the optimistic render. */
  index: number;
}

const columnOf = (board: Board, status: ApplicationStatus): BoardColumnData =>
  board.columns.find((column) => column.status === status)!;

/** A column as it will be without the card in flight — the list every index is into. */
export const columnWithout = (
  board: Board,
  status: ApplicationStatus,
  applicationId: string,
): BoardColumnData['cards'] =>
  columnOf(board, status).cards.filter((card) => card.applicationId !== applicationId);

/**
 * The drag a board is in the middle of: what has been picked up, where it is aimed, and
 * what a drop there would ask the server for.
 *
 * The state machine is the same for both input methods and only the events differ —
 * `dragover` moves the target for a pointer, arrow keys move it for a keyboard. Keeping
 * them one machine is what stops the two drifting into different rules about what a drop
 * at the bottom of a column means.
 */
export function useBoardDrag(board: Board | null) {
  const [drag, setDrag] = useState<Drag | null>(null);

  /**
   * Slots run 0…length of the column *without* the card in flight: one above every card
   * that will still be there, and one below the last.
   */
  const slots = useCallback(
    (status: ApplicationStatus, applicationId: string): number =>
      board ? columnWithout(board, status, applicationId).length : 0,
    [board],
  );

  const pickUp = useCallback(
    (mode: Drag['mode'], applicationId: string, height: number | null = null): void => {
      if (!board) return;
      for (const column of board.columns) {
        const index = column.cards.findIndex((card) => card.applicationId === applicationId);
        if (index === -1) continue;
        const at = { status: column.status, index };
        // `to` starts equal to `from`: in a column without this card, the slot at its
        // own index puts it back exactly where it was, which is the no-op below.
        setDrag({
          mode,
          phase: 'held',
          applicationId,
          name: column.cards[index].name,
          height,
          from: at,
          to: { ...at },
        });
        return;
      }
    },
    [board],
  );

  const aimAt = useCallback((status: ApplicationStatus, index: number): void => {
    setDrag((current) => {
      if (!current) return current;
      if (current.to.status === status && current.to.index === index) return current;
      return { ...current, phase: 'moving', to: { status, index } };
    });
  }, []);

  const drop = useCallback(() => setDrag(null), []);

  /**
   * Arrow keys, for a card held by the keyboard.
   *
   * Left and right clamp into the new column rather than refusing at its end, because a
   * card aimed at the bottom of a long column and moved sideways into a short one has to
   * land somewhere, and the nearest end is the only answer that is not a surprise.
   */
  const nudge = useCallback(
    (key: string): boolean => {
      if (!drag) return false;
      const { status, index } = drag.to;
      const columnIndex = BOARD_COLUMNS.indexOf(status);

      if (key === 'ArrowUp') {
        aimAt(status, Math.max(0, index - 1));
        return true;
      }
      if (key === 'ArrowDown') {
        aimAt(status, Math.min(slots(status, drag.applicationId), index + 1));
        return true;
      }
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const next = BOARD_COLUMNS[columnIndex + (key === 'ArrowLeft' ? -1 : 1)];
        if (!next) return true;
        aimAt(next, Math.min(index, slots(next, drag.applicationId)));
        return true;
      }
      return false;
    },
    [drag, aimAt, slots],
  );

  /**
   * What the drop asks for, or `null` when it asks for nothing.
   *
   * A drop back into the card's own place is a no-op and issues no request (05 §02.6).
   * In its own column that is exactly one slot — the index it already occupies — because
   * the list the index is into is the column without it.
   */
  const placementFor = useCallback((): Placement | null => {
    if (!board || !drag) return null;
    const { from, to } = drag;

    if (to.status === from.status && to.index === from.index) return null;

    const others = columnWithout(board, to.status, drag.applicationId).map((card) => ({
      id: card.applicationId,
      position: card.position,
    }));

    return { status: to.status, index: to.index, ...neighboursAt(others, to.index) };
  }, [board, drag]);

  /**
   * What a screen reader hears. Pick-up, every target change, and the drop are announced
   * from one place, so the wording cannot drift between them.
   */
  const announcement = useMemo((): string => {
    if (!board || !drag) return '';
    const total = columnWithout(board, drag.to.status, drag.applicationId).length + 1;

    const where = `${APPLICATION_STATUS_LABELS[drag.to.status]}, position ${drag.to.index + 1} of ${total}`;
    // The hint rides along with the pick-up rather than being repeated on every card,
    // where it would be read out before every name on the board.
    return drag.phase === 'held'
      ? `Picked up ${drag.name}. ${where}. ${HIRING_MESSAGES.board.keyboardHint}`
      : `${drag.name}, ${where}.`;
  }, [board, drag]);

  return { drag, pickUp, aimAt, drop, nudge, placementFor, announcement };
}

/**
 * The board as it would look if the move succeeded, applied before the request goes out
 * (05 §04.14). Reverted wholesale on failure — there is no partial state to unwind,
 * because the previous board is kept as it was rather than mutated.
 */
export function withMove(
  board: Board,
  applicationId: string,
  placement: Placement,
): Board {
  const moved = board.columns
    .flatMap((column) => column.cards)
    .find((card) => card.applicationId === applicationId);
  if (!moved) return board;

  const columns = board.columns.map((column) => {
    const cards = column.cards.filter((card) => card.applicationId !== applicationId);
    if (column.status === placement.status) cards.splice(placement.index, 0, moved);
    return { ...column, cards, count: cards.length };
  });

  return { ...board, columns };
}

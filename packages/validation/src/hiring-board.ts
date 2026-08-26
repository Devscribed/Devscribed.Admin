/**
 * Board rules — spec 05.
 *
 * The board's whole model is two facts about one row: which of five columns a card is
 * in, and where in that column it sits. `Application.status` **is** the column, and
 * `Application.position` is a gap integer scoped to `(vacancyId, status)`.
 *
 * Everything here is arithmetic over positions, and none of it takes a position as
 * input from anywhere. A drop is resolved from the neighbouring cards the client named
 * and their *current* values — a position sent by the client would be a number read off
 * a board that may already have moved on (05 §API PATCH).
 */

import {
  APPLICATION_STATUSES,
  POSITION_STEP,
  isApplicationStatus,
  type ApplicationStatus,
} from './hiring';

/** The five columns, left to right. The board renders exactly these, always. */
export const BOARD_COLUMNS: readonly ApplicationStatus[] = APPLICATION_STATUSES;

/** Anything the ordering rules need to know about a card. */
export interface ColumnCard {
  id: string;
  position: number;
}

/**
 * Position ascending, `id` breaking a tie (05 §03.7).
 *
 * The tiebreak is not decoration. Two cards can legitimately end up sharing a position
 * — a midpoint computed against a neighbour a concurrent move has since displaced — and
 * a sort that left their order to chance would swap them between renders.
 */
export function compareCards(left: ColumnCard, right: ColumnCard): number {
  if (left.position !== right.position) return left.position - right.position;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/** A stable copy in board order. Never sorts in place — callers render the original. */
export function sortColumn<T extends ColumnCard>(cards: readonly T[]): T[] {
  return [...cards].sort(compareCards);
}

/**
 * The narrowest gap a midpoint can still be found in. Below it there is no integer
 * strictly between the neighbours, so the column is renumbered instead (05 §03.10).
 */
export const MIN_GAP = 2;

export type PositionResult = { position: number } | { rebalance: true };

/**
 * Where a card dropped between two neighbours lands (05 §03.9, §03.11).
 *
 * A closed gap answers `rebalance` rather than a fraction or a duplicate: `position` is
 * an integer column, and two cards sharing a position is exactly the collision the
 * `id` tiebreak exists to survive rather than to cause.
 */
export function positionBetween(above: number | null, below: number | null): PositionResult {
  // An empty column starts where every column starts.
  if (above === null && below === null) return { position: POSITION_STEP };
  // The top and the bottom are open-ended, so a whole step is always available.
  if (above === null) return { position: below! - POSITION_STEP };
  if (below === null) return { position: above + POSITION_STEP };

  const gap = below - above;
  if (gap < MIN_GAP) return { rebalance: true };
  return { position: above + Math.floor(gap / 2) };
}

/**
 * Clean multiples of 1000 for a column of `count` cards, in the order they are given.
 *
 * Rebalancing rewrites one column and preserves its relative order exactly; it is not
 * a re-sort and it never crosses into another column.
 */
export function rebalancedPositions(count: number): number[] {
  return Array.from({ length: count }, (_, index) => (index + 1) * POSITION_STEP);
}

/* ------------------------------------------------------------------ *
 * Placement — the PATCH body, and the drop it describes
 * ------------------------------------------------------------------ */

export interface PlacementInput {
  status?: unknown;
  afterApplicationId?: unknown;
  beforeApplicationId?: unknown;
}

export interface PlacementValue {
  status: ApplicationStatus;
  /** The card immediately above the drop point; `null` at the top of a column. */
  afterApplicationId: string | null;
  /** The card immediately below it; `null` at the bottom. */
  beforeApplicationId: string | null;
}

export type PlacementResult =
  | { valid: true; value: PlacementValue }
  | { valid: false; error: 'invalid_status' };

const asId = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

/**
 * The one thing a placement body can get wrong on its own: a status outside the five.
 *
 * Note what is absent — `position` is not read, not validated, and not returned. The
 * client cannot send one that has any effect, because nothing here ever looks for it
 * (05 §Validation.3).
 */
export function validatePlacement(input: PlacementInput): PlacementResult {
  if (!isApplicationStatus(input.status)) return { valid: false, error: 'invalid_status' };
  return {
    valid: true,
    value: {
      status: input.status,
      afterApplicationId: asId(input.afterApplicationId),
      beforeApplicationId: asId(input.beforeApplicationId),
    },
  };
}

export type NeighbourResult =
  /** A named neighbour is not where the drop said it was — `409 stale_neighbours`. */
  | { valid: false }
  | {
      valid: true;
      above: number | null;
      below: number | null;
      /** Where the card lands in the column, needed only when a rebalance follows. */
      index: number;
    };

/**
 * Resolves the drop against the column as it is *now*.
 *
 * `column` is the target column in board order, with the moved card already removed —
 * a card being dragged within its own column is not its own neighbour.
 *
 * Three ways a drop can be stale, all answered the same way (05 §API 409): a neighbour
 * that has left the column, an "empty column" that has since gained a card, and two
 * neighbours named in an order the column no longer agrees with. Each of them would
 * otherwise put the card somewhere nobody aimed at, which is worse than asking for the
 * drag again.
 */
export function resolveNeighbours(
  column: readonly ColumnCard[],
  { afterApplicationId, beforeApplicationId }: PlacementValue,
): NeighbourResult {
  const afterIndex =
    afterApplicationId === null ? -1 : column.findIndex((c) => c.id === afterApplicationId);
  const beforeIndex =
    beforeApplicationId === null ? -1 : column.findIndex((c) => c.id === beforeApplicationId);

  if (afterApplicationId !== null && afterIndex === -1) return { valid: false };
  if (beforeApplicationId !== null && beforeIndex === -1) return { valid: false };
  if (afterApplicationId === null && beforeApplicationId === null && column.length > 0) {
    return { valid: false };
  }
  if (afterIndex !== -1 && beforeIndex !== -1 && beforeIndex <= afterIndex) return { valid: false };

  return {
    valid: true,
    above: afterIndex === -1 ? null : column[afterIndex].position,
    below: beforeIndex === -1 ? null : column[beforeIndex].position,
    index: afterIndex !== -1 ? afterIndex + 1 : beforeIndex !== -1 ? beforeIndex : 0,
  };
}

/**
 * The neighbours a drop at `index` names, read off the column the client is looking at.
 *
 * The board's side of the same contract: the screen knows where the card was dropped,
 * the server knows what a position is, and the two meet at a pair of ids.
 */
export function neighboursAt(
  column: readonly ColumnCard[],
  index: number,
): { afterApplicationId: string | null; beforeApplicationId: string | null } {
  return {
    afterApplicationId: index > 0 ? (column[index - 1]?.id ?? null) : null,
    beforeApplicationId: column[index]?.id ?? null,
  };
}

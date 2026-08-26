import { describe, expect, it } from 'vitest';
import {
  BOARD_COLUMNS,
  HIRING_MESSAGES,
  POSITION_STEP,
  compareCards,
  neighboursAt,
  positionBetween,
  rebalancedPositions,
  resolveNeighbours,
  sortColumn,
  validatePlacement,
} from './index';

/** The column of TC-H05-UNIT-01: three cards, clean multiples, in order. */
const COLUMN = [
  { id: 'a', position: 1000 },
  { id: 'b', position: 2000 },
  { id: 'c', position: 3000 },
];

describe('positionBetween — TC-H05-UNIT-01', () => {
  it('takes the midpoint between two neighbours', () => {
    expect(positionBetween(1000, 2000)).toEqual({ position: 1500 });
  });

  it('takes one step above the minimum at the top of a column', () => {
    expect(positionBetween(null, 1000)).toEqual({ position: 0 });
  });

  it('takes one step below the maximum at the bottom', () => {
    expect(positionBetween(3000, null)).toEqual({ position: 4000 });
  });

  it('starts an empty column at the step itself', () => {
    expect(positionBetween(null, null)).toEqual({ position: POSITION_STEP });
  });

  it('keeps going below zero at the top, because a column has no floor', () => {
    // Twelve bookings into a vacancy the top of Scheduled is already negative. Nothing
    // reads position as a rank, so this is arithmetic rather than a problem.
    expect(positionBetween(null, 0)).toEqual({ position: -1000 });
  });
});

describe('positionBetween — TC-H05-UNIT-02', () => {
  it('signals a rebalance rather than returning a fraction or a duplicate', () => {
    expect(positionBetween(1000, 1001)).toEqual({ rebalance: true });
  });

  it('signals a rebalance when two neighbours already share a position', () => {
    expect(positionBetween(2000, 2000)).toEqual({ rebalance: true });
  });

  it('still finds the one integer available in the narrowest usable gap', () => {
    expect(positionBetween(1000, 1002)).toEqual({ position: 1001 });
  });

  it('renumbers a column to clean multiples in the same relative order', () => {
    expect(rebalancedPositions(4)).toEqual([1000, 2000, 3000, 4000]);
    expect(rebalancedPositions(0)).toEqual([]);
  });
});

describe('sortColumn — TC-H05-UNIT-03', () => {
  it('breaks a collision by id, identically on every render', () => {
    const collided = [
      { id: 'z', position: 2000 },
      { id: 'a', position: 2000 },
      { id: 'm', position: 1000 },
    ];

    const first = sortColumn(collided).map((card) => card.id);
    const second = sortColumn(sortColumn(collided)).map((card) => card.id);

    expect(first).toEqual(['m', 'a', 'z']);
    // No card changes place between renders — the second sort is the first one again.
    expect(second).toEqual(first);
  });

  it('leaves the array it was handed alone', () => {
    const original = [...COLUMN].reverse();
    const copy = [...original];
    sortColumn(original);
    expect(original).toEqual(copy);
  });

  it('orders by position before id', () => {
    expect(compareCards({ id: 'z', position: 1000 }, { id: 'a', position: 2000 })).toBeLessThan(0);
    expect(compareCards({ id: 'a', position: 2000 }, { id: 'z', position: 2000 })).toBeLessThan(0);
    expect(compareCards({ id: 'a', position: 2000 }, { id: 'a', position: 2000 })).toBe(0);
  });
});

describe('validatePlacement', () => {
  it('accepts each of the five columns', () => {
    for (const status of BOARD_COLUMNS) {
      expect(validatePlacement({ status })).toEqual({
        valid: true,
        value: { status, afterApplicationId: null, beforeApplicationId: null },
      });
    }
  });

  it('refuses a status outside the five, and a missing one', () => {
    expect(validatePlacement({ status: 'hired' })).toEqual({ valid: false, error: 'invalid_status' });
    expect(validatePlacement({})).toEqual({ valid: false, error: 'invalid_status' });
    expect(validatePlacement({ status: 1 })).toEqual({ valid: false, error: 'invalid_status' });
  });

  it('ignores a position sent by the client', () => {
    // Not rejected — simply never read. The value the row ends up with is derived from
    // the neighbours, so there is nothing here for a stale board to write (05 §Validation.3).
    const result = validatePlacement({ status: 'maybe', position: -99_999 } as object);
    expect(result).toEqual({
      valid: true,
      value: { status: 'maybe', afterApplicationId: null, beforeApplicationId: null },
    });
    expect(JSON.stringify(result)).not.toContain('position');
  });

  it('reads an empty neighbour id as no neighbour', () => {
    expect(
      validatePlacement({ status: 'passed', afterApplicationId: '', beforeApplicationId: null }),
    ).toEqual({
      valid: true,
      value: { status: 'passed', afterApplicationId: null, beforeApplicationId: null },
    });
  });
});

describe('resolveNeighbours', () => {
  const place = (after: string | null, before: string | null, column = COLUMN) =>
    resolveNeighbours(column, {
      status: 'maybe',
      afterApplicationId: after,
      beforeApplicationId: before,
    });

  it('reads the neighbours current positions, not the ones the client saw', () => {
    expect(place('a', 'b')).toEqual({ valid: true, above: 1000, below: 2000, index: 1 });
    expect(place(null, 'a')).toEqual({ valid: true, above: null, below: 1000, index: 0 });
    expect(place('c', null)).toEqual({ valid: true, above: 3000, below: null, index: 3 });
    expect(place(null, null, [])).toEqual({ valid: true, above: null, below: null, index: 0 });
  });

  it('rejects a neighbour that has left the column', () => {
    expect(place('gone', 'b')).toEqual({ valid: false });
    expect(place('a', 'gone')).toEqual({ valid: false });
  });

  it('rejects an empty-column drop into a column that is not empty', () => {
    expect(place(null, null)).toEqual({ valid: false });
  });

  it('rejects neighbours named in an order the column disagrees with', () => {
    expect(place('c', 'a')).toEqual({ valid: false });
    expect(place('b', 'b')).toEqual({ valid: false });
  });
});

describe('neighboursAt', () => {
  it('names the pair a drop at each index sits between', () => {
    expect(neighboursAt(COLUMN, 0)).toEqual({ afterApplicationId: null, beforeApplicationId: 'a' });
    expect(neighboursAt(COLUMN, 1)).toEqual({ afterApplicationId: 'a', beforeApplicationId: 'b' });
    expect(neighboursAt(COLUMN, 3)).toEqual({ afterApplicationId: 'c', beforeApplicationId: null });
    expect(neighboursAt([], 0)).toEqual({ afterApplicationId: null, beforeApplicationId: null });
  });

  it('round-trips: what the board names is what the server resolves', () => {
    for (let index = 0; index <= COLUMN.length; index += 1) {
      const named = neighboursAt(COLUMN, index);
      expect(resolveNeighbours(COLUMN, { status: 'maybe', ...named })).toMatchObject({
        valid: true,
        index,
      });
    }
  });
});

describe('board copy', () => {
  it('refuses in the board’s own words, not the vacancy list’s', () => {
    expect(HIRING_MESSAGES.board.forbidden).toBe(
      'You do not have permission to manage candidates',
    );
    expect(HIRING_MESSAGES.board.forbidden).not.toBe(HIRING_MESSAGES.vacancy.forbidden);
  });

  it('keeps an empty column and an empty board as separate sentences', () => {
    expect(HIRING_MESSAGES.board.emptyColumn).toBe('Nothing here yet.');
    expect(HIRING_MESSAGES.board.emptyBoard).toBe(
      'No candidates yet. Share the booking link to start.',
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  FUNNEL_WIDTH,
  PALETTE,
  SAND_COLS,
  SAND_ROWS,
  countByColor,
  drainBottomRow,
  emptyGrid,
  funnelMouth,
  generateLevel,
  isCleared,
  isFunnelCol,
  isSettled,
  simulateStep,
} from './engine';

function idx(col: number, row: number): number {
  return row * SAND_COLS + col;
}

describe('emptyGrid', () => {
  it('starts fully empty at the declared dimensions', () => {
    const grid = emptyGrid();
    expect(grid).toHaveLength(SAND_COLS * SAND_ROWS);
    expect(grid.every((c) => c === null)).toBe(true);
  });
});

describe('simulateStep', () => {
  it('a lone grain falls one row per tick', () => {
    let grid = emptyGrid();
    grid[idx(10, 5)] = 'red';
    grid = simulateStep(grid);
    expect(grid[idx(10, 5)]).toBeNull();
    expect(grid[idx(10, 6)]).toBe('red');
  });

  it('a grain resting on the floor stays put', () => {
    let grid = emptyGrid();
    grid[idx(10, SAND_ROWS - 1)] = 'red';
    grid = simulateStep(grid);
    expect(grid[idx(10, SAND_ROWS - 1)]).toBe('red');
  });

  // These use the bottom row as the "blocker" row: a cell there is never
  // itself a source in the simulation loop (rows only go up to ROWS-2), so
  // it can't fall out from under the grain being tested — unlike a blocker
  // placed mid-grid, which would fall away in the same tick (rows are
  // processed bottom-up specifically so lower grains move before upper
  // ones look at them).
  const R = SAND_ROWS - 2;

  it('slides diagonally when directly below is blocked but one side is open', () => {
    let grid = emptyGrid();
    grid[idx(10, R)] = 'red';
    grid[idx(10, R + 1)] = 'blue'; // directly below, blocked
    grid[idx(11, R + 1)] = 'blue'; // right diagonal, blocked
    // left diagonal (9, R+1) left open
    grid = simulateStep(grid);
    expect(grid[idx(10, R)]).toBeNull();
    expect(grid[idx(9, R + 1)]).toBe('red');
  });

  it('stays put when directly below and both diagonals are blocked', () => {
    let grid = emptyGrid();
    grid[idx(10, R)] = 'red';
    grid[idx(10, R + 1)] = 'blue';
    grid[idx(9, R + 1)] = 'blue';
    grid[idx(11, R + 1)] = 'blue';
    grid = simulateStep(grid);
    expect(grid[idx(10, R)]).toBe('red');
  });

  it('is deterministic given a fixed rand function, choosing left when rand < 0.5', () => {
    let grid = emptyGrid();
    grid[idx(10, R)] = 'red';
    grid[idx(10, R + 1)] = 'blue'; // below blocked, both diagonals open
    const left = simulateStep(grid, () => 0.1);
    expect(left[idx(9, R + 1)]).toBe('red');
    expect(left[idx(11, R + 1)]).toBeNull();

    const right = simulateStep(grid, () => 0.9);
    expect(right[idx(11, R + 1)]).toBe('red');
    expect(right[idx(9, R + 1)]).toBeNull();
  });

  it('never moves a grain twice in a single tick (bottom-up processing)', () => {
    let grid = emptyGrid();
    grid[idx(10, 5)] = 'red';
    const next = simulateStep(grid);
    // If double-moved it would land at row 7; it should only reach row 6.
    expect(next[idx(10, 6)]).toBe('red');
    expect(next[idx(10, 7)]).toBeNull();
  });

  it('conserves every grain and settles them near the floor after enough ticks', () => {
    // Once a falling grain catches up to a resting one below it, an
    // unsupported column naturally spreads sideways (real sand piles form
    // a slope, not a single-file tower) — so this checks conservation and
    // "reached the bottom region," not an exact final column layout.
    let grid = emptyGrid();
    grid[idx(10, 0)] = 'red';
    grid[idx(10, 1)] = 'red';
    grid[idx(10, 2)] = 'red';
    for (let i = 0; i < SAND_ROWS * 2; i++) grid = simulateStep(grid);
    const filled = grid.map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    expect(filled).toHaveLength(3);
    for (const i of filled) expect(Math.floor(i / SAND_COLS)).toBeGreaterThanOrEqual(SAND_ROWS - 3);
  });
});

describe('generateLevel', () => {
  it('is deterministic: the same seed always yields the same level', () => {
    const a = generateLevel(42);
    const b = generateLevel(42);
    expect(a).toEqual(b);
  });

  it('different seeds produce different levels', () => {
    const a = generateLevel(1);
    const b = generateLevel(2);
    expect(a).not.toEqual(b);
  });

  it('picks 3 to 5 colors, all from the palette, with no duplicates', () => {
    for (let seed = 0; seed < 40; seed++) {
      const { colors } = generateLevel(seed);
      expect(colors.length).toBeGreaterThanOrEqual(3);
      expect(colors.length).toBeLessThanOrEqual(5);
      expect(new Set(colors).size).toBe(colors.length);
      for (const c of colors) expect(PALETTE).toContain(c);
    }
  });

  it('only fills the top portion of the grid, leaving the rest empty', () => {
    const { grid } = generateLevel(7);
    const filledRows = new Set(grid.map((c, i) => (c ? Math.floor(i / SAND_COLS) : -1)).filter((r) => r >= 0));
    expect(Math.max(...filledRows)).toBeLessThan(SAND_ROWS / 2);
  });

  it('every filled cell uses one of the level’s own colors', () => {
    const { grid, colors } = generateLevel(3);
    for (const cell of grid) if (cell) expect(colors).toContain(cell);
  });
});

describe('drainBottomRow', () => {
  const bottom = (SAND_ROWS - 1) * SAND_COLS;
  const { start: mouthStart, end: mouthEnd } = funnelMouth();

  it('removes matching grains sitting in the funnel mouth', () => {
    const grid = emptyGrid();
    grid[bottom + mouthStart] = 'red';
    grid[bottom + mouthStart + 1] = 'blue';
    grid[bottom + mouthStart + 2] = 'red';
    const { grid: next, drained } = drainBottomRow(grid, 'red');
    expect(drained).toBe(2);
    expect(next[bottom + mouthStart]).toBeNull();
    expect(next[bottom + mouthStart + 1]).toBe('blue'); // wrong color plugs the mouth
    expect(next[bottom + mouthStart + 2]).toBeNull();
  });

  it('leaves bottom-row grains OUTSIDE the funnel mouth alone — they must slide in first', () => {
    const grid = emptyGrid();
    grid[bottom] = 'red'; // far-left floor, nowhere near the mouth
    grid[bottom + SAND_COLS - 1] = 'red'; // far-right floor
    const { grid: next, drained } = drainBottomRow(grid, 'red');
    expect(drained).toBe(0);
    expect(next[bottom]).toBe('red');
    expect(next[bottom + SAND_COLS - 1]).toBe('red');
  });

  it('the funnel mouth is a narrow opening centered on the floor', () => {
    expect(mouthEnd - mouthStart).toBe(FUNNEL_WIDTH);
    expect(FUNNEL_WIDTH).toBeLessThan(SAND_COLS);
    // Centered: equal floor on both sides.
    expect(mouthStart).toBe(SAND_COLS - mouthEnd);
    for (let c = mouthStart; c < mouthEnd; c++) expect(isFunnelCol(c)).toBe(true);
    expect(isFunnelCol(mouthStart - 1)).toBe(false);
    expect(isFunnelCol(mouthEnd)).toBe(false);
  });

  it('leaves the grid untouched when no bucket is open', () => {
    const grid = emptyGrid();
    grid[bottom + mouthStart] = 'red';
    const { grid: next, drained } = drainBottomRow(grid, null);
    expect(drained).toBe(0);
    expect(next[bottom + mouthStart]).toBe('red');
  });

  it('never drains grains above the bottom row', () => {
    const grid = emptyGrid();
    grid[SAND_COLS + mouthStart] = 'red'; // row 1 of the mouth column, not the floor
    const { grid: next } = drainBottomRow(grid, 'red');
    expect(next[SAND_COLS + mouthStart]).toBe('red');
  });
});

describe('isSettled', () => {
  it('an empty grid is settled', () => {
    expect(isSettled(emptyGrid())).toBe(true);
  });

  it('a grain with empty space below is not settled', () => {
    const grid = emptyGrid();
    grid[0] = 'red'; // top-left, nothing under it
    expect(isSettled(grid)).toBe(false);
  });

  it('a grain resting on the floor is settled', () => {
    const grid = emptyGrid();
    grid[(SAND_ROWS - 1) * SAND_COLS] = 'red';
    expect(isSettled(grid)).toBe(true);
  });

  it('a fresh level settles after enough physics ticks', () => {
    let grid = generateLevel(2024).grid;
    expect(isSettled(grid)).toBe(false); // starts mid-air
    for (let i = 0; i < 4000 && !isSettled(grid); i++) grid = simulateStep(grid, () => 0.5);
    expect(isSettled(grid)).toBe(true);
  });
});

describe('isCleared', () => {
  it('is true only when every cell is empty', () => {
    expect(isCleared(emptyGrid())).toBe(true);
    const grid = emptyGrid();
    grid[0] = 'red';
    expect(isCleared(grid)).toBe(false);
  });
});

describe('countByColor', () => {
  it('tallies grains per color, zero-filling colors with none left', () => {
    const grid = emptyGrid();
    grid[0] = 'red';
    grid[1] = 'red';
    grid[2] = 'blue';
    expect(countByColor(grid, ['red', 'blue', 'green'])).toEqual({ red: 2, blue: 1, green: 0 });
  });
});

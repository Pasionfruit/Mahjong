import { describe, expect, it } from 'vitest';
import {
  FUNNEL_TOP_ROW,
  funnelInset,
  isWall,
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
  // Centre column of the funnel mouth. The bottom rows are mostly wall now,
  // so these cases have to run in the narrow opening — C and both its
  // diagonals are open on rows R and R+1. (Using a full-width row higher up
  // wouldn't work: the blocker would fall away in the same tick, which is
  // exactly what the bottom-row trick above avoids.)
  const C = Math.floor((funnelMouth().start + funnelMouth().end) / 2);

  it('slides diagonally when directly below is blocked but one side is open', () => {
    let grid = emptyGrid();
    grid[idx(C, R)] = 'red';
    grid[idx(C, R + 1)] = 'blue'; // directly below, blocked
    grid[idx(C + 1, R + 1)] = 'blue'; // right diagonal, blocked
    // left diagonal (9, R+1) left open
    grid = simulateStep(grid);
    expect(grid[idx(C, R)]).toBeNull();
    expect(grid[idx(C - 1, R + 1)]).toBe('red');
  });

  it('stays put when below, both diagonals, and both roll-drops are blocked', () => {
    let grid = emptyGrid();
    grid[idx(C, R)] = 'red';
    grid[idx(C, R + 1)] = 'blue';
    grid[idx(C - 1, R + 1)] = 'blue';
    grid[idx(C + 1, R + 1)] = 'blue';
    // Under the roll rule a grain on a one-cell tower shoulder rolls off,
    // so a truly resting grain needs the shelf beside it filled too.
    grid[idx(C - 2, R + 1)] = 'blue';
    grid[idx(C + 2, R + 1)] = 'blue';
    grid = simulateStep(grid);
    expect(grid[idx(C, R)]).toBe('red');
  });

  it('rolls sideways off a 45° shoulder so it can descend next tick', () => {
    let grid = emptyGrid();
    grid[idx(C, R)] = 'red';
    grid[idx(C, R + 1)] = 'blue'; // below blocked
    grid[idx(C - 1, R + 1)] = 'blue'; // both diagonals blocked
    grid[idx(C + 1, R + 1)] = 'blue';
    grid[idx(C - 2, R + 1)] = 'blue'; // left roll-drop blocked…
    // …but (C+2, R+1) is open: perched on the right shoulder.
    grid = simulateStep(grid, () => 0.9);
    expect(grid[idx(C, R)]).toBeNull();
    expect(grid[idx(C + 1, R)]).toBe('red');
    // And the roll is one cell per tick, not a skate across the shelf.
    expect(grid[idx(C + 2, R)]).toBeNull();
  });

  it('is deterministic given a fixed rand function, choosing left when rand < 0.5', () => {
    let grid = emptyGrid();
    grid[idx(C, R)] = 'red';
    grid[idx(C, R + 1)] = 'blue'; // below blocked, both diagonals open
    const left = simulateStep(grid, () => 0.1);
    expect(left[idx(C - 1, R + 1)]).toBe('red');
    expect(left[idx(C + 1, R + 1)]).toBeNull();

    const right = simulateStep(grid, () => 0.9);
    expect(right[idx(C + 1, R + 1)]).toBe('red');
    expect(right[idx(C - 1, R + 1)]).toBeNull();
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

  it('never drains grains above the neck', () => {
    const grid = emptyGrid();
    grid[SAND_COLS + mouthStart] = 'red'; // row 1 — far above the neck
    const { grid: next } = drainBottomRow(grid, 'red');
    expect(next[SAND_COLS + mouthStart]).toBe('red');
  });

  it('sifts the whole neck depth, not just the floor', () => {
    const grid = emptyGrid();
    // Plug the floor with an inactive color, active grain one row up.
    for (let c = mouthStart; c < mouthEnd; c++) grid[(SAND_ROWS - 1) * SAND_COLS + c] = 'blue';
    grid[(SAND_ROWS - 2) * SAND_COLS + mouthStart] = 'red';
    const { drained } = drainBottomRow(grid, 'red');
    // Without neck-depth sifting this would be 0 and the level could
    // deadlock behind a settled plug.
    expect(drained).toBe(1);
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

describe('funnel walls', () => {
  it('is full width above the taper and narrows to exactly the mouth at the floor', () => {
    expect(funnelInset(0)).toBe(0);
    expect(funnelInset(FUNNEL_TOP_ROW - 1)).toBe(0);
    expect(funnelInset(SAND_ROWS - 1)).toBe((SAND_COLS - FUNNEL_WIDTH) / 2);
    for (let c = 0; c < SAND_COLS; c++) expect(isWall(c, 0)).toBe(false);
  });

  it('narrows monotonically — a hopper, never a bulge', () => {
    for (let r = 1; r < SAND_ROWS; r++) {
      expect(funnelInset(r)).toBeGreaterThanOrEqual(funnelInset(r - 1));
    }
  });

  it('walls sit outside the opening at every row', () => {
    for (let r = 0; r < SAND_ROWS; r++) {
      const inset = funnelInset(r);
      for (let c = 0; c < SAND_COLS; c++) {
        expect(isWall(c, r)).toBe(c < inset || c >= SAND_COLS - inset);
      }
    }
  });

  it('sand never comes to rest inside a wall', () => {
    let grid = generateLevel(5).grid;
    for (let i = 0; i < 3000 && !isSettled(grid); i++) grid = simulateStep(grid, () => 0.5);
    for (let r = 0; r < SAND_ROWS; r++) {
      for (let c = 0; c < SAND_COLS; c++) {
        if (isWall(c, r)) expect(grid[r * SAND_COLS + c]).toBeNull();
      }
    }
  });

  it('a settled heap funnels: the lowest sand sits in the mouth', () => {
    let grid = generateLevel(5).grid;
    for (let i = 0; i < 3000 && !isSettled(grid); i++) grid = simulateStep(grid, () => 0.5);
    const bottom = (SAND_ROWS - 1) * SAND_COLS;
    const { start, end } = funnelMouth();
    let anyInMouth = false;
    for (let c = start; c < end; c++) if (grid[bottom + c]) anyInMouth = true;
    expect(anyInMouth).toBe(true); // it drained down to the point, not a flat slab
  });
});

describe('a level is actually winnable through the funnel', () => {
  it('cycling the open color drains every grain (no permanent plug)', () => {
    const { grid: start, colors } = generateLevel(5);
    let grid = start;
    let ci = 0;
    let sinceProgress = 0;
    let remaining = grid.filter(Boolean).length;
    // Simulate real play: run physics, drain the open color, and rotate the
    // color whenever it stops making progress (what a player does).
    for (let tick = 0; tick < 60_000 && remaining > 0; tick++) {
      grid = simulateStep(grid, () => (tick % 2 === 0 ? 0.25 : 0.75));
      const { grid: after, drained } = drainBottomRow(grid, colors[ci % colors.length]!);
      grid = after;
      const now = grid.filter(Boolean).length;
      if (drained > 0 || now < remaining) sinceProgress = 0;
      else sinceProgress++;
      remaining = now;
      // Stuck on this color for a while → switch, like a player would.
      if (sinceProgress > 400) {
        ci++;
        sinceProgress = 0;
      }
    }
    expect(remaining).toBe(0);
    expect(isCleared(grid)).toBe(true);
  }, 30_000);
});

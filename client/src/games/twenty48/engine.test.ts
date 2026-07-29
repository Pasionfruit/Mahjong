import { describe, expect, it } from 'vitest';
import { SIZE, applyDirection, slideLine, twenty48Module } from './engine';

describe('slideLine', () => {
  it('slides tiles together, leaving gaps at the end', () => {
    expect(slideLine([2, null, 4, null])).toEqual({ line: [2, 4, null, null], gained: 0 });
  });

  it('merges one adjacent equal pair, doubling the value', () => {
    expect(slideLine([2, 2, null, null])).toEqual({ line: [4, null, null, null], gained: 4 });
  });

  it('merges each pair once — four equal tiles become two, not one', () => {
    expect(slideLine([2, 2, 2, 2])).toEqual({ line: [4, 4, null, null], gained: 8 });
  });

  it('does not chain a freshly-merged tile into a second merge in the same move', () => {
    // 2 2 4 -> merges the two 2s into 4, but that new 4 does NOT then merge
    // with the original 4 beside it (classic 2048 rule: one merge per tile per move).
    expect(slideLine([2, 2, 4, null])).toEqual({ line: [4, 4, null, null], gained: 4 });
  });
});

describe('applyDirection', () => {
  it('moves and merges an entire row leftward', () => {
    const grid = new Array(16).fill(null);
    grid[0] = 2;
    grid[1] = 2;
    grid[2] = 4;
    grid[3] = 4;
    const { grid: next, gained, changed } = applyDirection(grid, 'left');
    expect(next.slice(0, 4)).toEqual([4, 8, null, null]);
    expect(gained).toBe(12);
    expect(changed).toBe(true);
  });

  it('reports unchanged when a move has no effect', () => {
    const grid = new Array(16).fill(null);
    grid[0] = 2;
    grid[1] = 4;
    grid[2] = 8;
    grid[3] = 16;
    const { changed } = applyDirection(grid, 'left');
    expect(changed).toBe(false);
  });

  it('moves a column upward', () => {
    const grid = new Array(16).fill(null);
    grid[4] = 2; // row1,col0
    grid[12] = 2; // row3,col0
    const { grid: next } = applyDirection(grid, 'up');
    expect(next[0]).toBe(4);
    expect(next[4]).toBeNull();
    expect(next[12]).toBeNull();
  });
});

describe('twenty48Module', () => {
  it('generate deterministically spawns exactly two tiles for the same seed', () => {
    const a = twenty48Module.generate(5, undefined);
    const b = twenty48Module.generate(5, undefined);
    expect(a).toEqual(b);
    expect(a.grid.filter((v) => v !== null)).toHaveLength(2);
    expect(a.score).toBe(0);
  });

  it('rejects a move that changes nothing (illegal no-op)', () => {
    // Row 0 already packed right with no mergeable neighbors; every other
    // row is empty, so pushing right changes literally nothing anywhere.
    const grid = new Array(SIZE * SIZE).fill(null);
    grid[0] = 2;
    grid[1] = 4;
    grid[2] = 8;
    grid[3] = 16;
    const state = { grid, score: 0, rngState: 1 };
    expect(twenty48Module.applyMove(state, { dir: 'right' })).toBeNull();
  });

  it('spawns a new tile after every accepted move', () => {
    let state = twenty48Module.generate(1, undefined);
    const before = state.grid.filter((v) => v !== null).length;
    const next = twenty48Module.applyMove(state, { dir: 'left' });
    if (next) {
      const after = next.grid.filter((v) => v !== null).length;
      expect(after).toBeGreaterThanOrEqual(before);
    }
  });

  function checkerboard(): (number | null)[] {
    // True checkerboard by (row+col) parity — every neighbor, horizontal
    // AND vertical, differs, so a full board like this has zero legal
    // moves left. (Flat-index parity alone would NOT do this: with a
    // width of 4, i%2 repeats identically down every column.)
    const grid: number[] = [];
    for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) grid.push((r + c) % 2 === 0 ? 2 : 4);
    return grid;
  }

  it('status is lost only when no legal move remains in any direction', () => {
    const full = checkerboard();
    expect(twenty48Module.status({ grid: full, score: 0, rngState: 1 })).toBe('lost');
    const almostFull = full.slice();
    almostFull[0] = null;
    expect(twenty48Module.status({ grid: almostFull, score: 0, rngState: 1 })).toBe('playing');
  });

  it('result reports the running score and the highest tile once the game ends', () => {
    const grid = checkerboard();
    grid[0] = 1024;
    const state = { grid, score: 240, rngState: 1 };
    expect(twenty48Module.status(state)).toBe('lost');
    expect(twenty48Module.result(state)).toEqual({ status: 'lost', score: 240, stats: { highestTile: 1024 } });
  });

  it('replay reproduces the exact same state from a move log', () => {
    const moveLog = [{ dir: 'left' as const }, { dir: 'up' as const }, { dir: 'right' as const }];
    let state = twenty48Module.generate(3, undefined);
    for (const m of moveLog) state = twenty48Module.applyMove(state, m) ?? state;
    const replayed = twenty48Module.replay(3, undefined, moveLog);
    expect(replayed).toEqual(state);
  });
});

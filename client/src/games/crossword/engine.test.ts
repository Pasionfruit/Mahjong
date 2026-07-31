import { describe, expect, it } from 'vitest';
import { PUZZLES } from './data';
import {
  CELLS,
  SIZE,
  computeEntries,
  crosswordModule,
  isBlack,
  letterAt,
  type CrosswordMove,
  type CrosswordState,
} from './engine';

/** Moves that fill every white cell with its solution letter. */
function winningMoves(state: CrosswordState, startAt = 1000): CrosswordMove[] {
  const moves: CrosswordMove[] = [];
  let at = startAt;
  for (let i = 0; i < CELLS; i++) {
    if (!isBlack(state.solution, i)) moves.push({ cell: i, letter: letterAt(state.solution, i), at: at++ });
  }
  return moves;
}

function firstWhiteCell(state: CrosswordState): number {
  for (let i = 0; i < CELLS; i++) if (!isBlack(state.solution, i)) return i;
  throw new Error('no white cell');
}

function firstBlackCell(state: CrosswordState): number {
  for (let i = 0; i < CELLS; i++) if (isBlack(state.solution, i)) return i;
  throw new Error('no black cell');
}

describe('crossword puzzle bank validation (entire bank)', () => {
  it('has at least 14 puzzles', () => {
    expect(PUZZLES.length).toBeGreaterThanOrEqual(14);
  });

  it.each(PUZZLES.map((p, i) => [i, p] as const))('puzzle %i is well-formed', (_i, puzzle) => {
    // 5×5, only [A-Z#], all solution letters uppercase.
    expect(puzzle.grid).toHaveLength(SIZE);
    for (const row of puzzle.grid) {
      expect(row).toHaveLength(SIZE);
      expect(row).toMatch(/^[A-Z#]{5}$/);
    }

    // Every maximal run of ≥2 white cells has length ≥3 — no 2-letter words.
    for (let r = 0; r < SIZE; r++) {
      for (const run of puzzle.grid[r]!.split('#')) {
        if (run.length > 0) expect(run.length, `row ${r} run "${run}"`).not.toBe(2);
      }
    }
    for (let c = 0; c < SIZE; c++) {
      const col = puzzle.grid.map((row) => row[c]!).join('');
      for (const run of col.split('#')) {
        if (run.length > 0) expect(run.length, `col ${c} run "${run}"`).not.toBe(2);
      }
    }

    const { across, down } = computeEntries(puzzle.grid);

    // Segmentation consistency: every entry is ≥3 long, its answer matches
    // the grid letters, and every white cell is checked by an across AND a
    // down word (fully checked grids — the NYT-mini convention).
    const coveredAcross = new Set<number>();
    const coveredDown = new Set<number>();
    for (const e of across) {
      expect(e.cells.length).toBeGreaterThanOrEqual(3);
      expect(e.answer).toHaveLength(e.cells.length);
      e.cells.forEach((cell, j) => {
        expect(letterAt(puzzle.grid, cell)).toBe(e.answer[j]);
        coveredAcross.add(cell);
      });
    }
    for (const e of down) {
      expect(e.cells.length).toBeGreaterThanOrEqual(3);
      e.cells.forEach((cell, j) => {
        expect(letterAt(puzzle.grid, cell)).toBe(e.answer[j]);
        coveredDown.add(cell);
      });
    }
    for (let i = 0; i < CELLS; i++) {
      if (isBlack(puzzle.grid, i)) continue;
      expect(coveredAcross.has(i), `cell ${i} unchecked across`).toBe(true);
      expect(coveredDown.has(i), `cell ${i} unchecked down`).toBe(true);
    }

    // Computed numbering matches the authored clues exactly, 1:1, in order.
    expect(puzzle.cluesAcross.map((c) => c.num)).toEqual(across.map((e) => e.num));
    expect(puzzle.cluesDown.map((c) => c.num)).toEqual(down.map((e) => e.num));
    for (const c of [...puzzle.cluesAcross, ...puzzle.cluesDown]) {
      expect(c.clue.trim().length).toBeGreaterThan(0);
    }

    // No duplicate answers within one puzzle.
    const words = [...across, ...down].map((e) => e.answer);
    expect(new Set(words).size).toBe(words.length);
  });
});

describe('crossword module', () => {
  it('generate is deterministic and picks bank[seed % bank.length]', () => {
    expect(crosswordModule.generate(3, undefined)).toEqual(crosswordModule.generate(3, undefined));
    const n = PUZZLES.length;
    expect(crosswordModule.generate(0, undefined).puzzle).toBe(0);
    expect(crosswordModule.generate(n + 2, undefined).puzzle).toBe(2);
    expect(crosswordModule.generate(0xffffffff, undefined).puzzle).toBe(0xffffffff % n);
  });

  it('rejects moves on black cells, bad letters, and out-of-range cells', () => {
    const state = crosswordModule.generate(0, undefined);
    const black = firstBlackCell(state);
    const white = firstWhiteCell(state);
    expect(crosswordModule.applyMove(state, { cell: black, letter: 'A', at: 1 })).toBeNull();
    expect(crosswordModule.applyMove(state, { cell: -1, letter: 'A', at: 1 })).toBeNull();
    expect(crosswordModule.applyMove(state, { cell: 25, letter: 'A', at: 1 })).toBeNull();
    expect(crosswordModule.applyMove(state, { cell: white, letter: 'a', at: 1 })).toBeNull();
    expect(crosswordModule.applyMove(state, { cell: white, letter: 'AB', at: 1 })).toBeNull();
    expect(crosswordModule.applyMove(state, { cell: white, letter: '', at: 1 })).toBeNull(); // already empty
  });

  it('sets and erases letters; wrong letters are allowed on the board', () => {
    const state = crosswordModule.generate(0, undefined);
    const cell = firstWhiteCell(state);
    const set = crosswordModule.applyMove(state, { cell, letter: 'Q', at: 10 })!;
    expect(set.letters[cell]).toBe('Q');
    const erased = crosswordModule.applyMove(set, { cell, letter: '', at: 20 })!;
    expect(erased.letters[cell]).toBe('');
    expect(erased.lastMoveAt).toBe(20);
  });

  it('detects the win when every white cell matches the solution', () => {
    const state = crosswordModule.generate(1, undefined);
    expect(crosswordModule.status(state)).toBe('playing');
    expect(crosswordModule.result(state)).toBeNull();
    let s = state;
    for (const m of winningMoves(state)) s = crosswordModule.applyMove(s, m) ?? s;
    expect(crosswordModule.status(s)).toBe('won');
    const res = crosswordModule.result(s);
    expect(res?.status).toBe('won');
    expect(res?.stats?.puzzle).toBe(state.puzzle);
  });

  it('scores elapsed time between first and last move, ascending-friendly', () => {
    const state = crosswordModule.generate(2, undefined);
    const moves = winningMoves(state, 7000);
    let s = state;
    for (const m of moves) s = crosswordModule.applyMove(s, m) ?? s;
    expect(s.firstMoveAt).toBe(7000);
    expect(s.lastMoveAt).toBe(7000 + moves.length - 1);
    expect(crosswordModule.result(s)?.score).toBe(moves.length - 1);
    expect(crosswordModule.scoreDirection).toBe('asc');
  });

  it('rejects moves after the win', () => {
    const state = crosswordModule.generate(1, undefined);
    let s = state;
    for (const m of winningMoves(state)) s = crosswordModule.applyMove(s, m) ?? s;
    expect(crosswordModule.applyMove(s, { cell: firstWhiteCell(state), letter: '', at: 99999 })).toBeNull();
  });

  it('replay reproduces the live state exactly, skipping illegal moves', () => {
    const seed = 20260731;
    const state = crosswordModule.generate(seed, undefined);
    const white = firstWhiteCell(state);
    const black = firstBlackCell(state);
    const log: CrosswordMove[] = [
      { cell: white, letter: 'X', at: 100 },
      { cell: black, letter: 'A', at: 150 }, // illegal — must be skipped
      { cell: white, letter: '', at: 200 },
      { cell: white, letter: letterAt(state.solution, white), at: 300 },
    ];
    let live = state;
    for (const m of log) live = crosswordModule.applyMove(live, m) ?? live;
    expect(crosswordModule.replay(seed, undefined, log)).toEqual(live);
  });
});

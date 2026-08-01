import { describe, expect, it } from 'vitest';
import { CELLS, DAILY_REMOVE_TARGET, REMOVE_TARGET, boxOf, colOf, countSolutions, rowOf, sudokuModule, type SudokuMove, type SudokuState } from './engine';

/** Every empty cell filled with the known solution — the fastest scripted win. */
function winningMoves(state: SudokuState, startAt = 1000): SudokuMove[] {
  const moves: SudokuMove[] = [];
  let at = startAt;
  for (let i = 0; i < CELLS; i++) {
    if (state.givens[i] === 0) moves.push({ type: 'set', cell: i, value: state.solution[i]!, at: at++ });
  }
  return moves;
}

function firstEmptyCell(state: SudokuState): number {
  const idx = state.givens.findIndex((g) => g === 0);
  if (idx < 0) throw new Error('no empty cell');
  return idx;
}

/** A digit that is wrong for `cell` (differs from the solution). */
function wrongValueFor(state: SudokuState, cell: number): number {
  const right = state.solution[cell]!;
  return right === 1 ? 2 : 1;
}

describe('sudoku generation', () => {
  it('is deterministic — the same seed yields the exact same puzzle', () => {
    const a = sudokuModule.generate(12345, undefined);
    const b = sudokuModule.generate(12345, undefined);
    expect(a).toEqual(b);
  });

  it('different seeds yield different puzzles', () => {
    const a = sudokuModule.generate(1, undefined);
    const b = sudokuModule.generate(2, undefined);
    expect(a.givens).not.toEqual(b.givens);
  });

  it('the solution is a valid completed sudoku consistent with the givens', () => {
    const { solution, givens } = sudokuModule.generate(777, undefined);
    expect(solution).toHaveLength(CELLS);
    for (let unit = 0; unit < 9; unit++) {
      const row = new Set<number>();
      const col = new Set<number>();
      const box = new Set<number>();
      for (let i = 0; i < CELLS; i++) {
        if (rowOf(i) === unit) row.add(solution[i]!);
        if (colOf(i) === unit) col.add(solution[i]!);
        if (boxOf(i) === unit) box.add(solution[i]!);
      }
      expect(row.size).toBe(9);
      expect(col.size).toBe(9);
      expect(box.size).toBe(9);
    }
    for (let i = 0; i < CELLS; i++) {
      if (givens[i]! !== 0) expect(givens[i]).toBe(solution[i]);
    }
  });

  it('removes ~REMOVE_TARGET cells (medium difficulty)', () => {
    for (const seed of [1, 42, 999]) {
      const { givens } = sudokuModule.generate(seed, undefined);
      const blanks = givens.filter((g) => g === 0).length;
      expect(blanks).toBeGreaterThanOrEqual(40);
      expect(blanks).toBeLessThanOrEqual(REMOVE_TARGET);
    }
  });

  it('generated puzzles have exactly one solution (counting solver)', () => {
    for (const seed of [7, 314159]) {
      const { givens } = sudokuModule.generate(seed, undefined);
      expect(countSolutions(givens, 2)).toBe(1);
    }
  });
});

describe('sudoku moves', () => {
  it('rejects moves on given cells and out-of-range moves', () => {
    const state = sudokuModule.generate(5, undefined);
    const givenCell = state.givens.findIndex((g) => g !== 0);
    expect(sudokuModule.applyMove(state, { type: 'set', cell: givenCell, value: 5, at: 1 })).toBeNull();
    expect(sudokuModule.applyMove(state, { type: 'clear', cell: givenCell, at: 1 })).toBeNull();
    expect(sudokuModule.applyMove(state, { type: 'set', cell: -1, value: 5, at: 1 })).toBeNull();
    expect(sudokuModule.applyMove(state, { type: 'set', cell: 81, value: 5, at: 1 })).toBeNull();
    const empty = firstEmptyCell(state);
    expect(sudokuModule.applyMove(state, { type: 'set', cell: empty, value: 0, at: 1 })).toBeNull();
    expect(sudokuModule.applyMove(state, { type: 'set', cell: empty, value: 10, at: 1 })).toBeNull();
  });

  it('counts a mistake for each wrong placement, none for correct ones', () => {
    const state = sudokuModule.generate(5, undefined);
    const cell = firstEmptyCell(state);
    const wrong = wrongValueFor(state, cell);
    const afterWrong = sudokuModule.applyMove(state, { type: 'set', cell, value: wrong, at: 10 });
    expect(afterWrong).not.toBeNull();
    expect(afterWrong!.mistakes).toBe(1);
    expect(afterWrong!.entries[cell]).toBe(wrong); // wrong entries stay on the board
    const afterRight = sudokuModule.applyMove(afterWrong!, { type: 'set', cell, value: state.solution[cell]!, at: 20 });
    expect(afterRight!.mistakes).toBe(1);
    expect(afterRight!.entries[cell]).toBe(state.solution[cell]);
  });

  it('locks in a correct entry — it can no longer be set or cleared', () => {
    const state = sudokuModule.generate(5, undefined);
    const cell = firstEmptyCell(state);
    const right = sudokuModule.applyMove(state, { type: 'set', cell, value: state.solution[cell]!, at: 10 })!;
    expect(sudokuModule.applyMove(right, { type: 'set', cell, value: wrongValueFor(state, cell), at: 20 })).toBeNull();
    expect(sudokuModule.applyMove(right, { type: 'clear', cell, at: 20 })).toBeNull();
  });

  it('clear empties a wrong cell; clearing an already-empty cell is a no-op', () => {
    const state = sudokuModule.generate(5, undefined);
    const cell = firstEmptyCell(state);
    expect(sudokuModule.applyMove(state, { type: 'clear', cell, at: 5 })).toBeNull();
    const wrong = sudokuModule.applyMove(state, { type: 'set', cell, value: wrongValueFor(state, cell), at: 10 })!;
    const cleared = sudokuModule.applyMove(wrong, { type: 'clear', cell, at: 20 })!;
    expect(cleared.entries[cell]).toBe(0);
    expect(cleared.mistakes).toBe(1); // mistakes never un-count
  });
});

describe('sudoku win + timing + replay', () => {
  it('detects the win when all 81 cells match the solution', () => {
    const state = sudokuModule.generate(9, undefined);
    expect(sudokuModule.status(state)).toBe('playing');
    expect(sudokuModule.result(state)).toBeNull();
    let s = state;
    for (const m of winningMoves(state)) s = sudokuModule.applyMove(s, m) ?? s;
    expect(sudokuModule.status(s)).toBe('won');
    const res = sudokuModule.result(s);
    expect(res?.status).toBe('won');
    expect(res?.stats?.mistakes).toBe(0);
  });

  it('scores elapsed time between first and last move (minesweeper-style)', () => {
    const state = sudokuModule.generate(9, undefined);
    const moves = winningMoves(state, 5000);
    let s = state;
    for (const m of moves) s = sudokuModule.applyMove(s, m) ?? s;
    expect(s.firstMoveAt).toBe(5000);
    expect(s.lastMoveAt).toBe(5000 + moves.length - 1);
    expect(sudokuModule.result(s)?.score).toBe(moves.length - 1);
  });

  it('rejects further moves once won', () => {
    const state = sudokuModule.generate(9, undefined);
    let s = state;
    for (const m of winningMoves(state)) s = sudokuModule.applyMove(s, m) ?? s;
    const cell = firstEmptyCell(state);
    expect(sudokuModule.applyMove(s, { type: 'clear', cell, at: 999999 })).toBeNull();
  });

  it('replay(seed, settings, moveLog) reproduces the live state exactly', () => {
    const seed = 20260729;
    const state = sudokuModule.generate(seed, undefined);
    const c1 = firstEmptyCell(state);
    const c2 = state.givens.findIndex((g, i) => g === 0 && i > c1);
    const log: SudokuMove[] = [
      { type: 'set', cell: c1, value: wrongValueFor(state, c1), at: 100 },
      { type: 'set', cell: c2, value: state.solution[c2]!, at: 200 },
      { type: 'clear', cell: c1, at: 300 },
      { type: 'set', cell: c1, value: state.solution[c1]!, at: 400 },
      { type: 'set', cell: c1, value: 3, at: 500 }, // illegal (locked) — replay must skip it
    ];
    let live = state;
    for (const m of log) live = sudokuModule.applyMove(live, m) ?? live;
    expect(sudokuModule.replay(seed, undefined, log)).toEqual(live);
    expect(live.mistakes).toBe(1);
  });
});

describe('difficulty settings', () => {
  it('the daily removeTarget yields an easier board (more givens) than endless, still unique', () => {
    const blanks = (s: SudokuState) => s.givens.filter((g) => g === 0).length;
    for (const seed of [4242, 987, 31337]) {
      const easy = sudokuModule.generate(seed, { removeTarget: DAILY_REMOVE_TARGET });
      const medium = sudokuModule.generate(seed, undefined);
      expect(blanks(easy)).toBeLessThanOrEqual(DAILY_REMOVE_TARGET);
      expect(blanks(easy)).toBeLessThan(blanks(medium));
      expect(blanks(medium)).toBeLessThanOrEqual(REMOVE_TARGET);
      expect(countSolutions(easy.givens, 2)).toBe(1);
    }
  });

  it('replay honors the settings it was saved with', () => {
    const state = sudokuModule.generate(555, { removeTarget: DAILY_REMOVE_TARGET });
    expect(sudokuModule.replay(555, { removeTarget: DAILY_REMOVE_TARGET }, [])).toEqual(state);
  });
});

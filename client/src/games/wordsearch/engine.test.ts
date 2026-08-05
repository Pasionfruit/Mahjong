import { describe, expect, it } from 'vitest';
import { GRID_SIZE, WORDS_PER_PUZZLE, generatePuzzle, wordSearchModule } from './engine';

function cellsForWord(w: { row: number; col: number; dRow: number; dCol: number; word: string }) {
  return Array.from({ length: w.word.length }, (_, i) => ({ row: w.row + w.dRow * i, col: w.col + w.dCol * i }));
}

describe('generatePuzzle', () => {
  it('is deterministic: the same seed always yields the same puzzle', () => {
    expect(generatePuzzle(42)).toEqual(generatePuzzle(42));
  });

  it('different seeds produce different puzzles', () => {
    expect(generatePuzzle(1)).not.toEqual(generatePuzzle(2));
  });

  it('fills the whole grid with single lowercase letters', () => {
    const { grid } = generatePuzzle(7);
    expect(grid).toHaveLength(GRID_SIZE * GRID_SIZE);
    for (const cell of grid) expect(cell).toMatch(/^[a-z]$/);
  });

  it('places WORDS_PER_PUZZLE words, each spelled out correctly along its own path, in bounds', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { grid, words } = generatePuzzle(seed);
      expect(words).toHaveLength(WORDS_PER_PUZZLE);
      for (const w of words) {
        const cells = cellsForWord(w);
        for (const c of cells) {
          expect(c.row).toBeGreaterThanOrEqual(0);
          expect(c.row).toBeLessThan(GRID_SIZE);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(GRID_SIZE);
        }
        const spelled = cells.map((c) => grid[c.row * GRID_SIZE + c.col]).join('');
        expect(spelled).toBe(w.word);
      }
    }
  });

  it('never places the same word twice in one puzzle', () => {
    for (let seed = 0; seed < 25; seed++) {
      const { words } = generatePuzzle(seed);
      expect(new Set(words.map((w) => w.word)).size).toBe(words.length);
    }
  });
});

describe('wordSearchModule', () => {
  it('finds a word when the selection exactly matches its placed cells', () => {
    const state = wordSearchModule.generate(7, undefined);
    const w = state.puzzle.words[0]!;
    const endRow = w.row + w.dRow * (w.word.length - 1);
    const endCol = w.col + w.dCol * (w.word.length - 1);
    const next = wordSearchModule.applyMove(state, { startRow: w.row, startCol: w.col, endRow, endCol, at: 100 });
    expect(next?.found).toEqual([w.word]);
  });

  it('finds a word when dragged in reverse (end to start)', () => {
    const state = wordSearchModule.generate(7, undefined);
    const w = state.puzzle.words[0]!;
    const endRow = w.row + w.dRow * (w.word.length - 1);
    const endCol = w.col + w.dCol * (w.word.length - 1);
    const next = wordSearchModule.applyMove(state, { startRow: endRow, startCol: endCol, endRow: w.row, endCol: w.col, at: 100 });
    expect(next?.found).toEqual([w.word]);
  });

  it('rejects a selection that is not a straight line', () => {
    const state = wordSearchModule.generate(7, undefined);
    expect(wordSearchModule.applyMove(state, { startRow: 0, startCol: 0, endRow: 3, endCol: 5, at: 0 })).toBeNull();
  });

  it('rejects a straight-line selection matching no unfound word', () => {
    const state = wordSearchModule.generate(7, undefined);
    // A single-cell "selection" (start === end) is a straight line of
    // length 1, extremely unlikely to equal any real word's full path.
    expect(wordSearchModule.applyMove(state, { startRow: 0, startCol: 0, endRow: 0, endCol: 0, at: 0 })).toBeNull();
  });

  it('does not re-find an already-found word', () => {
    let state = wordSearchModule.generate(7, undefined);
    const w = state.puzzle.words[0]!;
    const endRow = w.row + w.dRow * (w.word.length - 1);
    const endCol = w.col + w.dCol * (w.word.length - 1);
    const move = { startRow: w.row, startCol: w.col, endRow, endCol, at: 100 };
    state = wordSearchModule.applyMove(state, move)!;
    expect(wordSearchModule.applyMove(state, move)).toBeNull();
  });

  it('reports won only once every word is found, scoring elapsed time', () => {
    let state = wordSearchModule.generate(7, undefined);
    let at = 1000;
    for (const w of state.puzzle.words) {
      const endRow = w.row + w.dRow * (w.word.length - 1);
      const endCol = w.col + w.dCol * (w.word.length - 1);
      expect(wordSearchModule.status(state)).toBe('playing');
      state = wordSearchModule.applyMove(state, { startRow: w.row, startCol: w.col, endRow, endCol, at })!;
      at += 500;
    }
    expect(wordSearchModule.status(state)).toBe('won');
    const res = wordSearchModule.result(state);
    expect(res!.status).toBe('won');
    expect(res!.score).toBeGreaterThan(0);
    expect(res!.stats!.words).toBe(state.puzzle.words.length);
  });

  it('replay reproduces the exact same state from a move log', () => {
    const state0 = wordSearchModule.generate(9, undefined);
    const w = state0.puzzle.words[0]!;
    const endRow = w.row + w.dRow * (w.word.length - 1);
    const endCol = w.col + w.dCol * (w.word.length - 1);
    const moveLog = [{ startRow: w.row, startCol: w.col, endRow, endCol, at: 50 }];
    const state = wordSearchModule.applyMove(state0, moveLog[0]!)!;
    const replayed = wordSearchModule.replay(9, undefined, moveLog);
    expect(replayed).toEqual(state);
  });
});

import { describe, expect, it } from 'vitest';
import { COLS, MINE_COUNT, ROWS, minesweeperModule } from './engine';

function reveal(state: ReturnType<typeof minesweeperModule.generate>, index: number, at = 0) {
  return minesweeperModule.applyMove(state, { type: 'reveal', index, at })!;
}
function flag(state: ReturnType<typeof minesweeperModule.generate>, index: number, at = 0) {
  return minesweeperModule.applyMove(state, { type: 'flag', index, at })!;
}

describe('minesweeperModule', () => {
  it('never places a mine on the first-clicked cell, for many seeds and click points', () => {
    for (let seed = 0; seed < 30; seed++) {
      for (const index of [0, 5, 40, 60, 80]) {
        const state = minesweeperModule.generate(seed, undefined);
        const next = reveal(state, index);
        expect(next.cells[index]!.mine).toBe(false);
      }
    }
  });

  it('places exactly MINE_COUNT mines, once, on the first reveal', () => {
    const state = minesweeperModule.generate(7, undefined);
    const next = reveal(state, 0);
    expect(next.cells.filter((c) => c.mine)).toHaveLength(MINE_COUNT);
    expect(next.minesPlaced).toBe(true);
  });

  it('is deterministic: the same seed and first click always produce the same layout', () => {
    const a = reveal(minesweeperModule.generate(42, undefined), 10);
    const b = reveal(minesweeperModule.generate(42, undefined), 10);
    expect(a.cells.map((c) => c.mine)).toEqual(b.cells.map((c) => c.mine));
  });

  it('flood-fills connected zero-adjacent cells on reveal', () => {
    // Corner click on a 9x9/10-mine board almost always opens a region
    // bigger than 1 cell; assert it's strictly more than the single click.
    const state = minesweeperModule.generate(1, undefined);
    const next = reveal(state, 0);
    const revealedCount = next.cells.filter((c) => c.revealed).length;
    expect(revealedCount).toBeGreaterThan(1);
  });

  it('reveals the mine and ends the game on a losing click', () => {
    let state = reveal(minesweeperModule.generate(7, undefined), 0);
    const mineIndex = state.cells.findIndex((c) => c.mine);
    state = reveal(state, mineIndex, 500);
    expect(minesweeperModule.status(state)).toBe('lost');
    expect(state.exploded).toBe(mineIndex);
    expect(minesweeperModule.result(state)).toEqual({
      status: 'lost',
      score: 999_999_999,
      stats: { time: 0.5, flags: 0 },
    });
  });

  it('refuses to reveal a flagged cell, and refuses to flag a revealed cell', () => {
    let state = reveal(minesweeperModule.generate(7, undefined), 40);
    const unrevealed = state.cells.findIndex((c) => !c.revealed && !c.mine);
    state = flag(state, unrevealed);
    expect(state.cells[unrevealed]!.flagged).toBe(true);
    expect(minesweeperModule.applyMove(state, { type: 'reveal', index: unrevealed, at: 0 })).toBeNull();

    const revealedIndex = state.cells.findIndex((c) => c.revealed);
    expect(minesweeperModule.applyMove(state, { type: 'flag', index: revealedIndex, at: 0 })).toBeNull();
  });

  it('wins when every non-mine cell is revealed, scoring elapsed time', () => {
    let state = reveal(minesweeperModule.generate(7, undefined), 0, 1000);
    const safeCells = state.cells.map((c, i) => (c.mine ? -1 : i)).filter((i) => i >= 0);
    for (const i of safeCells) {
      if (!state.cells[i]!.revealed) state = reveal(state, i, 4500);
    }
    expect(state.cells.filter((c) => c.mine)).toHaveLength(MINE_COUNT);
    expect(minesweeperModule.status(state)).toBe('won');
    const res = minesweeperModule.result(state);
    expect(res!.status).toBe('won');
    expect(res!.score).toBe(3500); // lastMoveAt(4500) - firstMoveAt(1000)
  });

  it('accepts no further moves once the game is over', () => {
    let state = reveal(minesweeperModule.generate(7, undefined), 0);
    const mineIndex = state.cells.findIndex((c) => c.mine);
    state = reveal(state, mineIndex);
    expect(minesweeperModule.applyMove(state, { type: 'reveal', index: 1, at: 0 })).toBeNull();
  });

  it('replay reproduces the exact same state from a move log', () => {
    const moveLog = [
      { type: 'reveal' as const, index: 0, at: 100 },
      { type: 'flag' as const, index: 80, at: 200 },
    ];
    let state = minesweeperModule.generate(9, undefined);
    for (const m of moveLog) state = minesweeperModule.applyMove(state, m)!;
    const replayed = minesweeperModule.replay(9, undefined, moveLog);
    expect(replayed).toEqual(state);
  });

  it('board dimensions match the exported constants', () => {
    const state = minesweeperModule.generate(1, undefined);
    expect(state.cells).toHaveLength(ROWS * COLS);
  });
});

import { describe, expect, it } from 'vitest';
import { SIZE, paintByNumberModule, type PaintByNumberMove, type PaintByNumberState } from './engine';

const gen = (seed: number) => paintByNumberModule.generate(seed, undefined);

function figureCells(state: PaintByNumberState): number[] {
  return state.target.map((t, i) => (t !== null ? i : -1)).filter((i) => i >= 0);
}

function backgroundCell(state: PaintByNumberState): number {
  const i = state.target.findIndex((t) => t === null);
  expect(i).toBeGreaterThanOrEqual(0);
  return i;
}

/** A wrong-but-valid palette index for the given cell. */
function wrongColor(state: PaintByNumberState, cell: number): number {
  return (state.target[cell]! + 1) % state.palette.length;
}

describe('paintByNumberModule.generate', () => {
  it('is deterministic — same seed, same page', () => {
    expect(gen(123)).toEqual(gen(123));
    expect(gen(77777)).toEqual(gen(77777));
  });

  it('different seeds give different pages', () => {
    expect(gen(1).target).not.toEqual(gen(2).target);
  });

  it('produces a 16×16 page with a 4–6 color palette and a real figure', () => {
    for (const seed of [1, 42, 999, 123456]) {
      const s = gen(seed);
      expect(s.target).toHaveLength(SIZE * SIZE);
      expect(s.painted).toHaveLength(SIZE * SIZE);
      expect(s.palette.length).toBeGreaterThanOrEqual(4);
      expect(s.palette.length).toBeLessThanOrEqual(6);
      const cells = figureCells(s);
      expect(cells.length).toBeGreaterThan(0);
      expect(cells.length).toBeLessThan(SIZE * SIZE); // background exists
      // every target index points into the palette
      for (const i of cells) {
        expect(s.target[i]!).toBeGreaterThanOrEqual(0);
        expect(s.target[i]!).toBeLessThan(s.palette.length);
      }
    }
  });

  it('the figure is vertically mirrored (target symmetric across the center)', () => {
    for (const seed of [7, 555, 90210]) {
      const s = gen(seed);
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          expect(s.target[r * SIZE + c]).toBe(s.target[r * SIZE + (SIZE - 1 - c)]);
        }
      }
    }
  });
});

describe('paintByNumberModule.applyMove', () => {
  it('rejects painting a background cell', () => {
    const s = gen(5);
    const bg = backgroundCell(s);
    expect(paintByNumberModule.applyMove(s, { cell: bg, color: 0, at: 1000 })).toBeNull();
  });

  it('rejects out-of-range cells', () => {
    const s = gen(5);
    expect(paintByNumberModule.applyMove(s, { cell: -1, color: 0, at: 1000 })).toBeNull();
    expect(paintByNumberModule.applyMove(s, { cell: SIZE * SIZE, color: 0, at: 1000 })).toBeNull();
  });

  it('a wrong color counts a mistake and does not fill the cell', () => {
    const s = gen(5);
    const cell = figureCells(s)[0]!;
    const next = paintByNumberModule.applyMove(s, { cell, color: wrongColor(s, cell), at: 1000 });
    expect(next).not.toBeNull();
    expect(next!.mistakes).toBe(1);
    expect(next!.painted[cell]).toBeNull();
    expect(next!.firstMoveAt).toBe(1000);
    expect(next!.lastMoveAt).toBe(1000);
  });

  it('the correct color fills the cell, and re-painting it returns null', () => {
    const s = gen(5);
    const cell = figureCells(s)[0]!;
    const color = s.target[cell]!;
    const next = paintByNumberModule.applyMove(s, { cell, color, at: 1000 });
    expect(next).not.toBeNull();
    expect(next!.painted[cell]).toBe(color);
    expect(next!.mistakes).toBe(0);
    // already-correctly-painted: rejected with the right AND the wrong color
    expect(paintByNumberModule.applyMove(next!, { cell, color, at: 2000 })).toBeNull();
    expect(paintByNumberModule.applyMove(next!, { cell, color: wrongColor(s, cell), at: 2000 })).toBeNull();
  });
});

describe('win + result', () => {
  function paintAll(seed: number): { state: PaintByNumberState; log: PaintByNumberMove[] } {
    let state = gen(seed);
    const log: PaintByNumberMove[] = [];
    let at = 1000;
    for (const cell of figureCells(state)) {
      const move = { cell, color: state.target[cell]!, at };
      const next = paintByNumberModule.applyMove(state, move);
      expect(next).not.toBeNull();
      state = next!;
      log.push(move);
      at += 100;
    }
    return { state, log };
  }

  it('status is won exactly when every figure cell is painted', () => {
    const { state } = paintAll(9);
    expect(paintByNumberModule.status(state)).toBe('won');
    expect(paintByNumberModule.status(gen(9))).toBe('playing');
  });

  it('result is null while playing, then a time-based ascending score with stats', () => {
    const fresh = gen(9);
    expect(paintByNumberModule.result(fresh)).toBeNull();
    const { state, log } = paintAll(9);
    const r = paintByNumberModule.result(state);
    expect(r).not.toBeNull();
    expect(r!.status).toBe('won');
    expect(r!.score).toBe(log[log.length - 1]!.at - log[0]!.at); // elapsed ms
    expect(r!.stats).toEqual({ mistakes: 0, colors: state.palette.length });
    expect(paintByNumberModule.scoreDirection).toBe('asc');
  });

  it('mistakes made along the way land in the final stats', () => {
    let state = gen(9);
    const cell = figureCells(state)[0]!;
    state = paintByNumberModule.applyMove(state, { cell, color: wrongColor(state, cell), at: 500 })!;
    let at = 1000;
    for (const c of figureCells(state)) {
      state = paintByNumberModule.applyMove(state, { cell: c, color: state.target[c]!, at })!;
      at += 10;
    }
    expect(paintByNumberModule.result(state)!.stats!['mistakes']).toBe(1);
  });

  it('replay reproduces the exact state from the move log (fills + mistakes)', () => {
    let state = gen(31);
    const cells = figureCells(state);
    const log: PaintByNumberMove[] = [
      { cell: cells[0]!, color: wrongColor(state, cells[0]!), at: 100 },
      { cell: cells[0]!, color: state.target[cells[0]!]!, at: 200 },
      { cell: cells[1]!, color: state.target[cells[1]!]!, at: 300 },
      { cell: backgroundCell(state), color: 0, at: 400 }, // illegal — ignored
      { cell: cells[2]!, color: wrongColor(state, cells[2]!), at: 500 },
    ];
    for (const m of log) state = paintByNumberModule.applyMove(state, m) ?? state;
    expect(paintByNumberModule.replay(31, undefined, log)).toEqual(state);
    expect(state.mistakes).toBe(2);
  });
});

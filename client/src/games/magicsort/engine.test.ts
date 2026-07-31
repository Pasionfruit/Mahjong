import { describe, expect, it } from 'vitest';
import { CAPACITY, EMPTY_TUBES, isSolved, magicSortModule, topRun, type MagicSortState } from './engine';

function state(tubes: number[][], colors = 4, moves = 0): MagicSortState {
  return { tubes, colors, moves };
}

/** Order-independent fingerprint — tube order never affects solvability. */
function canonical(tubes: number[][]): string {
  return tubes
    .map((t) => t.join('.'))
    .sort()
    .join('|');
}

/**
 * Memoized DFS solver over the module's own pour rules. Explores
 * matching-top pours before pours into empty tubes (pushed last onto the
 * stack, so popped first) and prunes canonical no-ops (a fully uniform tube
 * poured into an empty tube just swaps two tubes).
 */
function solvable(start: MagicSortState, nodeCap = 200000): boolean {
  const seen = new Set<string>([canonical(start.tubes)]);
  const stack: MagicSortState[] = [start];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (magicSortModule.status(cur) === 'won') return true;
    if (seen.size > nodeCap) return false;
    const emptyDest: MagicSortState[] = [];
    const matchDest: MagicSortState[] = [];
    for (let from = 0; from < cur.tubes.length; from++) {
      const src = cur.tubes[from]!;
      if (src.length === 0) continue;
      const first = src[0]!;
      const srcUniform = src.every((u) => u === first);
      for (let to = 0; to < cur.tubes.length; to++) {
        if (to === from) continue;
        const dst = cur.tubes[to]!;
        if (dst.length === 0 && srcUniform) continue; // canonical no-op
        const next = magicSortModule.applyMove(cur, { from, to });
        if (!next) continue;
        const key = canonical(next.tubes);
        if (seen.has(key)) continue;
        seen.add(key);
        (dst.length === 0 ? emptyDest : matchDest).push(next);
      }
    }
    stack.push(...emptyDest, ...matchDest);
  }
  return false;
}

describe('generate', () => {
  it('is deterministic per seed', () => {
    expect(magicSortModule.generate(42, undefined)).toEqual(magicSortModule.generate(42, undefined));
    expect(canonical(magicSortModule.generate(42, undefined).tubes)).not.toEqual(
      canonical(magicSortModule.generate(43, undefined).tubes),
    );
  });

  it('produces C colors of exactly 4 units in C+2 tubes, with C in 4..6', () => {
    for (const seed of [1, 2, 3, 99, 1234]) {
      const s = magicSortModule.generate(seed, undefined);
      expect(s.colors).toBeGreaterThanOrEqual(4);
      expect(s.colors).toBeLessThanOrEqual(6);
      expect(s.tubes).toHaveLength(s.colors + EMPTY_TUBES);
      const counts = new Map<number, number>();
      for (const tube of s.tubes) {
        expect(tube.length).toBeLessThanOrEqual(CAPACITY);
        for (const unit of tube) counts.set(unit, (counts.get(unit) ?? 0) + 1);
      }
      expect(counts.size).toBe(s.colors);
      for (const n of counts.values()) expect(n).toBe(CAPACITY);
      expect(s.moves).toBe(0);
    }
  });

  it('never hands out an already-solved scramble', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      const s = magicSortModule.generate(seed, undefined);
      expect(isSolved(s.tubes)).toBe(false);
      expect(magicSortModule.status(s)).toBe('playing');
    }
  });
});

describe('applyMove (pour rules)', () => {
  it('rejects pours onto a non-matching, non-empty top', () => {
    const s = state([[0, 1], [2, 3], [], []]);
    expect(magicSortModule.applyMove(s, { from: 0, to: 1 })).toBeNull();
  });

  it('pours the maximal run of the top color onto a matching top', () => {
    const s = state([[0, 1, 1], [1], [], []]);
    const next = magicSortModule.applyMove(s, { from: 0, to: 1 });
    expect(next?.tubes[0]).toEqual([0]);
    expect(next?.tubes[1]).toEqual([1, 1, 1]);
    expect(next?.moves).toBe(1);
  });

  it('caps the poured run at the destination free space', () => {
    const s = state([[1, 1, 1], [0, 1], [], []]);
    const next = magicSortModule.applyMove(s, { from: 0, to: 1 });
    expect(next?.tubes[0]).toEqual([1]); // only 2 of the 3-run fit
    expect(next?.tubes[1]).toEqual([0, 1, 1, 1]);
    expect(next?.tubes[1]).toHaveLength(CAPACITY);
  });

  it('allows pouring anything into an empty tube', () => {
    const s = state([[0, 2, 2], [1], [], []]);
    const next = magicSortModule.applyMove(s, { from: 0, to: 2 });
    expect(next?.tubes[0]).toEqual([0]);
    expect(next?.tubes[2]).toEqual([2, 2]);
  });

  it('rejects empty sources, full destinations, self-pours, and bad indices', () => {
    const s = state([[0], [1, 1, 1, 1], [], []]);
    expect(magicSortModule.applyMove(s, { from: 2, to: 0 })).toBeNull(); // empty source
    expect(magicSortModule.applyMove(s, { from: 0, to: 1 })).toBeNull(); // full destination
    expect(magicSortModule.applyMove(s, { from: 0, to: 0 })).toBeNull(); // self
    expect(magicSortModule.applyMove(s, { from: 0, to: 9 })).toBeNull(); // out of range
    expect(magicSortModule.applyMove(s, { from: -1, to: 2 })).toBeNull();
  });

  it('does not mutate the input state', () => {
    const s = state([[0, 1, 1], [1], [], []]);
    const before = JSON.stringify(s);
    magicSortModule.applyMove(s, { from: 0, to: 1 });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('win detection', () => {
  it('is won when every tube is empty or uniform-full', () => {
    const won = state([[0, 0, 0, 0], [1, 1, 1, 1], [], []], 2, 17);
    expect(magicSortModule.status(won)).toBe('won');
    expect(magicSortModule.result(won)).toEqual({
      status: 'won',
      score: 17,
      stats: { colors: 2, moves: 17 },
    });
  });

  it('is still playing while any tube is mixed or partial', () => {
    const playing = state([[0, 0, 0], [1, 1, 1, 1], [0], []]);
    expect(magicSortModule.status(playing)).toBe('playing');
    expect(magicSortModule.result(playing)).toBeNull();
  });

  it('rejects moves after the puzzle is solved', () => {
    const won = state([[0, 0, 0, 0], [1, 1, 1, 1], [], []], 2, 5);
    expect(magicSortModule.applyMove(won, { from: 0, to: 2 })).toBeNull();
  });

  it('the winning pour completes the run', () => {
    const s = state([[0, 0, 0], [1, 1, 1, 1], [0], []], 2, 3);
    const next = magicSortModule.applyMove(s, { from: 2, to: 0 });
    expect(next).not.toBeNull();
    expect(magicSortModule.status(next!)).toBe('won');
    expect(magicSortModule.result(next!)?.score).toBe(4);
  });
});

describe('replay', () => {
  it('reproduces the exact state from a move log', () => {
    const seed = 77;
    let s = magicSortModule.generate(seed, undefined);
    const log: { from: number; to: number }[] = [];
    // Walk a handful of legal moves found by scanning pairs.
    outer: for (let step = 0; step < 6; step++) {
      for (let from = 0; from < s.tubes.length; from++) {
        for (let to = 0; to < s.tubes.length; to++) {
          const next = magicSortModule.applyMove(s, { from, to });
          if (next) {
            s = next;
            log.push({ from, to });
            continue outer;
          }
        }
      }
      break;
    }
    expect(log.length).toBeGreaterThan(0);
    expect(magicSortModule.replay(seed, undefined, log)).toEqual(s);
  });

  it('skips illegal moves in the log without derailing', () => {
    const seed = 5;
    const fresh = magicSortModule.generate(seed, undefined);
    expect(magicSortModule.replay(seed, undefined, [{ from: 0, to: 0 }])).toEqual(fresh);
  });
});

describe('solvability (scramble-from-solved guarantee)', () => {
  it('a hand-built near-solved puzzle is solvable', () => {
    expect(solvable(state([[0, 0, 0], [1, 1, 1, 1], [0], []], 2))).toBe(true);
  });

  it('a classically dead puzzle is reported unsolvable', () => {
    // Two tubes, alternating colors, zero empties: no legal pour exists.
    expect(solvable(state([[0, 1, 0, 1], [1, 0, 1, 0]], 2))).toBe(false);
  });

  it('generated puzzles are solvable (DFS proof, several seeds)', () => {
    for (const seed of [7, 1234, 987654]) {
      const s = magicSortModule.generate(seed, undefined);
      expect(solvable(s), `seed ${seed} should be solvable`).toBe(true);
    }
  });
});

describe('module metadata', () => {
  it('scores ascending under the right id', () => {
    expect(magicSortModule.id).toBe('magicsort');
    expect(magicSortModule.scoreDirection).toBe('asc');
  });

  it('topRun counts the top same-color run', () => {
    expect(topRun([])).toBe(0);
    expect(topRun([0, 1, 1])).toBe(2);
    expect(topRun([2, 2, 2, 2])).toBe(4);
  });
});

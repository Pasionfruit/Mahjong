import { describe, expect, it } from 'vitest';
import {
  applyMove,
  cloneState,
  distanceToGoal,
  forceWall,
  isMoveLegal,
  legalMoves,
  newGame,
  type Move,
  type QuoridorState,
} from '../engine';
import { easyMove } from './easy';
import { chooseAiMove } from './chooser';
import { evaluate, positionKey, searchBestMove } from './search';
import { goalDistanceField } from '../engine';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Play `plies` random legal moves (pawn-biased) to reach a mid-game position. */
function randomPosition(rng: () => number, plies: number): QuoridorState {
  const s = newGame();
  for (let i = 0; i < plies && s.winner === null; i++) {
    const moves = legalMoves(s);
    const pawns = moves.filter((m) => m.t === 'pawn');
    const pick =
      rng() < 0.6 && pawns.length > 0
        ? pawns[(rng() * pawns.length) | 0]!
        : moves[(rng() * moves.length) | 0]!;
    applyMove(s, pick);
  }
  return s;
}

describe('ai legality (the AI never performs an illegal action)', () => {
  it('easy: 300 random positions', () => {
    const rng = mulberry32(11);
    for (let i = 0; i < 300; i++) {
      const s = randomPosition(rng, (rng() * 30) | 0);
      if (s.winner !== null) continue;
      const move = easyMove(s, rng);
      expect(isMoveLegal(s, move)).toBe(true);
    }
  });

  it('medium: 40 random positions', () => {
    const rng = mulberry32(22);
    for (let i = 0; i < 40; i++) {
      const s = randomPosition(rng, (rng() * 30) | 0);
      if (s.winner !== null) continue;
      expect(isMoveLegal(s, chooseAiMove(s, 'medium'))).toBe(true);
    }
  });

  it('hard (reduced budget): 25 random positions', () => {
    const rng = mulberry32(33);
    for (let i = 0; i < 25; i++) {
      const s = randomPosition(rng, (rng() * 40) | 0);
      if (s.winner !== null) continue;
      const { move } = searchBestMove(s, { maxDepth: 3, timeBudgetMs: 60 });
      expect(isMoveLegal(s, move)).toBe(true);
    }
  });
});

describe('search tactics', () => {
  it('takes a win in one', () => {
    const s = newGame();
    s.pawns[0] = { r: 7, c: 2 };
    s.pawns[1] = { r: 4, c: 8 };
    const { move, score } = searchBestMove(s, { maxDepth: 3, timeBudgetMs: 200 });
    expect(move).toEqual({ t: 'pawn', to: { r: 8, c: 2 } });
    expect(score).toBeGreaterThan(50_000);
  });

  it('walls off an opponent about to win', () => {
    const s = newGame();
    s.pawns[0] = { r: 2, c: 4 }; // me: 6 steps out
    s.pawns[1] = { r: 1, c: 0 }; // opponent: one step from row 0
    const { move } = searchBestMove(s, { maxDepth: 3, timeBudgetMs: 400 });
    expect(move.t).toBe('wall');
    const clone = cloneState(s);
    applyMove(clone, move);
    expect(distanceToGoal(clone, 1)).toBeGreaterThan(1);
  });

  it('wins the pure race it can win (walls exhausted)', () => {
    const s = newGame();
    s.wallsLeft = [0, 0];
    s.pawns[0] = { r: 5, c: 4 }; // 3 from goal, my move
    s.pawns[1] = { r: 4, c: 0 }; // 4 from goal
    const res = searchBestMove(s, { maxDepth: 9, timeBudgetMs: 500 });
    expect(res.score).toBeGreaterThan(50_000); // sees the forced win
    expect(res.move).toEqual({ t: 'pawn', to: { r: 6, c: 4 } });
  });

  it('evaluate: distance difference dominates and race term flips with tempo', () => {
    const s = newGame();
    const f0 = goalDistanceField(s, 0);
    const f1 = goalDistanceField(s, 1);
    expect(Math.abs(evaluate(s, f0, f1))).toBeLessThan(200); // symmetric start
    s.pawns[0] = { r: 6, c: 4 };
    const f0b = goalDistanceField(s, 0);
    expect(evaluate(s, f0b, f1)).toBeGreaterThan(400); // mover well ahead
  });

  it('respects its time budget', () => {
    const s = newGame();
    const t0 = performance.now();
    const res = searchBestMove(s, { maxDepth: 5, timeBudgetMs: 850 });
    const elapsed = performance.now() - t0;
    expect(elapsed).toBeLessThan(2_000); // generous CI margin over the 850ms budget
    expect(res.depth).toBeGreaterThanOrEqual(3);
  });
});

describe('zobrist / transposition safety', () => {
  it('same board with a different walls-remaining split hashes differently', () => {
    const a = newGame();
    forceWall(a, 4, 4, 'h');
    forceWall(a, 2, 2, 'v');
    a.wallsLeft = [8, 10];
    const b = cloneState(a);
    b.wallsLeft = [9, 9];
    expect(positionKey(a)).not.toBe(positionKey(b));
  });

  it('key is insensitive to history and identical for identical positions', () => {
    const a = newGame();
    const b = newGame();
    b.history.push({ player: 0, move: { t: 'pawn', to: { r: 1, c: 4 } }, from: { r: 0, c: 4 } });
    expect(positionKey(a)).toBe(positionKey(b));
  });
});

describe('relative strength', () => {
  it('a shallow search beats the easy bot from both seats', () => {
    // Deterministic seeds; search plays as each seat once.
    for (const searchSeat of [0, 1] as const) {
      const rng = mulberry32(searchSeat === 0 ? 71 : 72);
      const s = newGame();
      let plies = 0;
      while (s.winner === null && plies < 300) {
        let move: Move;
        if (s.turn === searchSeat) {
          move = searchBestMove(s, { maxDepth: 3, timeBudgetMs: 80 }).move;
        } else {
          move = easyMove(s, rng);
        }
        expect(applyMove(s, move)).toBe(true);
        plies++;
      }
      expect(s.winner).toBe(searchSeat);
    }
  });
});

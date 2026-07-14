import { describe, expect, it } from 'vitest';
import {
  applyMove,
  cloneState,
  distanceToGoal,
  legalMoves,
  newGame,
  pawnMoves,
  type QuoridorState,
} from './engine';
import { searchBestMove } from './ai/search';

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

describe('search internals', () => {
  it('incremental zobrist never drifts during deep searches', () => {
    (globalThis as { __QUOR_HASH_CHECK__?: boolean }).__QUOR_HASH_CHECK__ = true;
    try {
      const rng = mulberry32(5150);
      for (let i = 0; i < 15; i++) {
        const s = randomPosition(rng, (rng() * 35) | 0);
        if (s.winner !== null) continue;
        searchBestMove(s, { maxDepth: 4, timeBudgetMs: 400 });
      }
    } finally {
      (globalThis as { __QUOR_HASH_CHECK__?: boolean }).__QUOR_HASH_CHECK__ = false;
    }
  });

  it('never blunders into an immediate opponent win when avoidable (depth>=2)', () => {
    const rng = mulberry32(8675309);
    let tested = 0;
    for (let i = 0; i < 250 && tested < 60; i++) {
      const s = randomPosition(rng, 10 + ((rng() * 30) | 0));
      if (s.winner !== null) continue;
      const opp = (1 - s.turn) as 0 | 1;
      // Consider positions where after ANY mover reply the opponent could win in 1
      // unless the mover prevents it. Oracle: exhaustive 2-ply minimax on "does
      // opponent win next move".
      const moves = legalMoves(s);
      const oppGoal = opp === 0 ? 8 : 0;
      const loses = (st: QuoridorState) =>
        pawnMoves(st, opp).some((p) => p.r === oppGoal);
      let existsSafe = false;
      let existsWinNow = false;
      const myGoal = s.turn === 0 ? 8 : 0;
      for (const m of moves) {
        if (m.t === 'pawn' && m.to.r === myGoal) existsWinNow = true;
        const c = cloneState(s);
        applyMove(c, m);
        if (c.winner === s.turn || !loses(c)) existsSafe = true;
        if (existsSafe && existsWinNow) break;
      }
      const threatened = distanceToGoal(s, opp) === 1;
      if (!threatened || (!existsSafe && !existsWinNow)) continue;
      tested++;
      const { move } = searchBestMove(s, { maxDepth: 3, timeBudgetMs: 300 });
      const c = cloneState(s);
      expect(applyMove(c, move)).toBe(true);
      if (c.winner === s.turn) continue; // won immediately — fine
      // Search must have avoided handing over a win-in-1 when a safe reply existed.
      if (existsSafe) {
        expect(loses(c)).toBe(false);
      }
    }
    expect(tested).toBeGreaterThan(10);
  });
});

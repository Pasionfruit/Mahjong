import {
  cellIndex,
  checkWall,
  goalDistanceField,
  pawnMoves,
  WGRID,
  type Move,
  type QuoridorState,
} from '@shared/quoridor';

/**
 * Easy: no lookahead. Mostly shuffles along its shortest path, sometimes
 * wanders, and only rarely spends a wall (on a random legal slot). Beginners
 * should beat it consistently.
 */
export function easyMove(s: QuoridorState, rng: () => number = Math.random): Move {
  const moves = pawnMoves(s, s.turn);
  const roll = rng();

  if (roll < 0.08 && s.wallsLeft[s.turn]! > 0) {
    // A whim of a wall: try a handful of random slots, keep the first legal.
    for (let tries = 0; tries < 12; tries++) {
      const r = (rng() * WGRID) | 0;
      const c = (rng() * WGRID) | 0;
      const o = rng() < 0.5 ? 'h' : 'v';
      if (checkWall(s, s.turn, r, c, o).ok) return { t: 'wall', r, c, o };
    }
  }

  if (roll < 0.78 || moves.length === 1) {
    // Follow the shortest path: pick the pawn move that shrinks distance most.
    const field = goalDistanceField(s, s.turn);
    let best = moves[0]!;
    let bestD = Infinity;
    for (const to of moves) {
      const d = field[cellIndex(to.r, to.c)]!;
      const dd = d === -1 ? 99 : d;
      if (dd < bestD || (dd === bestD && rng() < 0.5)) {
        best = to;
        bestD = dd;
      }
    }
    return { t: 'pawn', to: best };
  }

  return { t: 'pawn', to: moves[(rng() * moves.length) | 0]! };
}

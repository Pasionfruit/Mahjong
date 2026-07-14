import { DIRS, canStep, inBoard } from './board';
import type { PlayerIndex, Pos, QuoridorState } from './types';

/**
 * All legal pawn destinations for `player`, per official (Gigamic) rules:
 *
 * - One orthogonal step onto an empty square, if no wall blocks it.
 * - If the adjacent square holds the opponent (and no wall separates them),
 *   the straight jump over them is legal when the square behind the opponent
 *   is on the board and not walled off.
 * - When that straight jump is impossible (wall behind, or board edge behind),
 *   the two diagonal squares beside the opponent become legal instead — each
 *   subject to its own board-bounds and wall checks.
 * - Diagonals are never legal while the straight jump is available, and no
 *   jump interaction exists at all if a wall separates the two pawns.
 */
export function pawnMoves(s: QuoridorState, player: PlayerIndex): Pos[] {
  const me = s.pawns[player];
  const opp = s.pawns[1 - player]!;
  const out: Pos[] = [];

  for (const [dr, dc] of DIRS) {
    if (!canStep(s, me.r, me.c, dr, dc)) continue;
    const tr = me.r + dr;
    const tc = me.c + dc;

    if (tr !== opp.r || tc !== opp.c) {
      out.push({ r: tr, c: tc });
      continue;
    }

    // Opponent directly ahead and reachable: try the straight jump.
    const jr = tr + dr;
    const jc = tc + dc;
    if (inBoard(jr, jc) && canStep(s, tr, tc, dr, dc)) {
      out.push({ r: jr, c: jc });
      continue;
    }

    // Straight jump blocked (wall or board edge): the two side-steps around
    // the opponent, measured from the opponent's square.
    const [pr, pc] = dr !== 0 ? [0, 1] : [1, 0];
    for (const sign of [1, -1]) {
      const sr = tr + pr * sign;
      const sc = tc + pc * sign;
      if (!inBoard(sr, sc)) continue;
      if (!canStep(s, tr, tc, pr * sign, pc * sign)) continue;
      // The mover's own square is behind the opponent, never beside it, so
      // the diagonal target cannot be occupied.
      out.push({ r: sr, c: sc });
    }
  }
  return out;
}

export function isPawnMoveLegal(s: QuoridorState, player: PlayerIndex, to: Pos): boolean {
  return pawnMoves(s, player).some((p) => p.r === to.r && p.c === to.c);
}

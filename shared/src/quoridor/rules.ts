import { WGRID, goalRow } from './board';
import { pawnMoves } from './moves';
import { hasPathToGoal } from './path';
import { setWall, wallCouldBlockPath, wallGeometryCheck } from './walls';
import type { Move, Orientation, PlayerIndex, QuoridorState, WallCheck } from './types';

/**
 * Full wall legality for the given player: geometry, wall stock, and the
 * golden rule — after placement BOTH players must still have some path to
 * their goal row.
 */
export function checkWall(
  s: QuoridorState,
  player: PlayerIndex,
  r: number,
  c: number,
  o: Orientation,
): WallCheck {
  if (s.wallsLeft[player] <= 0) return { ok: false, reason: 'no-walls-left' };
  const geo = wallGeometryCheck(s, r, c, o);
  if (!geo.ok) return geo;
  // Cheap necessary condition first; only anchored walls can sever a path.
  if (!wallCouldBlockPath(s, r, c, o)) return { ok: true };
  setWall(s, r, c, o, true);
  const blocks = !hasPathToGoal(s, 0) || !hasPathToGoal(s, 1);
  setWall(s, r, c, o, false);
  return blocks ? { ok: false, reason: 'blocks-path' } : { ok: true };
}

/** Every legal move for the player to move. Empty once the game is over. */
export function legalMoves(s: QuoridorState): Move[] {
  if (s.winner !== null) return [];
  const player = s.turn;
  const out: Move[] = pawnMoves(s, player).map((to) => ({ t: 'pawn', to }));
  if (s.wallsLeft[player] > 0) {
    for (let r = 0; r < WGRID; r++) {
      for (let c = 0; c < WGRID; c++) {
        for (const o of ['h', 'v'] as const) {
          if (checkWall(s, player, r, c, o).ok) out.push({ t: 'wall', r, c, o });
        }
      }
    }
  }
  return out;
}

export function isMoveLegal(s: QuoridorState, move: Move): boolean {
  if (s.winner !== null) return false;
  if (move.t === 'pawn') {
    return pawnMoves(s, s.turn).some((p) => p.r === move.to.r && p.c === move.to.c);
  }
  return checkWall(s, s.turn, move.r, move.c, move.o).ok;
}

/** Winner test for a pawn that just landed on `r`. */
export function reachedGoal(player: PlayerIndex, r: number): boolean {
  return r === goalRow(player);
}

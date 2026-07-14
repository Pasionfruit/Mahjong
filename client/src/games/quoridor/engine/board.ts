import type { PlayerIndex, Pos, QuoridorState } from './types';

/** Playable grid is SIZE×SIZE; the wall grid between cells is WGRID×WGRID. */
export const SIZE = 9;
export const WGRID = 8;
export const WALLS_PER_PLAYER = 10;

export const cellIndex = (r: number, c: number): number => r * SIZE + c;
export const wallIndex = (r: number, c: number): number => r * WGRID + c;

export const inBoard = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE;
export const inWallGrid = (r: number, c: number): boolean =>
  r >= 0 && r < WGRID && c >= 0 && c < WGRID;

/** The row a player wins by reaching (opposite their start). */
export const goalRow = (player: PlayerIndex): number => (player === 0 ? SIZE - 1 : 0);

export const startPos = (player: PlayerIndex): Pos =>
  player === 0 ? { r: 0, c: (SIZE - 1) >> 1 } : { r: SIZE - 1, c: (SIZE - 1) >> 1 };

/** Orthogonal step vectors: down, up, right, left. */
export const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const hAt = (s: QuoridorState, r: number, c: number): boolean =>
  inWallGrid(r, c) && s.hWalls[wallIndex(r, c)] === 1;
const vAt = (s: QuoridorState, r: number, c: number): boolean =>
  inWallGrid(r, c) && s.vWalls[wallIndex(r, c)] === 1;

/**
 * Can a pawn step one square from (r,c) by (dr,dc)? Checks board bounds and
 * wall blocking only — pawn occupancy is the move generator's concern.
 */
export function canStep(s: QuoridorState, r: number, c: number, dr: number, dc: number): boolean {
  const nr = r + dr;
  const nc = c + dc;
  if (!inBoard(nr, nc)) return false;
  if (dr !== 0) {
    // Crossing the horizontal boundary above row max(r, nr).
    const br = Math.min(r, nr);
    return !hAt(s, br, c - 1) && !hAt(s, br, c);
  }
  // Crossing the vertical boundary left of column max(c, nc).
  const bc = Math.min(c, nc);
  return !vAt(s, r - 1, bc) && !vAt(s, r, bc);
}

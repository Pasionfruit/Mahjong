/** Quoridor engine types. Pure data — no DOM, no React (worker/test friendly). */

export type PlayerIndex = 0 | 1;

/** Wall orientation: horizontal walls block vertical movement and vice versa. */
export type Orientation = 'h' | 'v';

/** A board cell. Row 0 is the top row; player 0 starts there and races down. */
export interface Pos {
  r: number;
  c: number;
}

/**
 * A wall, addressed by the top-left cell of the 2×2 cell block it touches
 * (both coordinates 0..7). A horizontal wall at (r,c) lies between rows r and
 * r+1, spanning columns c and c+1. A vertical wall at (r,c) lies between
 * columns c and c+1, spanning rows r and r+1.
 */
export interface WallPos {
  r: number;
  c: number;
  o: Orientation;
}

export type Move = { t: 'pawn'; to: Pos } | { t: 'wall'; r: number; c: number; o: Orientation };

/** One applied move plus what undo needs to restore. */
export interface HistoryEntry {
  player: PlayerIndex;
  move: Move;
  /** Pawn moves: where the pawn came from. */
  from?: Pos;
}

export interface QuoridorState {
  /** pawns[0] races from row 0 to row 8; pawns[1] from row 8 to row 0. */
  pawns: [Pos, Pos];
  /** 8×8 grids, index r*8+c — see {@link WallPos} for geometry. */
  hWalls: Uint8Array;
  vWalls: Uint8Array;
  wallsLeft: [number, number];
  turn: PlayerIndex;
  winner: PlayerIndex | null;
  history: HistoryEntry[];
}

export type WallIllegalReason = 'bounds' | 'overlap' | 'cross' | 'no-walls-left' | 'blocks-path';

export type WallCheck = { ok: true } | { ok: false; reason: WallIllegalReason };

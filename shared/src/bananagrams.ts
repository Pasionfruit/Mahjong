import type { ThemeId } from './settings';

/**
 * Bananagrams: a real-time word race. Everyone builds a private crossword
 * from their own tiles; using your last tile "peels" one new tile to every
 * player, and when the bunch can't cover a peel the first player with a
 * finished (connected, all-valid) grid calls "Bananas!" and wins. Fully
 * server-authoritative: the server owns the bunch, every placement, and
 * word validation against its dictionary — clients only render.
 */

export const BANANAGRAMS_MIN_PLAYERS = 2;
export const BANANAGRAMS_MAX_PLAYERS = 8;

/** Personal build area — 23×23 comfortably fits a 21-tile start plus peels. */
export const BG_SIZE = 23;

/** Cell key helper shared by server packing and client rendering. */
export function bgCellKey(x: number, y: number): number {
  return y * BG_SIZE + x;
}

/** The official 144-tile letter distribution. */
export const BG_LETTER_COUNTS: Record<string, number> = {
  A: 13, B: 3, C: 3, D: 6, E: 18, F: 3, G: 4, H: 3, I: 12, J: 2, K: 2, L: 5, M: 3,
  N: 8, O: 11, P: 3, Q: 2, R: 9, S: 6, T: 9, U: 6, V: 3, W: 3, X: 2, Y: 3, Z: 2,
};

/** Official starting hand: 2–4 players → 21 tiles, 5–6 → 15, 7–8 → 11. */
export function startTilesFor(playerCount: number): number {
  if (playerCount <= 4) return 21;
  if (playerCount <= 6) return 15;
  return 11;
}

export const BG_START_TILE_CHOICES = [0, 11, 15, 21] as const;

/** Dump: return 1 tray tile to the bunch, draw this many (official rules). */
export const BG_DUMP_DRAW = 3;

export interface BananagramsSettings {
  /** Tiles dealt to each player at the split; 0 = official auto by player count. */
  startTiles: (typeof BG_START_TILE_CHOICES)[number];
  /** Official rules allow 2-letter words; 3 is the common house rule. */
  minWordLen: 2 | 3;
  theme: ThemeId;
}

export const DEFAULT_BANANAGRAMS_SETTINGS: BananagramsSettings = {
  startTiles: 0,
  minWordLen: 2,
  theme: 'jade',
};

// ── actions ─────────────────────────────────────────────────────────────────

export type BananagramsAction =
  /** Put a tile (from your tray or another cell of your board) on cell (x, y). */
  | { t: 'bg'; op: 'place'; tileId: number; x: number; y: number }
  /** Take one of your placed tiles back into your tray. */
  | { t: 'bg'; op: 'recall'; tileId: number }
  /** Trade a tray tile back into the bunch for three fresh ones. */
  | { t: 'bg'; op: 'dump'; tileId: number };

// ── views ───────────────────────────────────────────────────────────────────

export interface BgTile {
  id: number;
  letter: string;
}

export interface BgPlacedTile extends BgTile {
  x: number;
  y: number;
}

/** The viewer's own letters and live validation verdicts. */
export interface BgSelfView {
  tray: BgTile[];
  board: BgPlacedTile[];
  /** Cell keys (y*BG_SIZE+x) belonging to a run that isn't a valid word. */
  invalidCells: number[];
  /** True when every placed tile forms one orthogonally connected group. */
  connected: boolean;
  /** Tray empty + connected + everything valid: your next tile triggers the peel (or the win). */
  ready: boolean;
}

export interface BananagramsPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
  trayCount: number;
  boardCount: number;
  /** Peels this player has triggered this round. */
  peels: number;
  /**
   * Board occupancy without letters (cell keys) — the "crossword shape you
   * can see across the table". Omitted for the viewer's own seat (their
   * letters are in `you`).
   */
  silhouette?: number[];
}

export interface BananagramsView {
  g: 'bananagrams';
  yourSeat: number;
  players: BananagramsPlayerView[];
  /** Null while spectating from the waiting bench. */
  you: BgSelfView | null;
  bunchCount: number;
  /** Dump is only legal while the bunch holds at least this many tiles. */
  canDump: boolean;
  paused: boolean;
  settings: BananagramsSettings;
  round: number;
  /** On round end every board is revealed for the table-flip moment. */
  result: { winnerSeat: number; boards: { seat: number; tiles: BgPlacedTile[] }[] } | null;
}

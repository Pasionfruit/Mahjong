import type { ThemeId } from './settings';

/** Tetris: real-time, 1–4 players competitive (line clears send garbage). */

export const TETRIS_W = 10;
/** Two hidden spawn rows above the 20 visible ones. */
export const TETRIS_H = 22;
export const TETRIS_HIDDEN_ROWS = 2;

export const TETRIS_MIN_PLAYERS = 1;
export const TETRIS_MAX_PLAYERS = 4;

export const PIECE_KINDS = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

/**
 * The classic seven blocks — deliberately NOT the classic colors (the brief
 * asks for the same shapes with a different palette). All seven are distinct
 * on the felt background and none reuses the canonical hue for its shape.
 */
export const PIECE_COLORS: Record<PieceKind, string> = {
  I: '#e06a9e', // pink   (canon: cyan)
  O: '#8fd8f0', // sky    (canon: yellow)
  T: '#f2c114', // gold   (canon: purple)
  S: '#b06ee8', // violet (canon: green)
  Z: '#5fce7a', // green  (canon: red)
  J: '#e8883c', // orange (canon: blue)
  L: '#57a9e8', // blue   (canon: orange)
};
export const GARBAGE_COLOR = '#8a8f8c';

/**
 * Cell layouts per rotation (4 cells of [x, y] within a 4×4 box), spawn
 * orientation first, rotating clockwise.
 */
export const PIECE_CELLS: Record<PieceKind, readonly (readonly [number, number])[][]> = {
  I: [
    [[0, 1], [1, 1], [2, 1], [3, 1]],
    [[2, 0], [2, 1], [2, 2], [2, 3]],
    [[0, 2], [1, 2], [2, 2], [3, 2]],
    [[1, 0], [1, 1], [1, 2], [1, 3]],
  ],
  O: [
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [2, 1]],
  ],
  T: [
    [[1, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [1, 2]],
    [[1, 0], [0, 1], [1, 1], [1, 2]],
  ],
  S: [
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[1, 0], [1, 1], [2, 1], [2, 2]],
    [[1, 1], [2, 1], [0, 2], [1, 2]],
    [[0, 0], [0, 1], [1, 1], [1, 2]],
  ],
  Z: [
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[2, 0], [1, 1], [2, 1], [1, 2]],
    [[0, 1], [1, 1], [1, 2], [2, 2]],
    [[1, 0], [0, 1], [1, 1], [0, 2]],
  ],
  J: [
    [[0, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [2, 0], [1, 1], [1, 2]],
    [[0, 1], [1, 1], [2, 1], [2, 2]],
    [[1, 0], [1, 1], [0, 2], [1, 2]],
  ],
  L: [
    [[2, 0], [0, 1], [1, 1], [2, 1]],
    [[1, 0], [1, 1], [1, 2], [2, 2]],
    [[0, 1], [1, 1], [2, 1], [0, 2]],
    [[0, 0], [1, 0], [1, 1], [1, 2]],
  ],
};

// ── speed curve ─────────────────────────────────────────────────────────────

export const TETRIS_TICK_MS = 50;
/** Milliseconds per gravity row at level 1 and at the cap. */
export const LEVEL1_MS = 800;
export const LEVEL20_MS = 50;
export const MAX_SPEED_LEVEL = 20;

/**
 * Gravity interval: proportional ramp across levels 1..20; every level past
 * 20 keeps the level-20 speed.
 */
export function gravityMs(level: number): number {
  const l = Math.max(1, Math.min(MAX_SPEED_LEVEL, level));
  return Math.round(LEVEL1_MS - ((LEVEL1_MS - LEVEL20_MS) * (l - 1)) / (MAX_SPEED_LEVEL - 1));
}

export function gravityTicks(level: number): number {
  return Math.max(1, Math.round(gravityMs(level) / TETRIS_TICK_MS));
}

/** Level rises every 10 lines, on top of the host-chosen starting level. */
export function levelForLines(lines: number, startLevel: number): number {
  return startLevel + Math.floor(lines / 10);
}

/** Guideline-style scoring per lines cleared at once, scaled by level. */
export const LINE_SCORES = [0, 100, 300, 500, 800] as const;

/** Garbage rows sent to every opponent per lines cleared at once (1/2/3/4). */
export const GARBAGE_SENT = [0, 0, 1, 2, 4] as const;

// ── settings ────────────────────────────────────────────────────────────────

export const TETRIS_START_LEVELS = [1, 5, 10, 15, 20] as const;

export interface TetrisSettings {
  startLevel: number;
  /** Multi-line clears push garbage rows onto opponents. */
  garbage: boolean;
  theme: ThemeId;
}

export const DEFAULT_TETRIS_SETTINGS: TetrisSettings = {
  startLevel: 1,
  garbage: true,
  theme: 'crimson',
};

// ── actions & view ──────────────────────────────────────────────────────────

export type TetrisOp =
  | 'left'
  | 'right'
  | 'cw' //    rotate clockwise (arrow key / tap)
  | 'soft' //  soft drop one row
  | 'hard' //  hard drop (space / drag down)
  | 'hold'; // store the piece, or trade it with the stored one (c / swipes)

export type TetrisAction = { t: 'tetris'; op: TetrisOp };

export interface TetrisActivePiece {
  kind: PieceKind;
  rot: number;
  x: number;
  y: number;
}

export interface TetrisPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
  /**
   * Settled cells only, top row first: '.' empty, piece initials, 'G' garbage.
   * The active piece arrives separately so clients can draw ghosts.
   */
  grid: string[];
  active: TetrisActivePiece | null;
  hold: PieceKind | null;
  next: PieceKind[];
  level: number;
  lines: number;
  score: number;
  /** Garbage rows queued to arrive when the current piece locks. */
  incoming: number;
  alive: boolean;
}

export interface TetrisView {
  g: 'tetris';
  yourSeat: number;
  players: TetrisPlayerView[];
  paused: boolean;
  settings: TetrisSettings;
  round: number;
  /** Solo games end with winnerSeat null; versus crowns the last one standing. */
  result: { winnerSeat: number | null } | null;
}

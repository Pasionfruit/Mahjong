/**
 * Minesweeper (internal id: "minefield" — the id predates the display-name
 * rename and stays put since the solo Brain Arcade game already owns the
 * 'minesweeper' catalog id): a real-time party race. Every player gets
 * their own board — laid out identically (same seed), so it's a fair
 * speedrun, not a luck contest. By default, hitting a mine eliminates you
 * from the round (still watching, no longer clicking); with
 * `eliminateOnMine` off, a mine just costs you that reveal and you keep
 * going. The round ends the instant either someone fully clears their own
 * board (they win outright) or only one player is left un-eliminated
 * (they win by default). Fully server-authoritative: the server places
 * every mine and owns every reveal — clients only render.
 *
 * Flags are deliberately NOT part of shared state: they're a personal,
 * client-local memory aid (see MinefieldGame.tsx), never sent to the server.
 */

export const MINEFIELD_MIN_PLAYERS = 2;
export const MINEFIELD_MAX_PLAYERS = 8;

export type MinefieldPreset = 'beginner' | 'intermediate' | 'expert';

export interface MinefieldBoardSpec {
  rows: number;
  cols: number;
  mines: number;
}

/** Classic Minesweeper dimensions. */
export const MINEFIELD_PRESETS: Record<MinefieldPreset, MinefieldBoardSpec> = {
  beginner: { rows: 9, cols: 9, mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert: { rows: 16, cols: 30, mines: 99 },
};

export const MINEFIELD_PRESET_CHOICES: MinefieldPreset[] = ['beginner', 'intermediate', 'expert'];

export interface MinefieldSettings {
  preset: MinefieldPreset;
  /** "Remove all 50/50s" — regenerate until the board is fully solvable by
   *  logic alone, no guessing required. */
  noGuess: boolean;
  /** Classic rules: hitting a mine eliminates you for the round. Off: a mine
   *  just costs you that reveal, and you keep playing your own board. */
  eliminateOnMine: boolean;
}

export const DEFAULT_MINEFIELD_SETTINGS: MinefieldSettings = {
  preset: 'intermediate',
  noGuess: false,
  eliminateOnMine: true,
};

// ── actions ─────────────────────────────────────────────────────────────────

/** Reveal cell `index` (row-major, row * cols + col) on your own board.
 *  Chording isn't supported server-side — flags are client-local, so the
 *  server has no way to know which neighbors you consider "handled". */
export type MinefieldAction = { t: 'mf'; op: 'reveal'; index: number };

// ── views ───────────────────────────────────────────────────────────────────

/** A cell as its own player sees it — mine identity is only ever revealed
 *  once that specific cell has actually been revealed. */
export type MinefieldCellView =
  | { revealed: false }
  | { revealed: true; mine: false; adjacent: number }
  | { revealed: true; mine: true };

export interface MinefieldPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
  /** Safe cells this player has personally revealed on their own board. */
  revealedCount: number;
  /** Mines this player has personally hit on their own board this round. */
  minesHit: number;
  /** True once eliminated — only possible with settings.eliminateOnMine on. */
  eliminated: boolean;
}

export interface MinefieldView {
  g: 'minefield';
  yourSeat: number;
  players: MinefieldPlayerView[];
  rows: number;
  cols: number;
  mineCount: number;
  /** Non-mine cells on the board — what every revealedCount races toward. */
  totalSafeCells: number;
  /** The viewer's own board progress; null only while spectating (no seat). */
  yourCells: MinefieldCellView[] | null;
  /** Once the round is over, the shared layout everyone raced on — the
   *  reveal moment, since every board was laid out identically. */
  finalLayout: MinefieldCellView[] | null;
  paused: boolean;
  settings: MinefieldSettings;
  round: number;
  /** Currently always exactly one seat (cleared their board, or last standing). */
  result: { winnerSeats: number[] } | null;
}

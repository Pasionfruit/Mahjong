/**
 * Minefield: Minesweeper as a real-time party battle. Everyone races on one
 * shared board — clicking reveals cells for the whole table. By default,
 * hitting a mine eliminates you for the round (still watching, no longer
 * clicking) and the round ends the instant only one player is left standing
 * — or, with `eliminateOnMine` off, a mine just costs you the reveal (it's
 * marked hit and helps everyone else avoid it) and you keep playing. Either
 * way the board is won the moment it's fully cleared — whoever lands that
 * final reveal wins outright. Fully server-authoritative: the server places
 * every mine and owns every reveal — clients only render.
 *
 * Flags are deliberately NOT part of shared state: they're a personal,
 * client-local memory aid (see MinefieldGame.tsx), never sent to the server
 * and never visible to opponents — a flag can't block or help anyone but
 * the player who placed it.
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
   *  just costs you that reveal — the cell stays marked for everyone, but
   *  you keep clicking. */
  eliminateOnMine: boolean;
}

export const DEFAULT_MINEFIELD_SETTINGS: MinefieldSettings = {
  preset: 'intermediate',
  noGuess: false,
  eliminateOnMine: true,
};

// ── actions ─────────────────────────────────────────────────────────────────

/** Reveal cell `index` (row-major, row * cols + col). Chording isn't
 *  supported server-side — flags are client-local, so the server has no way
 *  to know which neighbors you consider "handled". */
export type MinefieldAction = { t: 'mf'; op: 'reveal'; index: number };

// ── views ───────────────────────────────────────────────────────────────────

/** A cell as a viewer sees it — mine identity is only ever revealed once
 *  that specific cell has actually been revealed (or the round is over). */
export type MinefieldCellView =
  | { revealed: false }
  | { revealed: true; mine: false; adjacent: number; owner: number | null }
  | { revealed: true; mine: true; owner: number };

export interface MinefieldPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
  /** Safe cells this player has personally revealed (via a click or the
   *  flood-fill it triggered) — the scoreboard number. */
  revealedCount: number;
  /** Mines this player has personally hit this round. */
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
  /** Flat, row-major, length rows*cols. */
  cells: MinefieldCellView[];
  paused: boolean;
  settings: MinefieldSettings;
  round: number;
  /** Currently always exactly one seat (cleared the board, or last standing). */
  result: { winnerSeats: number[] } | null;
}

/**
 * Brain Arcade's solo-game contract — the client-only analogue of
 * server/src/games/GameModule.ts, deliberately stripped to what a single-
 * device puzzle actually needs. See the design doc (Part B3) for the full
 * contrast: no seats, no redaction, no bot scheduling, no room broadcast —
 * there's exactly one player and nothing to hide state from.
 */

export type SoloStatus = 'playing' | 'won' | 'lost';

export interface SoloResult {
  status: 'won' | 'lost';
  /** Leaderboard-sortable; direction is per-game (see scoreDirection). */
  score: number;
  /** Extra per-run numbers/labels shown on the result screen (e.g. { guesses: 4 }). */
  stats?: Record<string, number | string>;
}

export interface SoloGameModule<TState, TMove, TSettings = void> {
  readonly id: string;
  /** Whether a lower or higher score wins the leaderboard (e.g. Minesweeper
   *  time: 'asc'; 2048 score: 'desc'). */
  readonly scoreDirection: 'asc' | 'desc';

  /** Deterministic init — the same (seed, settings) always yields the same puzzle. */
  generate(seed: number, settings: TSettings): TState;

  /** Client-authoritative move application. Returns null for an illegal move. */
  applyMove(state: TState, move: TMove): TState | null;

  status(state: TState): SoloStatus;
  /** null while status is 'playing'. */
  result(state: TState): SoloResult | null;

  /** Pure re-derivation: generate(seed) folded through moveLog. Powers resume
   *  (persisted state is {seed, settings, moveLog}, never a raw snapshot) and,
   *  later, optional server-side score verification — without changing this
   *  shape at all. */
  replay(seed: number, settings: TSettings, moveLog: TMove[]): TState;

  /** Optional Wordle-style shareable result summary. */
  shareText?(state: TState): string;
}

/** A completed run, persisted locally and synced to Supabase via the outbox. */
export interface StoredResult {
  /** Client-generated UUID — the idempotency key for the Supabase upsert. */
  id: string;
  gameId: string;
  mode: 'daily' | 'endless';
  /** UTC date key ("YYYY-MM-DD"), or null for endless mode. */
  dateKey: string | null;
  score: number;
  stats: Record<string, number | string>;
  moveLog: unknown[];
  /** ISO timestamp. */
  completedAt: string;
  /** ISO timestamp once synced to Supabase, else null (this is the outbox flag). */
  syncedAt: string | null;
}

/** In-progress save, resumable via SoloGameModule.replay(). */
export interface SavedGame {
  seed: number;
  settings: unknown;
  moveLog: unknown[];
  /** ISO timestamp, for tie-breaking/debugging — not currently used for conflict resolution. */
  updatedAt: string;
}

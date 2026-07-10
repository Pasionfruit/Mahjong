import type { BotDifficulty } from '@shared/settings';
import type { ClientGameView, GameEvent } from '@shared/view';

/** Public metadata every seat carries, independent of any game's rules. */
export interface SeatMeta {
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
}

export type ApplyResult =
  | { ok: true; events: GameEvent[] }
  | { ok: false; error: string };

/** A move a seat currently owes, surfaced so the room can schedule bots. */
export interface PendingMove {
  seat: number;
  /** Module-defined move category (e.g. 'turn' | 'claim'); passed back to botDelayMs. */
  kind: string;
  /** True when the move is a win that must not be slowed by the reaction delay. */
  fast: boolean;
}

/**
 * A pluggable game's rules, behind a state-erased boundary so {@link Room} stays
 * game-agnostic: it owns membership, reconnection, timers and broadcast, and
 * delegates every rules decision here. State/settings/action are opaque
 * (`unknown`) to the room; each module casts to its own concrete types.
 */
export interface GameModule {
  readonly id: string;
  readonly minPlayers: number;
  readonly maxPlayers: number;
  /** Grace period before a disconnected seat on the clock is auto-moved (ms). */
  readonly turnGraceMs: number;

  /** A fresh, mutable copy of the default settings for a new room. */
  defaultSettings(): unknown;
  /** Validate + merge a settings patch; null if the patch is invalid. */
  sanitizeSettings(current: unknown, patch: unknown): unknown | null;

  startRound(
    settings: unknown,
    playerCount: number,
    dealerSeat: number,
    round: number,
    seed: number,
  ): { state: unknown; events: GameEvent[] };

  applyAction(state: unknown, seat: number, action: unknown): ApplyResult;
  applyTimeout(state: unknown): GameEvent[];
  isRoundOver(state: unknown): boolean;

  /** How long to arm the deadline for the current phase (ms), or null for none. */
  deadlineHintMs(state: unknown): number | null;
  /** The seat on the clock for a normal turn (for disconnect grace), or null. */
  awaitingSeat(state: unknown): number | null;
  /** Every seat that owes a move right now. */
  pendingSeats(state: unknown): PendingMove[];
  /** Auto-resolve moves owed by disconnected seats; returns the events produced. */
  settleDisconnected(state: unknown, connected: (seat: number) => boolean): GameEvent[];

  botDelayMs(difficulty: BotDifficulty, kind: string, fast: boolean): number;
  chooseAction(state: unknown, seat: number, difficulty: BotDifficulty): unknown;
  fallbackAction(state: unknown, seat: number): unknown;

  /** Runtime guard for an action off the wire before it reaches applyAction. */
  validateAction(action: unknown): boolean;

  redactFor(
    state: unknown,
    viewerSeat: number,
    seats: SeatMeta[],
    deadline: number | null,
    paused: boolean,
  ): ClientGameView;
}

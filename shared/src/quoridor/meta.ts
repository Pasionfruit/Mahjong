import type { ThemeId, TurnTimerSeconds } from '../settings';
import type { Move, PlayerIndex, Pos } from './types';

/**
 * Online Quoridor: the room-game contract on top of the pure engine.
 * Seat 0 plays the top pawn (goal row 8), seat 1 the bottom (goal row 0);
 * the opening move alternates between rounds via the dealer seat.
 */

export interface QuoridorSettings {
  turnTimerSeconds: TurnTimerSeconds;
  theme: ThemeId;
}

export const DEFAULT_QUORIDOR_SETTINGS: QuoridorSettings = {
  turnTimerSeconds: 30,
  theme: 'classic',
};

/** Wire action — exactly an engine move. */
export type QuoridorAction = Move;

export interface QuoridorPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  wins: number;
  wallsLeft: number;
  pawn: Pos;
}

export interface QuoridorOnlineView {
  g: 'quoridor';
  yourSeat: number;
  turnSeat: number;
  pawns: [Pos, Pos];
  /** Flat wall-grid indices (r·8+c) of placed walls, per orientation. */
  hWalls: number[];
  vWalls: number[];
  wallsLeft: [number, number];
  players: QuoridorPlayerView[];
  lastMove: Move | null;
  /** Algebraic history ("e2", "e3h", …) for the move list. */
  history: string[];
  deadline: number | null;
  paused: boolean;
  settings: QuoridorSettings;
  round: number;
  result: { winnerSeat: PlayerIndex } | null;
}

import type { ThemeId } from './settings';
import type { TurnTimerSeconds } from './settings';

export type Mark = 'X' | 'O';
export type Cell = Mark | null;
/** Outcome of one small board: a mark won it, it drew, or it's still open. */
export type SmallResult = Mark | 'draw' | null;

/** The eight winning triples of indices, for both small boards and the meta-grid. */
export const LINES: readonly (readonly [number, number, number])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export interface UtttSettings {
  turnTimerSeconds: TurnTimerSeconds;
  theme: ThemeId;
}

export const DEFAULT_UTTT_SETTINGS: UtttSettings = {
  turnTimerSeconds: 30,
  theme: 'ocean',
};

export interface UtttResult {
  /** Seat that won, or null for a drawn game. */
  winnerSeat: number | null;
  /** The three winning meta-board indices, for the highlight. */
  line?: [number, number, number];
}

export interface UtttPlayer {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  mark: Mark;
  wins: number;
}

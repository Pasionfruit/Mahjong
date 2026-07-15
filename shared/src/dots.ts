import type { ThemeId, TurnTimerSeconds } from './settings';

/**
 * Dots and Boxes: turn-based, 2–6 players (any of them bots). Draw one edge
 * per turn; closing the fourth side of a box claims it and grants another
 * move. Most boxes when the grid is full wins.
 */

export const DOTS_MIN_PLAYERS = 2;
export const DOTS_MAX_PLAYERS = 6;

/** Board sizes as boxes per side (the dot grid is one larger). */
export const DOTS_SIZE_CHOICES = [3, 5, 7] as const;
export type DotsSize = (typeof DOTS_SIZE_CHOICES)[number];

export interface DotsSettings {
  size: DotsSize;
  turnTimerSeconds: TurnTimerSeconds;
  theme: ThemeId;
}

export const DEFAULT_DOTS_SETTINGS: DotsSettings = {
  size: 5,
  turnTimerSeconds: 30,
  theme: 'classic',
};

/**
 * Edge addressing on an N×N box grid:
 *  - 'h' edges: (N+1) rows × N cols — h(r,c) joins dot(r,c)→dot(r,c+1);
 *    it is the top of box(r,c) and the bottom of box(r−1,c).
 *  - 'v' edges: N rows × (N+1) cols — v(r,c) joins dot(r,c)→dot(r+1,c);
 *    it is the left of box(r,c) and the right of box(r,c−1).
 */
export type DotsAction = { t: 'edge'; o: 'h' | 'v'; r: number; c: number };

export interface DotsPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  color: string;
  score: number;
  wins: number;
}

export interface DotsView {
  g: 'dots';
  yourSeat: number;
  turnSeat: number;
  size: DotsSize;
  /** Flat edge owners, -1 = undrawn: h is (N+1)·N, v is N·(N+1). */
  hEdges: number[];
  vEdges: number[];
  /** Flat box owners (N·N), -1 = unclaimed. */
  boxes: number[];
  lastEdge: { o: 'h' | 'v'; r: number; c: number } | null;
  /** The mover just closed a box and moves again. */
  extraTurn: boolean;
  players: DotsPlayerView[];
  deadline: number | null;
  paused: boolean;
  settings: DotsSettings;
  round: number;
  result: { winnerSeats: number[] } | null;
}

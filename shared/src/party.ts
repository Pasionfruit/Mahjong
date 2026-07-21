import type { ThemeId } from './settings';

/**
 * Party Board — a Mario-Party-style board game night. Roll the die, march
 * around the loop, bank coins, buy the star before it hops away, and gamble
 * on the chest round. Most stars after the final round wins (coins break
 * ties). 2–8 players, bots welcome.
 */

export const PARTY_MIN_PLAYERS = 2;
export const PARTY_MAX_PLAYERS = 8;

export const PARTY_SPACES = 28;
export const PARTY_STAR_COST = 20;
export const PARTY_START_COINS = 10;
export const PARTY_DIE_MAX = 6;

/** Rewards hidden in the three chests each bonus round (shuffled). */
export const PARTY_CHEST_REWARDS = [10, 5, -5] as const;

export const PARTY_ROUNDS_CHOICES = [6, 10, 15] as const;

/** Fixed pacing (seconds) per decision. */
export const PARTY_ROLL_SECONDS = 25;
export const PARTY_BUY_SECONDS = 12;
export const PARTY_CHEST_SECONDS = 15;

export type PartySpaceType = 'start' | 'blue' | 'red' | 'event';

/** Landing bonuses. */
export const PARTY_BLUE_COINS = 3;
export const PARTY_RED_COINS = -3;

/**
 * The fixed space layout: index 0 is Start; every 7th space bleeds coins,
 * every 4th risks an event, the rest pay out.
 */
export function partySpaceType(i: number): PartySpaceType {
  if (i === 0) return 'start';
  if (i % 7 === 3) return 'red';
  if (i % 4 === 2) return 'event';
  return 'blue';
}

/**
 * Space coordinates on a 0..1000 square: a rounded-square loop (squircle),
 * walked clockwise from the top middle. Shared so client and server agree.
 */
export function partyBoardPath(): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < PARTY_SPACES; i++) {
    const theta = (i / PARTY_SPACES) * Math.PI * 2 - Math.PI / 2;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const x = 500 + 415 * Math.sign(c) * Math.pow(Math.abs(c), 0.62);
    const y = 500 + 415 * Math.sign(s) * Math.pow(Math.abs(s), 0.62);
    pts.push({ x: Math.round(x), y: Math.round(y) });
  }
  return pts;
}

export interface PartySettings {
  rounds: number;
  theme: ThemeId;
}

export const DEFAULT_PARTY_SETTINGS: PartySettings = {
  rounds: 10,
  theme: 'crimson',
};

export type PartyPhase = 'roll' | 'buyStar' | 'chest' | 'final';

export type PartyAction =
  | { t: 'roll' }
  | { t: 'buyStar'; buy: boolean }
  | { t: 'chest'; index: number };

/** One line of the activity feed, rendered into text client-side. */
export interface PartyFeedItem {
  kind: 'roll' | 'coins' | 'star' | 'noStar' | 'swap' | 'steal' | 'chest' | 'event';
  seat: number;
  value?: number;
  other?: number;
}

export interface PartyPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  color: string;
  wins: number;
  pos: number;
  coins: number;
  stars: number;
  /** Chest phase: has this player picked yet? */
  picked: boolean;
}

export interface PartyView {
  g: 'party';
  yourSeat: number;
  phase: PartyPhase;
  turnSeat: number;
  /** Board-round progress (each player moves once per round). */
  progress: { current: number; total: number };
  die: number | null;
  starIndex: number;
  starCost: number;
  /** Space types by index ('start'|'blue'|'red'|'event'). */
  spaces: PartySpaceType[];
  players: PartyPlayerView[];
  feed: PartyFeedItem[];
  /** Chest phase reveal: the rewards, once everyone has picked (else null). */
  chestReveal: { rewards: number[]; picks: number[] } | null;
  deadline: number | null;
  paused: boolean;
  settings: PartySettings;
  round: number;
  result: { winnerSeats: number[] } | null;
}

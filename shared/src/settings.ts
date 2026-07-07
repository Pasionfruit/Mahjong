export const THEMES = ['jade', 'crimson', 'ocean', 'classic'] as const;
export type ThemeId = (typeof THEMES)[number];

export const TURN_TIMER_CHOICES = [0, 15, 30, 60] as const;
export type TurnTimerSeconds = (typeof TURN_TIMER_CHOICES)[number];

export interface GameSettings {
  includeFlowers: boolean;
  /** When false, the wall is only the three suits (dots/bamboo/characters). */
  includeHonors: boolean;
  /** 0 = no turn timer. */
  turnTimerSeconds: TurnTimerSeconds;
  /** Casual mode: everyone's hand is face-up. */
  openHands: boolean;
  /**
   * N: standard win = N sets + 1 pair; pairs win = (N+2) pairs + 1 set.
   * null = auto (scaled by player count at game start).
   */
  setsToWin: number | null;
  theme: ThemeId;
}

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 4;
export const MIN_SETS_TO_WIN = 2;
export const MAX_SETS_TO_WIN = 5;

export function defaultSetsFor(playerCount: number): number {
  if (playerCount <= 2) return 3;
  if (playerCount === 3) return 4;
  return 5;
}

export function resolveSetsToWin(settings: GameSettings, playerCount: number): number {
  return settings.setsToWin ?? defaultSetsFor(playerCount);
}

/** Pairs-mode target: M pairs + 1 set, where M = N + 2 (7 pairs at N=5, 6 at N=4, 5 at N=3). */
export function pairsToWin(setsToWin: number): number {
  return setsToWin + 2;
}

/** Standing hand size (between turns) for a given N. Winning hand is one more. */
export function handSize(setsToWin: number): number {
  return 3 * setsToWin + 1;
}

export const DEFAULT_SETTINGS: GameSettings = {
  includeFlowers: true,
  includeHonors: false,
  turnTimerSeconds: 30,
  openHands: false,
  setsToWin: null,
  theme: 'jade',
};

export const CLAIM_WINDOW_MS = 7000;
export const DISCONNECT_TURN_GRACE_MS = 30_000;
export const DISCONNECT_CLAIM_GRACE_MS = 3_000;

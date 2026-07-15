import type { ThemeId } from './settings';

/**
 * Spin Sumo — beyblade-style tops shoving each other off a shrinking arena.
 * Real-time server physics; 2–8 players (bots welcome).
 */

export const SUMO_TICK_MS = 50;

export const SUMO_MIN_PLAYERS = 2;
export const SUMO_ABS_MAX_PLAYERS = 8;
export const SUMO_PLAYER_CHOICES = [2, 3, 4, 5, 6, 8] as const;

/** World is a WORLD×WORLD square; the arena is a circle at its center. */
export const SUMO_WORLD = 1000;
export const SUMO_TOP_RADIUS = 36;
/** Full spin charge. Rotation drains with time and impacts; a weary top hits
 *  softer, flies farther, and steers sluggishly. Respawns spin fresh. */
export const SUMO_SPIN_MAX = 100;

export const SUMO_MAPS = ['classic', 'small', 'donut'] as const;
export type SumoMapId = (typeof SUMO_MAPS)[number];

export const SUMO_MAP_NAMES: Record<SumoMapId, string> = {
  classic: 'Classic — the big bowl',
  small: 'Skirmish — tight ring',
  donut: 'Donut — mind the hole',
};

/** Outer radius / inner hole radius per map. */
export const SUMO_MAP_GEOMETRY: Record<SumoMapId, { radius: number; hole: number }> = {
  classic: { radius: 460, hole: 0 },
  small: { radius: 330, hole: 0 },
  donut: { radius: 460, hole: 130 },
};

/** The shrunken-arena floor: shrinking never goes below this. */
export const SUMO_MIN_RADIUS = 160;
/** How long the shrink takes once it starts (ticks). */
export const SUMO_SHRINK_DURATION_TICKS = 600; // 30s

export type SumoMode = 'lives' | 'countdown';

export const SUMO_LIVES_CHOICES = [1, 2, 3, 5] as const;
/** Lives mode: seconds until the arena starts closing in. */
export const SUMO_SHRINK_AFTER_CHOICES = [15, 30, 60, 90] as const;
/** Countdown mode: match length in seconds (most knockouts wins). */
export const SUMO_MATCH_SECONDS_CHOICES = [60, 90, 120, 180] as const;

export interface SumoSettings {
  map: SumoMapId;
  /** lives = last one standing (arena shrinks); countdown = KO tally on a clock. */
  mode: SumoMode;
  lives: number;
  shrinkAfterSeconds: number;
  matchSeconds: number;
  /** Host-configured table size. */
  maxPlayers: number;
  theme: ThemeId;
}

export const DEFAULT_SUMO_SETTINGS: SumoSettings = {
  map: 'classic',
  mode: 'lives',
  lives: 3,
  shrinkAfterSeconds: 60,
  matchSeconds: 120,
  maxPlayers: 6,
  theme: 'ocean',
};

/** Held steering vector, magnitude ≤ 1 (joystick / keys / mouse-follow). */
export type SumoAction = { t: 'stick'; x: number; y: number };

export interface SumoPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  color: string;
  wins: number;
  x: number;
  y: number;
  /** Speed magnitude, for client spin/trail effects. */
  speed: number;
  /** Remaining rotation, 0..SUMO_SPIN_MAX. */
  spin: number;
  /** On the arena right now (false while waiting to respawn or eliminated). */
  alive: boolean;
  /** Remaining lives (lives mode; 0 in countdown mode). */
  lives: number;
  /** Knockouts credited (countdown mode tally, fun stat in lives mode). */
  kos: number;
  /** Just respawned: translucent and collision-free. */
  ghost: boolean;
  /** Out for good (lives mode). */
  eliminated: boolean;
}

export interface SumoView {
  g: 'sumo';
  yourSeat: number;
  players: SumoPlayerView[];
  map: SumoMapId;
  mode: SumoMode;
  /** Current outer radius (shrinks in lives mode). */
  arenaRadius: number;
  holeRadius: number;
  shrinking: boolean;
  /**
   * Lives mode: seconds until the shrink begins (null once started).
   * Countdown mode: seconds left in the match.
   */
  secondsLeft: number | null;
  paused: boolean;
  settings: SumoSettings;
  round: number;
  result: { winnerSeats: number[] } | null;
}

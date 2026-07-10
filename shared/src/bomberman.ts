/** Bomberman: real-time, desktop-only, 2–8 players. */

// 23×17 gives eight spawn points real breathing room.
export const BOMBER_W = 23;
export const BOMBER_H = 17;

export const BOMBER_MAPS = ['classic', 'arena', 'maze'] as const;
export type BomberMapId = (typeof BOMBER_MAPS)[number];

export const BOMBER_MAP_NAMES: Record<BomberMapId, string> = {
  classic: 'Classic — pillars & bricks',
  arena: 'Arena — open center brawl',
  maze: 'Maze — tight corridors',
};

/** 0 = no sudden death. Otherwise the arena starts closing after N seconds. */
export const SUDDEN_DEATH_CHOICES = [0, 60, 120, 180] as const;
export type SuddenDeathSeconds = (typeof SUDDEN_DEATH_CHOICES)[number];

/** Selectable player colors (also the per-seat defaults, in order). */
export const PLAYER_COLORS = [
  '#e8c15a', // gold
  '#e05656', // red
  '#57a9e8', // blue
  '#5fce7a', // green
  '#b06ee8', // purple
  '#e8883c', // orange
  '#59d5cd', // teal
  '#e86eb8', // pink
] as const;

export const LIVES_CHOICES = [1, 2, 3] as const;
export type LivesCount = (typeof LIVES_CHOICES)[number];

export const ITEM_FREQUENCIES = ['low', 'normal', 'high'] as const;
export type ItemFrequency = (typeof ITEM_FREQUENCIES)[number];

export interface BombermanSettings {
  map: BomberMapId;
  suddenDeathSeconds: SuddenDeathSeconds;
  /** Lives per player; with spares you blink in place instead of dying. */
  lives: LivesCount;
  /** How often bricks hide an item. */
  itemFrequency: ItemFrequency;
}

export const DEFAULT_BOMBERMAN_SETTINGS: BombermanSettings = {
  map: 'classic',
  suddenDeathSeconds: 120,
  lives: 1,
  itemFrequency: 'normal',
};

export type PowerupKind = 'fire' | 'pierce' | 'slow' | 'glove' | 'boots' | 'bombs';

export const POWERUP_NAMES: Record<PowerupKind, string> = {
  fire: 'Bigger blast',
  pierce: 'Brick-piercing blast',
  slow: 'Slow rivals',
  glove: 'Pick up & throw bombs',
  boots: 'Speed boots',
  bombs: 'Extra bomb',
};

export type BomberDir = 'up' | 'down' | 'left' | 'right';

/** Grid cell chars in the redacted view. Hidden powerups are never sent. */
export type BomberCellChar =
  | '#' // solid wall
  | 'B' // brick (contents hidden)
  | '.' // floor
  | 'f' // fire powerup on the floor
  | 'p' // pierce powerup
  | 's' // slow powerup
  | 'g' // glove powerup
  | 'b' // speed boots
  | 'x'; // extra bomb

export interface BomberPlayerView {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  color: string;
  x: number;
  y: number;
  alive: boolean;
  facing: BomberDir;
  fire: number;
  pierce: boolean;
  glove: boolean;
  /** Speed boots collected (0–2); higher = faster. */
  speed: number;
  slowed: boolean;
  carrying: boolean;
  /** Lives remaining (includes the one in play). */
  lives: number;
  /** Currently stepping between cells (drives the walk animation). */
  moving: boolean;
  /** Blinking after losing a life — flames don't hurt. */
  invulnerable: boolean;
  /** Milliseconds per cell at current speed (drives the client tween). */
  stepMs: number;
  wins: number;
}

export interface BombView {
  id: number;
  x: number;
  y: number;
  /** Ticks until detonation (for the pulse animation). */
  ticksLeft: number;
  /** Seat carrying this bomb, or null if it sits on the floor. */
  carriedBySeat: number | null;
}

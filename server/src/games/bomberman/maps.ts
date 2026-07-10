import {
  BOMBER_H,
  BOMBER_W,
  type BomberMapId,
  type ItemFrequency,
  type PowerupKind,
} from '@shared/bomberman';
import { mulberry32 } from '../../engine/rng';

export const FLOOR = 0;
export const WALL = 1;
export const BRICK = 2;

export interface BuiltMap {
  /** FLOOR / WALL / BRICK per cell (y * BOMBER_W + x). */
  grid: number[];
  /** Powerup hidden under each BRICK cell, or null. */
  hidden: (PowerupKind | null)[];
  /** Spawn cell per seat, seats 0..playerCount-1. */
  spawns: { x: number; y: number }[];
}

const W = BOMBER_W;
const H = BOMBER_H;
const idx = (x: number, y: number) => y * W + x;

/** Up to 8 spawn points: four corners, then the four edge midpoints. */
export function spawnPoints(playerCount: number): { x: number; y: number }[] {
  const mx = Math.floor(W / 2);
  const my = Math.floor(H / 2);
  const all = [
    { x: 1, y: 1 },
    { x: W - 2, y: H - 2 },
    { x: W - 2, y: 1 },
    { x: 1, y: H - 2 },
    { x: mx, y: 1 },
    { x: mx, y: H - 2 },
    { x: 1, y: my },
    { x: W - 2, y: my },
  ];
  return all.slice(0, playerCount);
}

/** Chance a brick hides an item, by host setting. */
const ITEM_CHANCE: Record<ItemFrequency, number> = { low: 0.2, normal: 0.38, high: 0.56 };

/** Weighted item roll: fire and extra bombs are the staples. */
function rollPowerup(rand: () => number, freq: ItemFrequency): PowerupKind | null {
  if (rand() >= ITEM_CHANCE[freq]) return null;
  const r = rand();
  if (r < 0.26) return 'fire';
  if (r < 0.5) return 'bombs';
  if (r < 0.66) return 'boots';
  if (r < 0.8) return 'pierce';
  if (r < 0.9) return 'slow';
  return 'glove';
}

export function buildMap(
  map: BomberMapId,
  playerCount: number,
  seed: number,
  itemFrequency: ItemFrequency = 'normal',
): BuiltMap {
  const rand = mulberry32(seed);
  const grid = new Array<number>(W * H).fill(FLOOR);

  // Border walls on every map.
  for (let x = 0; x < W; x++) {
    grid[idx(x, 0)] = WALL;
    grid[idx(x, H - 1)] = WALL;
  }
  for (let y = 0; y < H; y++) {
    grid[idx(0, y)] = WALL;
    grid[idx(W - 1, y)] = WALL;
  }

  let brickDensity: number;
  if (map === 'classic') {
    // The traditional pillar lattice.
    for (let y = 2; y < H - 1; y += 2) {
      for (let x = 2; x < W - 1; x += 2) grid[idx(x, y)] = WALL;
    }
    brickDensity = 0.72;
  } else if (map === 'arena') {
    // Sparse pillar diamond; the middle stays open for brawling.
    const mx = Math.floor(W / 2);
    const my = Math.floor(H / 2);
    for (const [x, y] of [
      [4, 4], [W - 5, 4], [4, H - 5], [W - 5, H - 5],
      [mx, 2], [mx, H - 3], [3, my], [W - 4, my],
    ]) {
      grid[idx(x!, y!)] = WALL;
    }
    brickDensity = 0.42;
  } else {
    // Maze: wall rows with staggered gaps form corridors (gaps every 7 cells,
    // offset on alternating rows so paths zigzag).
    for (let y = 2; y < H - 1; y += 2) {
      const gaps: number[] = [];
      for (let x = y % 4 === 2 ? 2 : 5; x < W - 1; x += 7) gaps.push(x);
      for (let x = 1; x < W - 1; x++) {
        if (!gaps.includes(x)) grid[idx(x, y)] = WALL;
      }
    }
    brickDensity = 0.55;
  }

  // Arena keeps a clear 3×3 center.
  if (map === 'arena') {
    const mx = Math.floor(W / 2);
    const my = Math.floor(H / 2);
    for (let y = my - 1; y <= my + 1; y++) {
      for (let x = mx - 1; x <= mx + 1; x++) grid[idx(x, y)] = FLOOR;
    }
  }

  // Scatter bricks on open floor.
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === FLOOR && rand() < brickDensity) grid[i] = BRICK;
  }

  // Clear each spawn cell and its orthogonal neighbours (walls included — map
  // structures may cross a spawn) so nobody starts boxed in or inside a wall.
  for (const { x, y } of spawnPoints(playerCount)) {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const cx = x + dx!;
      const cy = y + dy!;
      if (cx <= 0 || cy <= 0 || cx >= W - 1 || cy >= H - 1) continue;
      grid[idx(cx, cy)] = FLOOR;
    }
  }

  const hidden = grid.map((c) => (c === BRICK ? rollPowerup(rand, itemFrequency) : null));
  return { grid, hidden, spawns: spawnPoints(playerCount) };
}

/**
 * Clockwise inward spiral of interior cells, used by sudden death to close the
 * arena. The innermost 3×3 around the center is left open so the fight ends there.
 */
export function shrinkSpiral(): number[] {
  const out: number[] = [];
  const mx = Math.floor(W / 2);
  const my = Math.floor(H / 2);
  const keep = (x: number, y: number) =>
    x >= mx - 1 && x <= mx + 1 && y >= my - 1 && y <= my + 1;
  let left = 1;
  let top = 1;
  let right = W - 2;
  let bottom = H - 2;
  while (left <= right && top <= bottom) {
    for (let x = left; x <= right; x++) if (!keep(x, top)) out.push(idx(x, top));
    for (let y = top + 1; y <= bottom; y++) if (!keep(right, y)) out.push(idx(right, y));
    if (top < bottom) {
      for (let x = right - 1; x >= left; x--) if (!keep(x, bottom)) out.push(idx(x, bottom));
    }
    if (left < right) {
      for (let y = bottom - 1; y >= top + 1; y--) if (!keep(left, y)) out.push(idx(left, y));
    }
    left++;
    top++;
    right--;
    bottom--;
  }
  return out;
}

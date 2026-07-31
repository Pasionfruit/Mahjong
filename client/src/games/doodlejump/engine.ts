/**
 * Pure Doodle Jump engine — no DOM, fixed-timestep, deterministic given an
 * injected `rand`. The component drives it from a rAF loop (same
 * continuous-physics pattern as sandplay: results are wired straight
 * through recordResult()/flushOutbox(), not the discrete-move hook).
 *
 * World coordinates: x in [0, WIDTH) with horizontal wrap; y grows UPWARD
 * (player.y is the feet height above the start platform). The camera is a
 * world-y for the bottom edge of the view and only ever moves up.
 */

export const WIDTH = 360;
export const HEIGHT = 540;

/** Fixed physics timestep (seconds). */
export const DT = 1 / 60;

export const GRAVITY = 1800; // px/s²
export const JUMP_VY = 640; // px/s bounce impulse (max jump ≈ 114 px)
export const SPRING_MULT = 1.65;
export const MAX_VX = 250;

export const PLAYER_HALF = 14; // half-width
export const PLAYER_H = 26;
export const PLAT_W = 60;
export const PLAT_H = 12;

export const SPRING_CHANCE = 0.08;
/** Largest platform gap the generator will ever emit — below max jump reach. */
export const MAX_GAP = 104;

const ACCEL = 1700;
const FRICTION = 7;
/** Camera keeps the player at most this far above the view's bottom edge. */
const CAMERA_OFFSET = HEIGHT * 0.55;
/** How far below the view bottom the player may fall before dying. */
const DEATH_MARGIN = 60;
/** Always keep platforms generated this far above the camera. */
const GEN_AHEAD = HEIGHT * 2;
const CULL_BELOW = 80;
/** Height (px) over which difficulty ramps from 0 → 1. */
const DIFFICULTY_SPAN = 4000;

export type PlatformType = 'normal' | 'moving' | 'breakable';

export interface Platform {
  id: number;
  /** Center x. */
  x: number;
  /** World y of the platform's top (the bounce surface). */
  y: number;
  type: PlatformType;
  /** Super-jump pad — only ever on 'normal' platforms. */
  spring: boolean;
  /** Breakable platforms crumble after their single bounce. */
  broken: boolean;
  /** Patrol direction (moving platforms; harmless elsewhere). */
  dir: 1 | -1;
  /** Patrol speed px/s (0 for non-moving). */
  speed: number;
}

export type BounceKind = 'normal' | 'spring' | 'break';

export interface DoodleState {
  phase: 'playing' | 'dead';
  /** Player center x / feet world-y. */
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** World y of the view's bottom edge; only ever increases. */
  cameraY: number;
  /** Highest feet position reached — the score (in px; ÷10 = meters). */
  maxHeight: number;
  platforms: Platform[];
  /** Highest world y platforms have been generated up to. */
  genTopY: number;
  nextId: number;
  time: number;
  /** Set on the tick a bounce happened (drives squash/stretch), else null. */
  lastBounce: BounceKind | null;
}

export interface DoodleInput {
  dir: -1 | 0 | 1;
}

export interface GenResult {
  platforms: Platform[];
  nextId: number;
  /** The y the generator stopped at — feed back in as the next window's fromY. */
  topY: number;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Feet-vs-platform horizontal overlap, wrap-aware. */
export function horizontalOverlap(playerX: number, platX: number): boolean {
  const half = PLAT_W / 2 + PLAYER_HALF;
  const d = Math.abs(playerX - platX);
  return Math.min(d, WIDTH - d) <= half;
}

export function metersFromHeight(h: number): number {
  return Math.max(0, Math.floor(h / 10));
}

/**
 * Procedurally fill (fromY, toY] with platforms. Vertical spacing grows
 * (density thins) and hazard types get more common with height, but every
 * gap stays under MAX_GAP — always reachable off a plain bounce. Breakables
 * never spawn back-to-back so a single crumble can't strand the player.
 */
export function generatePlatforms(
  fromY: number,
  toY: number,
  startId: number,
  rand: () => number,
  prevWasBreakable = false,
): GenResult {
  const platforms: Platform[] = [];
  let id = startId;
  let y = fromY;
  let prevBreak = prevWasBreakable;
  while (y < toY) {
    const t = clamp(y / DIFFICULTY_SPAN, 0, 1);
    const gapMin = 42 + 18 * t;
    const gapMax = 76 + 28 * t; // 104 = MAX_GAP at full difficulty
    y += gapMin + rand() * (gapMax - gapMin);
    const x = PLAT_W / 2 + rand() * (WIDTH - PLAT_W);
    const roll = rand();
    let type: PlatformType = 'normal';
    const breakChance = prevBreak ? 0 : 0.1 + 0.1 * t;
    const moveChance = 0.12 + 0.1 * t;
    if (roll < breakChance) type = 'breakable';
    else if (roll < breakChance + moveChance) type = 'moving';
    const spring = type === 'normal' && rand() < SPRING_CHANCE;
    platforms.push({
      id: id++,
      x,
      y,
      type,
      spring,
      broken: false,
      dir: rand() < 0.5 ? -1 : 1,
      speed: type === 'moving' ? 45 + rand() * 45 + 40 * t : 0,
    });
    prevBreak = type === 'breakable';
  }
  return { platforms, nextId: id, topY: y };
}

export function createRun(rand: () => number): DoodleState {
  const base: Platform = { id: 0, x: WIDTH / 2, y: 0, type: 'normal', spring: false, broken: false, dir: 1, speed: 0 };
  const gen = generatePlatforms(0, HEIGHT * 1.6, 1, rand);
  return {
    phase: 'playing',
    x: WIDTH / 2,
    y: 0,
    vx: 0,
    vy: JUMP_VY, // launch off the base platform immediately
    cameraY: -70,
    maxHeight: 0,
    platforms: [base, ...gen.platforms],
    genTopY: gen.topY,
    nextId: gen.nextId,
    time: 0,
    lastBounce: null,
  };
}

/**
 * Advance one fixed DT tick. Pure — returns a new state. `rand` is only
 * consumed when new platform windows generate, so a seeded rand plus a
 * fixed input schedule replays a run exactly.
 */
export function step(state: DoodleState, input: DoodleInput, rand: () => number): DoodleState {
  if (state.phase === 'dead') return state;

  const s: DoodleState = {
    ...state,
    platforms: state.platforms.map((p) => ({ ...p })),
    time: state.time + DT,
    lastBounce: null,
  };

  // Horizontal steering with momentum, wrapping at the edges.
  if (input.dir !== 0) {
    s.vx = clamp(s.vx + input.dir * ACCEL * DT, -MAX_VX, MAX_VX);
  } else {
    s.vx *= Math.max(0, 1 - FRICTION * DT);
    if (Math.abs(s.vx) < 1) s.vx = 0;
  }
  s.x += s.vx * DT;
  if (s.x < 0) s.x += WIDTH;
  else if (s.x >= WIDTH) s.x -= WIDTH;

  // Moving platforms patrol and turn around at the walls.
  for (const p of s.platforms) {
    if (p.type !== 'moving' || p.broken) continue;
    p.x += p.dir * p.speed * DT;
    const minX = PLAT_W / 2;
    const maxX = WIDTH - PLAT_W / 2;
    if (p.x <= minX) {
      p.x = minX;
      p.dir = 1;
    } else if (p.x >= maxX) {
      p.x = maxX;
      p.dir = -1;
    }
  }

  // Vertical physics. Bounce only while falling, and only when the feet
  // cross a platform's top surface during this tick.
  const prevY = s.y;
  s.vy -= GRAVITY * DT;
  s.y += s.vy * DT;
  if (s.vy < 0) {
    for (const p of s.platforms) {
      if (p.broken) continue;
      if (prevY >= p.y && s.y <= p.y && horizontalOverlap(s.x, p.x)) {
        s.y = p.y;
        if (p.type === 'breakable') {
          p.broken = true; // one bounce, then it crumbles
          s.vy = JUMP_VY;
          s.lastBounce = 'break';
        } else if (p.spring) {
          s.vy = JUMP_VY * SPRING_MULT;
          s.lastBounce = 'spring';
        } else {
          s.vy = JUMP_VY;
          s.lastBounce = 'normal';
        }
        break;
      }
    }
  }

  s.maxHeight = Math.max(s.maxHeight, s.y);

  // Camera follows upward only.
  if (s.y - s.cameraY > CAMERA_OFFSET) s.cameraY = s.y - CAMERA_OFFSET;

  // Keep the generated world comfortably ahead of the camera.
  while (s.genTopY < s.cameraY + GEN_AHEAD) {
    const gen = generatePlatforms(s.genTopY, s.cameraY + GEN_AHEAD, s.nextId, rand);
    s.platforms = [...s.platforms, ...gen.platforms];
    s.genTopY = gen.topY;
    s.nextId = gen.nextId;
  }
  s.platforms = s.platforms.filter((p) => p.y > s.cameraY - CULL_BELOW);

  // Fell out of view → dead.
  if (s.y < s.cameraY - DEATH_MARGIN) s.phase = 'dead';
  return s;
}

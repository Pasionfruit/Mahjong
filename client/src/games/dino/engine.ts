/**
 * Pure Dino Run engine (the Chrome offline dinosaur) — no DOM, fixed
 * timestep, fully deterministic given an injected `rand`. The component
 * drives it from a rAF loop with a time accumulator, same as flappy.
 *
 * Coordinates: logical 600×220 canvas px, y grows downward. The dino's x
 * is fixed — the desert scrolls left past it. Score is distance run.
 */

export const WIDTH = 600;
export const HEIGHT = 220;
export const GROUND_Y = 182;

/** Fixed physics timestep (seconds). */
export const DT = 1 / 60;

export const DINO_X = 62; // left edge of the hitbox
/** Hitboxes (slightly forgiving vs. the drawn sprite, like the original). */
export const DINO_W = 24;
export const DINO_H = 40;
export const DUCK_W = 36;
export const DUCK_H = 22;

export const JUMP_VY = -560; // px/s, applied on jump
export const GRAVITY = 1560; // px/s²
/** Holding duck mid-air slams the dino down, chrome-style. */
const FAST_FALL_GRAVITY = 3900;

/** Difficulty ramp: the desert scrolls faster with distance, capped. */
const BASE_SPEED = 300;
export const MAX_SPEED = 620;

/** Points are distance-based — roughly 10/s at starting speed. */
const DIST_PER_POINT = 30;

/** Birds only join once the run is properly going. */
export const BIRD_MIN_SCORE = 200;

export type Phase = 'ready' | 'playing' | 'dead';
export type ObstacleKind = 'cactus' | 'bird';

export interface Obstacle {
  kind: ObstacleKind;
  /** Left edge, logical px. */
  x: number;
  w: number;
  h: number;
  /** Top edge, logical px (cacti sit on the ground; birds fly at lanes). */
  y: number;
}

export interface RunState {
  phase: Phase;
  /** Top of the dino's hitbox. */
  dinoY: number;
  dinoVy: number;
  ducking: boolean;
  score: number;
  /** Seconds since the run screen appeared (drives leg/wing animation). */
  time: number;
  /** Total scrolled distance in px (drives score, speed, and parallax). */
  dist: number;
  /** World-x where the next obstacle spawns (monotonic, vs dist). */
  nextSpawnAt: number;
  obstacles: Obstacle[];
}

export interface StepInput {
  jump: boolean;
  duck: boolean;
}

const DINO_STAND_Y = GROUND_Y - DINO_H;
const DINO_DUCK_Y = GROUND_Y - DUCK_H;

export function createRun(): RunState {
  return {
    phase: 'ready',
    dinoY: DINO_STAND_Y,
    dinoVy: 0,
    ducking: false,
    score: 0,
    time: 0,
    dist: 0,
    nextSpawnAt: WIDTH + 220,
    obstacles: [],
  };
}

export function scrollSpeed(dist: number): number {
  return Math.min(BASE_SPEED + dist / 42, MAX_SPEED);
}

export function onGround(s: { dinoY: number; ducking: boolean }): boolean {
  return s.dinoY >= (s.ducking ? DINO_DUCK_Y : DINO_STAND_Y) - 0.01;
}

/** The dino's current AABB — duck trades height for a longer snout. */
export function dinoBox(s: RunState): { x: number; y: number; w: number; h: number } {
  return s.ducking
    ? { x: DINO_X, y: s.dinoY, w: DUCK_W, h: DUCK_H }
    : { x: DINO_X, y: s.dinoY, w: DINO_W, h: DINO_H };
}

export function collides(s: RunState, o: Obstacle): boolean {
  const d = dinoBox(s);
  return d.x < o.x + o.w && d.x + d.w > o.x && d.y < o.y + o.h && d.y + d.h > o.y;
}

/** Bird lanes, top edges: low (jump it), mid (duck under it), high (run under). */
export const BIRD_W = 34;
export const BIRD_H = 22;
export const BIRD_LANES = [GROUND_Y - 26, GROUND_Y - 58, GROUND_Y - 108];

function spawnObstacle(x: number, score: number, rand: () => number): Obstacle {
  if (score >= BIRD_MIN_SCORE && rand() < 0.28) {
    const lane = BIRD_LANES[Math.floor(rand() * BIRD_LANES.length)]!;
    return { kind: 'bird', x, w: BIRD_W, h: BIRD_H, y: lane };
  }
  // Cactus cluster: 1-3 small (14×30) or 1-2 large (18×44) stems.
  const large = rand() < 0.4;
  const unitW = large ? 18 : 14;
  const h = large ? 44 : 30;
  const count = 1 + Math.floor(rand() * (large ? 2 : 3));
  const w = count * unitW + (count - 1) * 3;
  return { kind: 'cactus', x, w, h, y: GROUND_Y - h };
}

/** Gap to the next obstacle: always clearable at the current speed, with
 *  the random slack shrinking a little as the run speeds up. */
function nextGap(dist: number, rand: () => number): number {
  const speed = scrollSpeed(dist);
  const min = speed * 0.62 + 90;
  return min + rand() * 300;
}

/**
 * Advance the run by exactly one fixed DT tick. Pure: returns a new state,
 * never mutates the input. `rand` is only consumed when an obstacle
 * spawns, so a seeded rand + a fixed input schedule replays a run exactly.
 */
export function step(state: RunState, input: StepInput, rand: () => number): RunState {
  if (state.phase === 'dead') return state;

  const next: RunState = {
    ...state,
    obstacles: state.obstacles.map((o) => ({ ...o })),
    time: state.time + DT,
  };

  if (next.phase === 'ready') {
    if (!input.jump) return next; // idle: dino jogs in place, world still
    next.phase = 'playing';
  }

  // ── dino physics
  const grounded = onGround(next);
  if (grounded) {
    // Duck state only changes on the ground; airborne it means fast-fall.
    next.ducking = input.duck;
    next.dinoY = input.duck ? DINO_DUCK_Y : DINO_STAND_Y;
    next.dinoVy = 0;
    if (input.jump && !input.duck) {
      next.dinoVy = JUMP_VY;
      next.dinoY += next.dinoVy * DT;
    }
  } else {
    const g = input.duck ? FAST_FALL_GRAVITY : GRAVITY;
    next.dinoVy += g * DT;
    next.dinoY += next.dinoVy * DT;
    const floor = next.ducking ? DINO_DUCK_Y : DINO_STAND_Y;
    if (next.dinoY >= floor) {
      next.dinoY = floor;
      next.dinoVy = 0;
    }
  }

  // ── world scroll, spawning, culling
  const speed = scrollSpeed(next.dist);
  const dx = speed * DT;
  next.dist += dx;
  for (const o of next.obstacles) o.x -= dx;
  next.nextSpawnAt -= dx;
  if (next.nextSpawnAt <= WIDTH) {
    next.obstacles.push(spawnObstacle(next.nextSpawnAt, next.score, rand));
    next.nextSpawnAt += nextGap(next.dist, rand);
  }
  while (next.obstacles.length > 0 && next.obstacles[0]!.x + next.obstacles[0]!.w < -20) {
    next.obstacles.shift();
  }

  next.score = Math.floor(next.dist / DIST_PER_POINT);

  // ── collisions end the run
  for (const o of next.obstacles) {
    if (collides(next, o)) {
      next.phase = 'dead';
      break;
    }
  }
  return next;
}

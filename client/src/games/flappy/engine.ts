/**
 * Pure Flappy Bird engine — no DOM, fixed-timestep, fully deterministic
 * given an injected `rand`. The component drives it from a rAF loop with a
 * time accumulator (same continuous-physics pattern as sandplay: results
 * are wired straight through recordResult()/flushOutbox(), not the
 * discrete-move useSoloGame hook).
 *
 * Coordinates: logical 360×540 canvas px, y grows downward. The bird's x
 * is fixed — the world scrolls left past it.
 */

export const WIDTH = 360;
export const HEIGHT = 540;
export const GROUND_H = 64;
export const GROUND_Y = HEIGHT - GROUND_H;

export const BIRD_X = 88;
export const BIRD_R = 13;
const BIRD_START_Y = 226;

/** Fixed physics timestep (seconds). */
export const DT = 1 / 60;

export const GRAVITY = 1500; // px/s²
export const FLAP_VY = -330; // px/s, applied instantly on flap
const MAX_FALL = 520; // terminal velocity, keeps late-run falls readable

export const PIPE_W = 56;
export const PIPE_SPACING = 200; // fixed horizontal distance between pipe pairs
const FIRST_PIPE_X = WIDTH + 140; // breathing room before the first pipe
/** Gap centers stay at least this far (plus half the gap) from top/ground. */
const EDGE_MARGIN = 46;

/** Difficulty ramp: gently faster scroll and tighter gaps, both capped. */
const BASE_SPEED = 130;
export const MAX_SPEED = 190;
const BASE_GAP = 158;
export const MIN_GAP = 120;

export type Phase = 'ready' | 'playing' | 'dead';

export interface Pipe {
  /** Left edge, logical px. */
  x: number;
  /** Vertical center of the gap. */
  gapY: number;
  /** Gap height, captured at spawn time (the ramp never mutates old pipes). */
  gapH: number;
  /** Whether this pipe has already been scored. */
  passed: boolean;
}

export interface RunState {
  phase: Phase;
  birdY: number;
  birdVy: number;
  score: number;
  /** Seconds since the run screen appeared (drives idle bob / wing anim). */
  time: number;
  /** Total scrolled distance in px (drives ground/cloud parallax). */
  dist: number;
  pipes: Pipe[];
}

export interface StepInput {
  flap: boolean;
}

export function createRun(): RunState {
  return { phase: 'ready', birdY: BIRD_START_Y, birdVy: 0, score: 0, time: 0, dist: 0, pipes: [] };
}

export function scrollSpeed(score: number): number {
  return Math.min(BASE_SPEED + score * 2.5, MAX_SPEED);
}

export function gapHeight(score: number): number {
  return Math.max(MIN_GAP, BASE_GAP - score * 1.2);
}

/** AABB check of the bird's square against a pipe pair's solid parts. */
export function collidesWithPipe(birdY: number, pipe: Pipe): boolean {
  const left = BIRD_X - BIRD_R;
  const right = BIRD_X + BIRD_R;
  if (right <= pipe.x || left >= pipe.x + PIPE_W) return false;
  const gapTop = pipe.gapY - pipe.gapH / 2;
  const gapBottom = pipe.gapY + pipe.gapH / 2;
  return birdY - BIRD_R < gapTop || birdY + BIRD_R > gapBottom;
}

export function hitsGround(birdY: number): boolean {
  return birdY + BIRD_R >= GROUND_Y;
}

function spawnPipe(x: number, score: number, rand: () => number): Pipe {
  const gapH = gapHeight(score);
  const minCenter = gapH / 2 + EDGE_MARGIN;
  const maxCenter = GROUND_Y - gapH / 2 - EDGE_MARGIN;
  return { x, gapY: minCenter + rand() * (maxCenter - minCenter), gapH, passed: false };
}

/**
 * Advance the run by exactly one fixed DT tick. Pure: returns a new state,
 * never mutates the input. `rand` is only consumed when a pipe spawns, so
 * a seeded rand + a fixed flap schedule replays a run exactly.
 */
export function step(state: RunState, input: StepInput, rand: () => number): RunState {
  if (state.phase === 'dead') return state;

  const next: RunState = { ...state, pipes: state.pipes.map((p) => ({ ...p })), time: state.time + DT };

  if (next.phase === 'ready') {
    if (!input.flap) return next; // idle: bird bobs (drawn from time), no gravity yet
    next.phase = 'playing';
    next.birdVy = FLAP_VY;
  } else if (input.flap) {
    next.birdVy = FLAP_VY;
  }

  // Bird physics.
  next.birdVy = Math.min(next.birdVy + GRAVITY * DT, MAX_FALL);
  next.birdY += next.birdVy * DT;
  if (next.birdY < BIRD_R) {
    // Ceiling is soft — classic flappy only dies on pipes and ground.
    next.birdY = BIRD_R;
    next.birdVy = 0;
  }

  // World scroll + pipe spawning at fixed spacing.
  const speed = scrollSpeed(next.score);
  next.dist += speed * DT;
  for (const p of next.pipes) p.x -= speed * DT;
  const last = next.pipes[next.pipes.length - 1];
  if (!last) next.pipes.push(spawnPipe(FIRST_PIPE_X, next.score, rand));
  else if (last.x <= FIRST_PIPE_X - PIPE_SPACING) next.pipes.push(spawnPipe(last.x + PIPE_SPACING, next.score, rand));
  while (next.pipes.length > 0 && next.pipes[0]!.x + PIPE_W < -20) next.pipes.shift();

  // Scoring: one point the moment the bird fully clears a pipe, exactly once.
  for (const p of next.pipes) {
    if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
      p.passed = true;
      next.score += 1;
    }
  }

  // Collisions end the run.
  if (hitsGround(next.birdY)) {
    next.birdY = GROUND_Y - BIRD_R;
    next.phase = 'dead';
    return next;
  }
  for (const p of next.pipes) {
    if (collidesWithPipe(next.birdY, p)) {
      next.phase = 'dead';
      return next;
    }
  }
  return next;
}

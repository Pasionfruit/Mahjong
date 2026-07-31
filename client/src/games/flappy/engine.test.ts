import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@shared/rng';
import {
  BIRD_R,
  BIRD_X,
  DT,
  FLAP_VY,
  GRAVITY,
  GROUND_Y,
  MAX_SPEED,
  MIN_GAP,
  PIPE_W,
  collidesWithPipe,
  createRun,
  gapHeight,
  hitsGround,
  scrollSpeed,
  step,
  type Pipe,
  type RunState,
} from './engine';

const noRand = () => 0.5;

function playingState(overrides: Partial<RunState> = {}): RunState {
  return { phase: 'playing', birdY: 200, birdVy: 0, score: 0, time: 1, dist: 0, pipes: [], ...overrides };
}

function pipe(overrides: Partial<Pipe> = {}): Pipe {
  return { x: 200, gapY: 200, gapH: 320, passed: false, ...overrides };
}

describe('ready state', () => {
  it('ignores gravity and spawns no pipes until the first flap', () => {
    let s = createRun();
    for (let i = 0; i < 30; i++) s = step(s, { flap: false }, noRand);
    expect(s.phase).toBe('ready');
    expect(s.birdY).toBe(createRun().birdY);
    expect(s.birdVy).toBe(0);
    expect(s.pipes).toHaveLength(0);
    expect(s.score).toBe(0);
    expect(s.time).toBeGreaterThan(0);
  });

  it('the first flap starts the run with an upward impulse', () => {
    const s = step(createRun(), { flap: true }, noRand);
    expect(s.phase).toBe('playing');
    // Impulse applied, then this tick's gravity — still firmly upward.
    expect(s.birdVy).toBeCloseTo(FLAP_VY + GRAVITY * DT, 6);
    expect(s.birdVy).toBeLessThan(0);
  });
});

describe('physics', () => {
  it('gravity accelerates the bird downward by GRAVITY*DT each step', () => {
    let s = step(createRun(), { flap: true }, noRand);
    for (let i = 0; i < 10; i++) {
      const prev = s;
      s = step(s, { flap: false }, noRand);
      expect(s.birdVy).toBeCloseTo(prev.birdVy + GRAVITY * DT, 6);
    }
  });

  it('the bird falls (y increases) once velocity turns positive', () => {
    let s = playingState({ birdVy: 100 });
    const before = s.birdY;
    s = step(s, { flap: false }, noRand);
    expect(s.birdY).toBeGreaterThan(before);
  });

  it('a mid-run flap resets velocity to the upward impulse', () => {
    let s = playingState({ birdVy: 400 }); // falling fast
    s = step(s, { flap: true }, noRand);
    expect(s.birdVy).toBeCloseTo(FLAP_VY + GRAVITY * DT, 6);
  });
});

describe('scoring', () => {
  it('passing a pipe increments the score exactly once', () => {
    // Pipe just ahead of the pass threshold, gap wide enough that the
    // (position-pinned) bird can never hit it.
    let s = playingState({ pipes: [pipe({ x: 30 })] });
    let increments = 0;
    let prevScore = 0;
    for (let i = 0; i < 60; i++) {
      s = step(s, { flap: false }, noRand);
      // Pin the bird's physics so only scoring is under test.
      s = { ...s, birdY: 200, birdVy: 0, phase: 'playing' };
      if (s.score > prevScore) increments += s.score - prevScore;
      prevScore = s.score;
    }
    expect(increments).toBe(1);
    expect(s.score).toBe(1);
  });

  it('a pipe is only scored after the bird fully clears it', () => {
    const notYet = pipe({ x: BIRD_X - BIRD_R - PIPE_W + 5 });
    const s = playingState({ pipes: [notYet] });
    const next = step(s, { flap: false }, noRand);
    // Moved ~2px left — still overlapping the pass threshold, no score.
    expect(next.score).toBe(0);
  });
});

describe('collisions', () => {
  it('hitting a pipe ends the run', () => {
    const s = playingState({ pipes: [pipe({ x: BIRD_X - 10, gapY: 420, gapH: 120 })] });
    const next = step(s, { flap: false }, noRand);
    expect(next.phase).toBe('dead');
  });

  it('hitting the ground ends the run and clamps the bird onto it', () => {
    const s = playingState({ birdY: GROUND_Y - BIRD_R - 2, birdVy: 400 });
    const next = step(s, { flap: false }, noRand);
    expect(next.phase).toBe('dead');
    expect(next.birdY).toBe(GROUND_Y - BIRD_R);
  });

  it('a dead state is terminal — further steps change nothing', () => {
    const dead = { ...playingState(), phase: 'dead' as const };
    expect(step(dead, { flap: true }, noRand)).toBe(dead);
  });

  it('collidesWithPipe: misses when clear horizontally or inside the gap', () => {
    expect(collidesWithPipe(200, pipe({ x: 300 }))).toBe(false); // ahead of bird
    expect(collidesWithPipe(200, pipe({ x: BIRD_X, gapY: 200, gapH: 200 }))).toBe(false); // in gap
  });

  it('collidesWithPipe: hits above and below the gap', () => {
    expect(collidesWithPipe(60, pipe({ x: BIRD_X, gapY: 300, gapH: 140 }))).toBe(true); // top pipe
    expect(collidesWithPipe(430, pipe({ x: BIRD_X, gapY: 300, gapH: 140 }))).toBe(true); // bottom pipe
  });

  it('hitsGround only at/below the ground line', () => {
    expect(hitsGround(GROUND_Y - BIRD_R - 1)).toBe(false);
    expect(hitsGround(GROUND_Y - BIRD_R)).toBe(true);
  });
});

describe('difficulty ramp', () => {
  it('scroll speeds up with score and caps', () => {
    expect(scrollSpeed(10)).toBeGreaterThan(scrollSpeed(0));
    expect(scrollSpeed(1000)).toBe(MAX_SPEED);
  });

  it('gap tightens with score and floors', () => {
    expect(gapHeight(10)).toBeLessThan(gapHeight(0));
    expect(gapHeight(1000)).toBe(MIN_GAP);
  });
});

describe('determinism', () => {
  function run(seed: number): RunState {
    const rand = mulberry32(seed);
    let s = createRun();
    for (let i = 0; i < 900; i++) s = step(s, { flap: i % 18 === 0 }, rand);
    return s;
  }

  it('the same seed and flap schedule replays identically', () => {
    const a = run(5);
    const b = run(5);
    expect(a).toEqual(b);
    expect(a.pipes.length).toBeGreaterThan(0);
  });

  it('different seeds diverge (gap centers differ)', () => {
    expect(run(5)).not.toEqual(run(6));
  });
});

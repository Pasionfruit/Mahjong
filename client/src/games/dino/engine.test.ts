import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@shared/rng';
import {
  BIRD_LANES,
  BIRD_MIN_SCORE,
  BIRD_W,
  DINO_H,
  DINO_X,
  DT,
  DUCK_H,
  GRAVITY,
  GROUND_Y,
  JUMP_VY,
  MAX_SPEED,
  WIDTH,
  collides,
  createRun,
  dinoBox,
  onGround,
  scrollSpeed,
  step,
  type Obstacle,
  type RunState,
} from './engine';

const noRand = () => 0.5;
const idle = { jump: false, duck: false };

function playingState(overrides: Partial<RunState> = {}): RunState {
  return {
    ...createRun(),
    phase: 'playing',
    time: 1,
    nextSpawnAt: WIDTH * 10, // far away: obstacle spawning not under test
    ...overrides,
  };
}

function cactus(overrides: Partial<Obstacle> = {}): Obstacle {
  return { kind: 'cactus', x: 300, w: 14, h: 30, y: GROUND_Y - 30, ...overrides };
}

describe('ready state', () => {
  it('the world stands still until the first jump', () => {
    let s = createRun();
    for (let i = 0; i < 30; i++) s = step(s, idle, noRand);
    expect(s.phase).toBe('ready');
    expect(s.dist).toBe(0);
    expect(s.obstacles).toHaveLength(0);
    expect(s.score).toBe(0);
    expect(s.time).toBeGreaterThan(0);
  });

  it('the first jump starts the run with an upward impulse', () => {
    const s = step(createRun(), { jump: true, duck: false }, noRand);
    expect(s.phase).toBe('playing');
    expect(s.dinoVy).toBe(JUMP_VY);
    expect(s.dist).toBeGreaterThan(0);
  });
});

describe('physics', () => {
  it('gravity pulls a jump back to the ground and stays there', () => {
    let s = step(createRun(), { jump: true, duck: false }, noRand);
    let apex = s.dinoY;
    for (let i = 0; i < 200; i++) {
      s = step(s, idle, noRand);
      apex = Math.min(apex, s.dinoY);
    }
    expect(apex).toBeLessThan(GROUND_Y - DINO_H - 60); // actually got airborne
    expect(onGround(s)).toBe(true);
    expect(s.dinoY).toBe(GROUND_Y - DINO_H);
  });

  it('gravity accelerates by GRAVITY*DT per airborne step', () => {
    let s = step(createRun(), { jump: true, duck: false }, noRand);
    const prev = s;
    s = step(s, idle, noRand);
    expect(s.dinoVy).toBeCloseTo(prev.dinoVy + GRAVITY * DT, 6);
  });

  it('holding duck mid-air slams down faster than a plain fall', () => {
    const jumped = step(createRun(), { jump: true, duck: false }, noRand);
    let plain = jumped;
    let slam = jumped;
    let plainTicks = 0;
    let slamTicks = 0;
    while (!onGround(plain) && plainTicks < 500) {
      plain = step(plain, idle, noRand);
      plainTicks++;
    }
    while (!onGround(slam) && slamTicks < 500) {
      slam = step(slam, { jump: false, duck: true }, noRand);
      slamTicks++;
    }
    expect(slamTicks).toBeLessThan(plainTicks);
  });

  it('ducking on the ground lowers the hitbox; releasing restores it', () => {
    let s = playingState();
    s = step(s, { jump: false, duck: true }, noRand);
    expect(s.ducking).toBe(true);
    expect(dinoBox(s).h).toBe(DUCK_H);
    expect(s.dinoY).toBe(GROUND_Y - DUCK_H);
    s = step(s, idle, noRand);
    expect(s.ducking).toBe(false);
    expect(dinoBox(s).h).toBe(DINO_H);
  });

  it('cannot jump while ducking', () => {
    let s = playingState();
    s = step(s, { jump: false, duck: true }, noRand);
    s = step(s, { jump: true, duck: true }, noRand);
    expect(onGround(s)).toBe(true);
  });
});

describe('obstacles and scoring', () => {
  it('score is distance-based and monotonic', () => {
    let s = playingState();
    let last = 0;
    for (let i = 0; i < 600; i++) {
      s = step(s, idle, noRand);
      expect(s.score).toBeGreaterThanOrEqual(last);
      last = s.score;
    }
    expect(s.score).toBeGreaterThan(0);
    expect(s.score).toBe(Math.floor(s.dist / 30));
  });

  it('obstacles spawn ahead, scroll left, and are culled off-screen', () => {
    let s = playingState({ nextSpawnAt: WIDTH + 2 });
    s = step(s, idle, noRand);
    expect(s.obstacles.length).toBe(1);
    const firstX = s.obstacles[0]!.x;
    s = step(s, idle, noRand);
    expect(s.obstacles[0]!.x).toBeLessThan(firstX);
    for (let i = 0; i < 3000 && s.obstacles.length > 0; i++) {
      s = step(s, idle, noRand);
      // Keep the dino immortal so culling (not death) is under test.
      s = { ...s, phase: 'playing', obstacles: s.obstacles.filter((o) => !collides(s, o)) };
    }
    expect(s.obstacles.every((o) => o.x + o.w >= -20)).toBe(true);
  });

  it('no birds before BIRD_MIN_SCORE', () => {
    const rand = mulberry32(9);
    let s = playingState({ nextSpawnAt: WIDTH + 10 });
    const seen: string[] = [];
    for (let i = 0; i < 2000 && s.score < BIRD_MIN_SCORE - 20; i++) {
      s = step(s, idle, rand);
      for (const o of s.obstacles) seen.push(o.kind);
      s = { ...s, phase: 'playing', obstacles: s.obstacles.filter((o) => !collides(s, o)) };
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((k) => k === 'cactus')).toBe(true);
  });

  it('the mid bird lane passes over a ducking dino but hits a standing one', () => {
    const midBird: Obstacle = { kind: 'bird', x: DINO_X, w: BIRD_W, h: 22, y: BIRD_LANES[1]! };
    const standing = playingState();
    expect(collides(standing, midBird)).toBe(true);
    let ducked = playingState();
    ducked = step(ducked, { jump: false, duck: true }, () => 1); // rand=1 never spawns birds…
    expect(collides({ ...ducked, phase: 'playing' }, { ...midBird, x: DINO_X })).toBe(false);
  });
});

describe('collisions', () => {
  it('running into a cactus ends the run', () => {
    const s = playingState({ obstacles: [cactus({ x: DINO_X + 20 })] });
    const next = step(s, idle, noRand);
    expect(next.phase).toBe('dead');
  });

  it('jumping clears a cactus that would otherwise kill', () => {
    let s = playingState({ obstacles: [cactus({ x: DINO_X + 150 })] });
    s = step(s, { jump: true, duck: false }, noRand);
    for (let i = 0; i < 400 && s.phase === 'playing'; i++) {
      s = step(s, idle, noRand);
      if (s.obstacles.length === 0) break;
    }
    expect(s.phase).toBe('playing');
  });

  it('a dead state is terminal — further steps change nothing', () => {
    const dead = { ...playingState(), phase: 'dead' as const };
    expect(step(dead, { jump: true, duck: false }, noRand)).toBe(dead);
  });
});

describe('difficulty ramp', () => {
  it('speed grows with distance and caps', () => {
    expect(scrollSpeed(5000)).toBeGreaterThan(scrollSpeed(0));
    expect(scrollSpeed(1e9)).toBe(MAX_SPEED);
  });
});

describe('determinism', () => {
  function run(seed: number): RunState {
    const rand = mulberry32(seed);
    let s = createRun();
    for (let i = 0; i < 1200; i++) {
      s = step(s, { jump: i % 40 === 0, duck: i % 40 === 20 }, rand);
      if (s.phase === 'dead') break;
    }
    return s;
  }

  it('the same seed and input schedule replays identically', () => {
    expect(run(5)).toEqual(run(5));
  });

  it('different seeds diverge', () => {
    expect(run(5)).not.toEqual(run(11));
  });
});

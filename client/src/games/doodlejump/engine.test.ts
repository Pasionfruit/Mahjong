import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@shared/rng';
import {
  DT,
  GRAVITY,
  JUMP_VY,
  MAX_GAP,
  MAX_VX,
  PLAT_W,
  SPRING_MULT,
  WIDTH,
  createRun,
  generatePlatforms,
  horizontalOverlap,
  metersFromHeight,
  step,
  type DoodleState,
  type Platform,
} from './engine';

const noRand = () => 0.5;

function plat(overrides: Partial<Platform> = {}): Platform {
  return { id: 1, x: 180, y: 100, type: 'normal', spring: false, broken: false, dir: 1, speed: 0, ...overrides };
}

/** genTopY is huge so step() never generates — `rand` stays untouched. */
function state(platforms: Platform[], overrides: Partial<DoodleState> = {}): DoodleState {
  return {
    phase: 'playing',
    x: 180,
    y: 300,
    vx: 0,
    vy: 0,
    cameraY: -70,
    maxHeight: 300,
    platforms,
    genTopY: 1e9,
    nextId: 100,
    time: 0,
    lastBounce: null,
    ...overrides,
  };
}

describe('bouncing', () => {
  it('bounces only when falling feet cross a platform top', () => {
    const s = state([plat()], { y: 100.5, vy: -60 });
    const n = step(s, { dir: 0 }, noRand);
    expect(n.vy).toBe(JUMP_VY);
    expect(n.y).toBe(100); // snapped onto the surface
    expect(n.lastBounce).toBe('normal');
  });

  it('never bounces while rising through a platform', () => {
    const s = state([plat()], { y: 98, vy: 300 });
    const n = step(s, { dir: 0 }, noRand);
    expect(n.lastBounce).toBeNull();
    expect(n.vy).toBeCloseTo(300 - GRAVITY * DT, 6); // still rising
    expect(n.y).toBeGreaterThan(98);
  });

  it('never bounces when horizontally missing the platform', () => {
    const s = state([plat({ x: 40 })], { x: 300, y: 100.5, vy: -60 });
    const n = step(s, { dir: 0 }, noRand);
    expect(n.lastBounce).toBeNull();
    expect(n.vy).toBeCloseTo(-60 - GRAVITY * DT, 6);
  });

  it('never bounces when falling but not yet reaching the top', () => {
    const s = state([plat()], { y: 140, vy: -60 });
    const n = step(s, { dir: 0 }, noRand);
    expect(n.lastBounce).toBeNull();
    expect(n.y).toBeGreaterThan(100);
  });

  it('horizontalOverlap is wrap-aware across the seam', () => {
    expect(horizontalOverlap(2, WIDTH - 2)).toBe(true); // 4px apart through the seam
    expect(horizontalOverlap(100, 200)).toBe(false);
  });
});

describe('breakable platforms', () => {
  it('gives one bounce, then crumbles', () => {
    const first = step(state([plat({ type: 'breakable' })], { y: 100.5, vy: -60 }), { dir: 0 }, noRand);
    expect(first.vy).toBe(JUMP_VY);
    expect(first.lastBounce).toBe('break');
    expect(first.platforms[0]!.broken).toBe(true);
  });

  it('a broken platform is fallen straight through', () => {
    const broken = plat({ type: 'breakable', broken: true });
    const n = step(state([broken], { y: 100.5, vy: -60 }), { dir: 0 }, noRand);
    expect(n.lastBounce).toBeNull();
    expect(n.vy).toBeCloseTo(-60 - GRAVITY * DT, 6);
  });
});

describe('springs', () => {
  it('multiplies the jump impulse', () => {
    const n = step(state([plat({ spring: true })], { y: 100.5, vy: -60 }), { dir: 0 }, noRand);
    expect(n.vy).toBe(JUMP_VY * SPRING_MULT);
    expect(n.lastBounce).toBe('spring');
  });
});

describe('horizontal wrap', () => {
  it('wraps off the left edge onto the right', () => {
    const n = step(state([], { x: 3, vx: -MAX_VX }), { dir: -1 }, noRand);
    expect(n.x).toBeGreaterThan(WIDTH - 10);
  });

  it('wraps off the right edge onto the left', () => {
    const n = step(state([], { x: WIDTH - 3, vx: MAX_VX }), { dir: 1 }, noRand);
    expect(n.x).toBeLessThan(10);
  });
});

describe('score / max height', () => {
  it('tracks the highest point reached and never decreases', () => {
    let s = state([plat()], { y: 100.5, vy: -60, maxHeight: 0 });
    let prevMax = 0;
    let maxSeen = 0;
    for (let i = 0; i < 80; i++) {
      s = step(s, { dir: 0 }, noRand);
      expect(s.maxHeight).toBeGreaterThanOrEqual(prevMax);
      prevMax = s.maxHeight;
      maxSeen = Math.max(maxSeen, s.y);
    }
    // Bounced to ~JUMP_VY²/2g above the platform, then fell — max held.
    expect(s.maxHeight).toBeGreaterThan(200);
    expect(s.maxHeight).toBe(maxSeen);
  });

  it('metersFromHeight floors px/10 and never goes negative', () => {
    expect(metersFromHeight(1234)).toBe(123);
    expect(metersFromHeight(9)).toBe(0);
    expect(metersFromHeight(-50)).toBe(0);
  });
});

describe('death', () => {
  it('dies when falling below the bottom of the view', () => {
    const n = step(state([], { y: -200, cameraY: 0, vy: -100, maxHeight: 0 }), { dir: 0 }, noRand);
    expect(n.phase).toBe('dead');
  });

  it('a dead state is terminal', () => {
    const dead = { ...state([]), phase: 'dead' as const };
    expect(step(dead, { dir: 1 }, noRand)).toBe(dead);
  });

  it('the camera never follows the player downward', () => {
    const s = state([], { y: 100, cameraY: 50, vy: -200, maxHeight: 500 });
    const n = step(s, { dir: 0 }, noRand);
    expect(n.cameraY).toBe(50);
  });
});

describe('moving platforms', () => {
  it('patrol and reverse at the walls', () => {
    const mover = plat({ type: 'moving', x: WIDTH - PLAT_W / 2 - 1, dir: 1, speed: 120 });
    let s = state([mover], { x: 50, y: 400, vy: 200 }); // player far away, rising
    s = step(s, { dir: 0 }, noRand);
    s = step(s, { dir: 0 }, noRand);
    expect(s.platforms[0]!.dir).toBe(-1);
    expect(s.platforms[0]!.x).toBeLessThanOrEqual(WIDTH - PLAT_W / 2);
  });
});

describe('generatePlatforms', () => {
  it('is deterministic for the same seed', () => {
    expect(generatePlatforms(0, 2000, 1, mulberry32(3))).toEqual(generatePlatforms(0, 2000, 1, mulberry32(3)));
  });

  it('keeps every vertical gap reachable and inside the canvas', () => {
    for (const [from, to] of [
      [0, 2000],
      [6000, 9000],
    ] as const) {
      const gen = generatePlatforms(from, to, 1, mulberry32(4));
      let prevY: number = from;
      for (const p of gen.platforms) {
        expect(p.y - prevY).toBeLessThanOrEqual(MAX_GAP + 1e-9);
        expect(p.y - prevY).toBeGreaterThanOrEqual(20);
        prevY = p.y;
        expect(p.x).toBeGreaterThanOrEqual(PLAT_W / 2);
        expect(p.x).toBeLessThanOrEqual(WIDTH - PLAT_W / 2);
      }
    }
  });

  it('puts springs only on normal platforms', () => {
    const gen = generatePlatforms(0, 8000, 1, mulberry32(8));
    for (const p of gen.platforms) if (p.spring) expect(p.type).toBe('normal');
  });

  it('never spawns two breakables in a row', () => {
    const gen = generatePlatforms(0, 12000, 1, mulberry32(9));
    for (let i = 1; i < gen.platforms.length; i++) {
      const a = gen.platforms[i - 1]!;
      const b = gen.platforms[i]!;
      expect(a.type === 'breakable' && b.type === 'breakable').toBe(false);
    }
  });

  it('density thins with height (bigger average gaps up high)', () => {
    const low = generatePlatforms(0, 1500, 1, mulberry32(7));
    const high = generatePlatforms(6000, 7500, 1, mulberry32(7));
    const avg = (gen: { topY: number; platforms: Platform[] }, from: number) =>
      (gen.topY - from) / gen.platforms.length;
    expect(avg(high, 6000)).toBeGreaterThan(avg(low, 0));
  });
});

describe('createRun', () => {
  it('starts on a base platform under the player, already launching', () => {
    const s = createRun(mulberry32(1));
    expect(s.platforms.some((p) => p.y === 0 && p.x === WIDTH / 2)).toBe(true);
    expect(s.x).toBe(WIDTH / 2);
    expect(s.y).toBe(0);
    expect(s.vy).toBe(JUMP_VY);
    expect(s.phase).toBe('playing');
  });
});

describe('determinism', () => {
  function run(seedGen: number, seedStep: number): DoodleState {
    let s = createRun(mulberry32(seedGen));
    const rand = mulberry32(seedStep);
    for (let i = 0; i < 600; i++) {
      const dir = i % 120 < 60 ? 1 : -1;
      s = step(s, { dir }, rand);
    }
    return s;
  }

  it('the same seeds and input schedule replay identically', () => {
    expect(run(1, 2)).toEqual(run(1, 2));
  });

  it('different generation seeds diverge', () => {
    expect(run(1, 2)).not.toEqual(run(3, 2));
  });
});

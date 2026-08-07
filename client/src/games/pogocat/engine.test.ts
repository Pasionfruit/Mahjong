import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@shared/rng';
import {
  FISH_BONUS,
  MAX_GAP,
  MAX_W,
  MIN_GAP,
  MIN_VX,
  MIN_VY,
  MAX_VX,
  MAX_VY,
  MIN_W,
  PLATFORM_Y,
  jumpDistanceAt,
  MAX_DROP,
  MAX_RISE,
  PLATFORM_MAX_Y,
  PLATFORM_MIN_Y,
  chargeToVelocity,
  createPogo,
  flatJumpDistance,
  landingIndex,
  maxFlatDistance,
  nextPlatform,
  releaseJump,
  startCharge,
  stepJump,
  tickCharge,
  type Platform,
  type PogoState,
} from './engine';

function makeState(platforms: Platform[], catX: number): PogoState {
  return {
    platforms,
    current: 0,
    catX,
    phase: 'idle',
    charge: 0,
    chargeDir: 1,
    jump: null,
    score: 0,
    hops: 0,
    fish: 0,
  };
}

/** Charge to a chosen level and release. */
function leap(state: PogoState, charge: number): void {
  startCharge(state);
  state.charge = charge;
  releaseJump(state);
}

/** Run the jump to its conclusion. */
function settle(state: PogoState, rand: () => number = mulberry32(1)): 'landed' | 'fell' {
  for (let i = 0; i < 500; i++) {
    const out = stepJump(state, 1, rand);
    if (out !== 'air') return out;
  }
  throw new Error('jump never resolved');
}

describe('chargeToVelocity / flatJumpDistance', () => {
  it('maps charge monotonically to jump distance', () => {
    let prev = -Infinity;
    for (let c = 0; c <= 1.0001; c += 0.05) {
      const d = flatJumpDistance(c);
      expect(d).toBeGreaterThan(prev);
      prev = d;
    }
  });

  it('clamps charge outside [0, 1]', () => {
    expect(chargeToVelocity(-0.5)).toEqual({ vx: MIN_VX, vy: MIN_VY });
    expect(chargeToVelocity(1.5)).toEqual({ vx: MAX_VX, vy: MAX_VY });
    expect(flatJumpDistance(1.5)).toBe(maxFlatDistance());
  });
});

describe('landing detection', () => {
  it('landing inside the next platform span succeeds and scores', () => {
    const d = flatJumpDistance(0.5);
    const catX = 85;
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 110, fish: false }, { x: catX + d - 25, y: PLATFORM_Y, w: 60, fish: false }], catX);
    leap(s, 0.5);
    expect(s.phase).toBe('jumping');
    expect(settle(s)).toBe('landed');
    expect(s.phase).toBe('idle');
    expect(s.current).toBe(1);
    expect(s.score).toBe(1);
    expect(s.hops).toBe(1);
    expect(Math.abs(s.catX - (catX + d))).toBeLessThan(2);
    // A landing tops up the generated lookahead.
    expect(s.platforms.length - 1 - s.current).toBeGreaterThanOrEqual(6);
  });

  it('missing every platform falls into the gap and dies', () => {
    const d = flatJumpDistance(0.5);
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 110, fish: false }, { x: 85 + d + 100, y: PLATFORM_Y, w: 60, fish: false }], 85);
    leap(s, 0.5);
    expect(settle(s)).toBe('fell');
    expect(s.phase).toBe('dead');
    expect(s.score).toBe(0);
    expect(s.hops).toBe(0);
  });

  it('a tiny hop landing back on the same platform neither scores nor dies', () => {
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 200, fish: false }], 40);
    leap(s, 0); // min distance ≈ 53 lands at ≈93, still on [30, 230]
    expect(settle(s)).toBe('landed');
    expect(s.current).toBe(0);
    expect(s.score).toBe(0);
    expect(s.hops).toBe(0);
  });

  it('landing on a fish platform collects it for a +3 bonus, once', () => {
    const d = flatJumpDistance(0.5);
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 110, fish: false }, { x: 85 + d - 25, y: PLATFORM_Y, w: 60, fish: true }], 85);
    leap(s, 0.5);
    expect(settle(s)).toBe('landed');
    expect(s.score).toBe(1 + FISH_BONUS);
    expect(s.fish).toBe(1);
    expect(s.platforms[1]!.fish).toBe(false); // consumed
  });

  it('landingIndex finds the containing span only at/after `from`', () => {
    const platforms: Platform[] = [
      { x: 0, y: PLATFORM_Y, w: 50, fish: false },
      { x: 100, y: PLATFORM_Y, w: 50, fish: false },
    ];
    expect(landingIndex(25, platforms, 0)).toBe(0);
    expect(landingIndex(125, platforms, 0)).toBe(1);
    expect(landingIndex(25, platforms, 1)).toBe(-1);
    expect(landingIndex(75, platforms, 0)).toBe(-1);
  });
});

describe('charge mechanics', () => {
  it('startCharge only fires from idle; releaseJump only from charging', () => {
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 110, fish: false }], 85);
    releaseJump(s); // idle → no-op
    expect(s.phase).toBe('idle');
    startCharge(s);
    expect(s.phase).toBe('charging');
    startCharge(s); // already charging → no-op
    expect(s.phase).toBe('charging');
    releaseJump(s);
    expect(s.phase).toBe('jumping');
    expect(s.jump).not.toBeNull();
    expect(s.jump!.vy).toBeLessThan(0); // upward
    startCharge(s); // mid-air → no-op
    expect(s.phase).toBe('jumping');
  });

  it('tickCharge ping-pongs and never leaves [0, 1]', () => {
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 110, fish: false }], 85);
    startCharge(s);
    let hitTop = false;
    let hitBottomAfterTop = false;
    for (let i = 0; i < 200; i++) {
      tickCharge(s, 1);
      expect(s.charge).toBeGreaterThanOrEqual(0);
      expect(s.charge).toBeLessThanOrEqual(1);
      if (s.charge === 1) hitTop = true;
      if (hitTop && s.charge === 0) hitBottomAfterTop = true;
    }
    expect(hitTop).toBe(true);
    expect(hitBottomAfterTop).toBe(true);
  });
});

describe('platform generation', () => {
  it('is deterministic with a seeded rand', () => {
    expect(createPogo(mulberry32(11))).toEqual(createPogo(mulberry32(11)));

    const chain = (seed: number) => {
      const rand = mulberry32(seed);
      const platforms: Platform[] = [{ x: 30, y: PLATFORM_Y, w: 110, fish: false }];
      for (let i = 1; i <= 50; i++) platforms.push(nextPlatform(platforms[i - 1]!, i, rand));
      return platforms;
    };
    expect(chain(5)).toEqual(chain(5));
    expect(JSON.stringify(chain(5))).not.toEqual(JSON.stringify(chain(6)));
  });

  it('difficulty ramp stays bounded and every platform stays reachable', () => {
    const rand = mulberry32(9);
    const platforms: Platform[] = [{ x: 30, y: PLATFORM_Y, w: 110, fish: false }];
    for (let i = 1; i <= 300; i++) platforms.push(nextPlatform(platforms[i - 1]!, i, rand));
    for (let i = 1; i < platforms.length; i++) {
      const prev = platforms[i - 1]!;
      const p = platforms[i]!;
      const gap = p.x - (prev.x + prev.w);
      expect(gap).toBeGreaterThanOrEqual(MIN_GAP);
      expect(gap).toBeLessThanOrEqual(MAX_GAP);
      expect(p.w).toBeGreaterThanOrEqual(MIN_W);
      expect(p.w).toBeLessThanOrEqual(MAX_W);
      // Worst case: cat stranded on the far-left edge of prev must still be
      // able to reach the near edge of the next platform at full charge.
      expect(prev.w + gap).toBeLessThanOrEqual(maxFlatDistance() - 10);
    }
  });

  it('later platforms trend narrower with wider gaps', () => {
    const rand = mulberry32(21);
    const platforms: Platform[] = [{ x: 30, y: PLATFORM_Y, w: 110, fish: false }];
    for (let i = 1; i <= 120; i++) platforms.push(nextPlatform(platforms[i - 1]!, i, rand));
    const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const widths = platforms.map((p) => p.w);
    const gaps = platforms.slice(1).map((p, i) => p.x - (platforms[i]!.x + platforms[i]!.w));
    expect(avg(widths.slice(90))).toBeLessThan(avg(widths.slice(1, 30)));
    expect(avg(gaps.slice(90))).toBeGreaterThan(avg(gaps.slice(0, 30)));
  });

  it('createPogo starts idle on a wide first platform with a lookahead built', () => {
    const s = createPogo(mulberry32(3));
    expect(s.phase).toBe('idle');
    expect(s.current).toBe(0);
    expect(s.platforms.length).toBeGreaterThanOrEqual(7);
    expect(s.platforms[0]!.fish).toBe(false);
    expect(s.score).toBe(0);
    const first = s.platforms[0]!;
    expect(s.catX).toBeGreaterThan(first.x);
    expect(s.catX).toBeLessThan(first.x + first.w);
  });
});

describe('stepJump edges', () => {
  it('is a no-op unless jumping', () => {
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 110, fish: false }], 85);
    expect(stepJump(s, 1, mulberry32(1))).toBe('air');
    expect(s.phase).toBe('idle');
  });

  it('starts the arc at platform height moving up, then arcs back down', () => {
    const s = makeState([{ x: 30, y: PLATFORM_Y, w: 400, fish: false }], 85);
    leap(s, 0.7);
    expect(s.jump!.y).toBe(PLATFORM_Y);
    stepJump(s, 1, mulberry32(1));
    expect(s.jump!.y).toBeLessThan(PLATFORM_Y); // rose (y-down coords)
    const out = settle(s);
    expect(out).toBe('landed');
  });
});

describe('varied platform heights', () => {
  it('every generated hop stays within step limits, bounds, and full-charge reach', () => {
    const rand = mulberry32(42);
    let prev = { x: 30, y: PLATFORM_Y, w: 110, fish: false };
    for (let i = 1; i <= 300; i++) {
      const next = nextPlatform(prev, i, rand);
      expect(next.y).toBeGreaterThanOrEqual(PLATFORM_MIN_Y);
      expect(next.y).toBeLessThanOrEqual(PLATFORM_MAX_Y);
      expect(prev.y - next.y).toBeLessThanOrEqual(MAX_RISE); // climb cap
      expect(next.y - prev.y).toBeLessThanOrEqual(MAX_DROP); // drop cap
      // Reachable at full charge even launching from prev's far-left edge.
      const span = next.x - prev.x;
      expect(span).toBeLessThanOrEqual(jumpDistanceAt(1, prev.y - next.y) - 15.9);
      prev = next;
    }
  });

  it('heights actually vary once the ramp kicks in', () => {
    const rand = mulberry32(7);
    let prev = { x: 30, y: PLATFORM_Y, w: 110, fish: false };
    const ys = new Set<number>();
    for (let i = 1; i <= 40; i++) {
      prev = nextPlatform(prev, i, rand);
      ys.add(prev.y);
    }
    expect(ys.size).toBeGreaterThan(5);
  });
});

/**
 * Pogo Cat — pure engine (no DOM). A one-button timing game: the cat idles
 * on a platform, the player holds to charge the pogo spring (the charge
 * ping-pongs 0→1→0 so you must time the release), then releases to leap a
 * parabolic arc. Landing on a platform continues the run; dropping into a
 * gap ends it.
 *
 * Like Sand Play / Brick Breaker, this is a continuous physics game, so it
 * is NOT built on SoloGameModule/useSoloGame — the component records
 * finished runs directly via recordResult()/flushOutbox().
 *
 * Step functions mutate the passed state in place. "Pure" here means:
 * deterministic given (state, dt, rand), no DOM, no globals, no clock.
 */

export const WIDTH = 380;
export const HEIGHT = 540;

/** Top surface of every platform (side view, y grows downward). */
export const PLATFORM_Y = 430;
/** Falling past this y (into a gap) ends the run. */
export const FALL_LIMIT = HEIGHT + 60;

/** Gravity, px per 60fps-frame². */
export const GRAVITY = 0.5;

/** Launch velocity range mapped from charge ∈ [0, 1]. */
export const MIN_VX = 2.2;
export const MAX_VX = 5.2;
export const MIN_VY = 6;
export const MAX_VY = 11;

/** Full charge in 45 frames (~0.75s); the meter then ping-pongs back down. */
export const CHARGE_SPEED = 1 / 45;

/** Platform sizing / spacing — the difficulty ramp, all bounded. */
export const MIN_W = 48;
export const MAX_W = 120;
export const START_W = 92;
export const MIN_GAP = 40;
export const MAX_GAP = 120;

export const FISH_CHANCE = 0.18;
export const FISH_BONUS = 3;

export type Rand = () => number;

export interface Platform {
  x: number;
  w: number;
  /** A bonus fish sits on this platform (+FISH_BONUS when landed on). */
  fish: boolean;
}

export interface Jump {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export type Phase = 'idle' | 'charging' | 'jumping' | 'dead';

export interface PogoState {
  platforms: Platform[];
  /** Index into `platforms` of the platform the cat stands on. */
  current: number;
  /** The cat's resting x (world coords) while grounded. */
  catX: number;
  phase: Phase;
  charge: number;
  chargeDir: 1 | -1;
  jump: Jump | null;
  score: number;
  /** Successful forward landings. */
  hops: number;
  /** Fish collected. */
  fish: number;
}

/** Charge → launch velocity. Both components grow linearly with charge. */
export function chargeToVelocity(charge: number): { vx: number; vy: number } {
  const c = Math.max(0, Math.min(1, charge));
  return { vx: MIN_VX + c * (MAX_VX - MIN_VX), vy: MIN_VY + c * (MAX_VY - MIN_VY) };
}

/**
 * Horizontal distance of a jump that lands back at launch height —
 * d = 2·vx·vy / g. Strictly increasing in charge (product of two
 * increasing positive terms), which is what makes the timing readable.
 */
export function flatJumpDistance(charge: number): number {
  const { vx, vy } = chargeToVelocity(charge);
  return (2 * vx * vy) / GRAVITY;
}

export function maxFlatDistance(): number {
  return flatJumpDistance(1);
}

/**
 * The platform after `prev` (its 0-based sequence `index` drives the
 * difficulty ramp): widths shrink toward MIN_W, gaps grow toward MAX_GAP,
 * both jittered by the injected rand but always bounded — and the gap is
 * additionally clamped so the next platform's near edge stays reachable at
 * full charge even from the far-left edge of `prev`.
 */
export function nextPlatform(prev: Platform, index: number, rand: Rand): Platform {
  const targetW = Math.max(MIN_W, START_W - index * 1.2);
  const w = Math.max(MIN_W, Math.min(MAX_W, targetW + (rand() * 2 - 1) * 8));
  const baseGap = Math.min(MAX_GAP, MIN_GAP + 12 + index * 1.4);
  let gap = Math.max(MIN_GAP, Math.min(MAX_GAP, baseGap + (rand() * 2 - 1) * 18));
  gap = Math.min(gap, maxFlatDistance() - prev.w - 16);
  const fish = index > 2 && rand() < FISH_CHANCE;
  return { x: prev.x + prev.w + gap, w, fish };
}

/** Keep a lookahead of upcoming platforms generated past the cat. */
function ensurePlatforms(state: PogoState, rand: Rand): void {
  while (state.platforms.length - 1 - state.current < 6) {
    const last = state.platforms[state.platforms.length - 1]!;
    state.platforms.push(nextPlatform(last, state.platforms.length, rand));
  }
}

export function createPogo(rand: Rand): PogoState {
  const first: Platform = { x: 30, w: 110, fish: false };
  const state: PogoState = {
    platforms: [first],
    current: 0,
    catX: first.x + first.w / 2,
    phase: 'idle',
    charge: 0,
    chargeDir: 1,
    jump: null,
    score: 0,
    hops: 0,
    fish: 0,
  };
  ensurePlatforms(state, rand);
  return state;
}

/** Player pressed: begin charging (only from idle). */
export function startCharge(state: PogoState): void {
  if (state.phase !== 'idle') return;
  state.phase = 'charging';
  state.charge = 0;
  state.chargeDir = 1;
}

/** Advance the ping-pong charge meter (dt in 60fps-frame units). */
export function tickCharge(state: PogoState, dt: number): void {
  if (state.phase !== 'charging') return;
  let c = state.charge + state.chargeDir * CHARGE_SPEED * dt;
  if (c >= 1) {
    c = 1;
    state.chargeDir = -1;
  } else if (c <= 0) {
    c = 0;
    state.chargeDir = 1;
  }
  state.charge = c;
}

/** Player released: leap with the velocity mapped from the current charge. */
export function releaseJump(state: PogoState): void {
  if (state.phase !== 'charging') return;
  const { vx, vy } = chargeToVelocity(state.charge);
  state.jump = { x: state.catX, y: PLATFORM_Y, vx, vy: -vy };
  state.phase = 'jumping';
}

/** First platform at or after `from` whose span contains x, else -1. */
export function landingIndex(x: number, platforms: Platform[], from: number): number {
  for (let i = from; i < platforms.length; i++) {
    const p = platforms[i]!;
    if (x >= p.x && x <= p.x + p.w) return i;
  }
  return -1;
}

export type JumpOutcome = 'air' | 'landed' | 'fell';

/**
 * Integrate one step of the arc (exact kinematic sampling of the parabola).
 * On the frame the cat descends through platform height, the crossing point
 * is interpolated and checked against platform spans: inside a span lands
 * (scoring +1 per platform advanced, +FISH_BONUS for a fish), a gap keeps
 * falling until FALL_LIMIT → dead.
 */
export function stepJump(state: PogoState, dt: number, rand: Rand): JumpOutcome {
  const j = state.jump;
  if (!j || state.phase !== 'jumping') return 'air';
  const prevX = j.x;
  const prevY = j.y;
  j.x += j.vx * dt;
  j.y += j.vy * dt + 0.5 * GRAVITY * dt * dt;
  j.vy += GRAVITY * dt;

  if (j.vy > 0 && prevY < PLATFORM_Y && j.y >= PLATFORM_Y) {
    const t = (PLATFORM_Y - prevY) / (j.y - prevY);
    const landX = prevX + (j.x - prevX) * t;
    const idx = landingIndex(landX, state.platforms, state.current);
    if (idx >= 0) {
      const advanced = idx - state.current;
      state.current = idx;
      state.catX = landX;
      state.phase = 'idle';
      state.jump = null;
      state.charge = 0;
      state.chargeDir = 1;
      if (advanced > 0) {
        state.hops += 1;
        state.score += advanced;
        const p = state.platforms[idx]!;
        if (p.fish) {
          p.fish = false;
          state.fish += 1;
          state.score += FISH_BONUS;
        }
        ensurePlatforms(state, rand);
      }
      return 'landed';
    }
    // Crossed platform height over a gap — keep falling.
  }

  if (j.y > FALL_LIMIT) {
    state.phase = 'dead';
    return 'fell';
  }
  return 'air';
}

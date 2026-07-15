import {
  SUMO_MAP_GEOMETRY,
  SUMO_MIN_RADIUS,
  SUMO_SHRINK_DURATION_TICKS,
  SUMO_SPIN_MAX,
  SUMO_TOP_RADIUS,
  SUMO_WORLD,
  type SumoSettings,
} from '@shared/sumo';
import type { BotDifficulty } from '@shared/settings';
import type { GameEvent } from '@shared/view';
import { mulberry32 } from '../../engine/rng';
import type { SeatInit } from '../GameModule';

/** Movement tuning (world units per 50ms tick). */
const ACCEL = 5.5;
const FRICTION = 0.88;
/** Collision juice: outgoing normal speed multiplier. */
const RESTITUTION = 1.5;
/** Flat pop added to every contact so even slow bumps have punch. */
const BUMP_BASE = 4;
/** Sideways curl imparted by the opponent's rotation on contact. */
const SPIN_TANGENT = 4.5;
/** Ambient spin-down per tick (~0.4/s) — impacts are the real drain. */
const SPIN_DECAY = 0.02;
/** Spin lost per unit of approach speed: attackers shrug, defenders bleed. */
const SPIN_COST_ATTACKER = 0.08;
const SPIN_COST_DEFENDER = 0.18;
/** Ticks the last hitter keeps knockout credit. */
const KO_CREDIT_TICKS = 40;
/** Respawn choreography: wait off-field, then return as a ghost. */
const RESPAWN_WAIT_TICKS = 30;
const GHOST_TICKS = 24;
/** Bots re-aim every few ticks (human-ish reaction time). */
const BOT_THINK_TICKS = 4;

const CENTER = SUMO_WORLD / 2;

export interface SumoTop {
  seat: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Held steering input, magnitude ≤ 1. */
  inX: number;
  inY: number;
  alive: boolean;
  eliminated: boolean;
  lives: number;
  kos: number;
  /** Rotation charge, 0..SUMO_SPIN_MAX — drives hit power and stability. */
  spin: number;
  ghostTicks: number;
  respawnTicks: number;
  lastHitBy: number;
  lastHitTick: number;
  isBot: boolean;
  botDifficulty?: BotDifficulty;
}

export interface SumoState {
  settings: SumoSettings;
  playerCount: number;
  round: number;
  rng: () => number;
  tick: number;
  players: SumoTop[];
  baseRadius: number;
  holeRadius: number;
  over: boolean;
  winnerSeats: number[];
  /** Per-pair clash sound cooldown (key = a*8+b). */
  clashCooldown: Map<number, number>;
}

/** Evenly spaced spawn spot for a seat, at 62% of the current radius. */
export function spawnPoint(s: SumoState, seat: number): { x: number; y: number } {
  const angle = (seat / s.playerCount) * Math.PI * 2 - Math.PI / 2;
  const r = Math.max(currentRadius(s) * 0.62, s.holeRadius + SUMO_TOP_RADIUS * 2);
  return { x: CENTER + Math.cos(angle) * r, y: CENTER + Math.sin(angle) * r };
}

export function newSumoGame(
  settings: SumoSettings,
  playerCount: number,
  round: number,
  seed: number,
  seats: SeatInit[],
): SumoState {
  const geo = SUMO_MAP_GEOMETRY[settings.map];
  const s: SumoState = {
    settings: { ...settings },
    playerCount,
    round,
    rng: mulberry32(seed),
    tick: 0,
    players: [],
    baseRadius: geo.radius,
    holeRadius: geo.hole,
    over: false,
    winnerSeats: [],
    clashCooldown: new Map(),
  };
  for (let seat = 0; seat < playerCount; seat++) {
    const p: SumoTop = {
      seat,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      inX: 0,
      inY: 0,
      alive: true,
      eliminated: false,
      lives: settings.mode === 'lives' ? settings.lives : 0,
      kos: 0,
      spin: SUMO_SPIN_MAX,
      ghostTicks: 0,
      respawnTicks: 0,
      lastHitBy: -1,
      lastHitTick: -1_000,
      isBot: seats[seat]?.isBot ?? false,
      botDifficulty: seats[seat]?.botDifficulty,
    };
    const spawn = spawnPoint(s, seat);
    p.x = spawn.x;
    p.y = spawn.y;
    s.players.push(p);
  }
  return s;
}

/** Lives mode shrinks the ring after the countdown; countdown mode never does. */
export function currentRadius(s: SumoState): number {
  if (s.settings.mode !== 'lives') return s.baseRadius;
  const startTick = s.settings.shrinkAfterSeconds * 20;
  if (s.tick <= startTick) return s.baseRadius;
  const t = Math.min((s.tick - startTick) / SUMO_SHRINK_DURATION_TICKS, 1);
  return s.baseRadius - (s.baseRadius - SUMO_MIN_RADIUS) * t;
}

export function setStick(s: SumoState, seat: number, x: number, y: number): void {
  const p = s.players[seat];
  if (!p || s.over) return;
  const mag = Math.hypot(x, y);
  const k = mag > 1 ? 1 / mag : 1;
  p.inX = x * k;
  p.inY = y * k;
}

/** Is the point off the playable ring (out the rim, or down the donut hole)? */
function offField(s: SumoState, x: number, y: number): boolean {
  const d = Math.hypot(x - CENTER, y - CENTER);
  if (d > currentRadius(s)) return true;
  return s.holeRadius > 0 && d < s.holeRadius;
}

function knockOut(s: SumoState, p: SumoTop, events: GameEvent[]): void {
  p.alive = false;
  p.vx = 0;
  p.vy = 0;
  p.inX = 0;
  p.inY = 0;
  const credit =
    s.tick - p.lastHitTick <= KO_CREDIT_TICKS && p.lastHitBy >= 0 ? p.lastHitBy : null;
  if (credit !== null) s.players[credit]!.kos += 1;
  events.push({ t: 'ko', seat: p.seat, by: credit });

  if (s.settings.mode === 'lives') {
    p.lives -= 1;
    if (p.lives <= 0) {
      p.eliminated = true;
      events.push({ t: 'death', seat: p.seat, fatal: true });
      return;
    }
  }
  p.respawnTicks = RESPAWN_WAIT_TICKS;
}

function respawn(s: SumoState, p: SumoTop): void {
  const spot = spawnPoint(s, p.seat);
  p.x = spot.x;
  p.y = spot.y;
  p.vx = 0;
  p.vy = 0;
  p.alive = true;
  p.ghostTicks = GHOST_TICKS;
  p.lastHitBy = -1;
  p.lastHitTick = -1_000;
  p.spin = SUMO_SPIN_MAX; // a fresh launch spins at full power
}

function settleWinners(s: SumoState, events: GameEvent[]): void {
  s.over = true;
  for (const w of s.winnerSeats) events.push({ t: 'win', seat: w, by: 'lastStanding' });
  if (s.winnerSeats.length === 0) events.push({ t: 'gameOver' });
}

// ── bots ────────────────────────────────────────────────────────────────────

/**
 * Bot steering. All difficulties respect the rim; better ones hunt smarter:
 *  - easy: drifts near the center, occasionally lunging at someone.
 *  - medium: chases the nearest live opponent, bails toward center near the edge.
 *  - hard: attacks whoever is closest to the rim along the push-out vector,
 *    and repositions through the middle when out of position.
 */
function botSteer(s: SumoState, p: SumoTop): void {
  const radius = currentRadius(s);
  const cx = p.x - CENTER;
  const cy = p.y - CENTER;
  const myDist = Math.hypot(cx, cy);
  const toCenterX = myDist > 1 ? -cx / myDist : 0;
  const toCenterY = myDist > 1 ? -cy / myDist : 0;
  const diff = p.botDifficulty ?? 'medium';

  // Momentum-aware danger checks: judge where we'll BE, not where we are.
  const lookX = p.x + p.vx * 5;
  const lookY = p.y + p.vy * 5;
  const lookDist = Math.hypot(lookX - CENTER, lookY - CENTER);

  // Sliding toward the hole: steer straight away from the center.
  if (s.holeRadius > 0 && lookDist < s.holeRadius + SUMO_TOP_RADIUS * 2.2) {
    p.inX = -toCenterX;
    p.inY = -toCenterY;
    return;
  }
  // Sliding toward the rim: brake hard toward the center.
  if (lookDist > radius * (diff === 'hard' ? 0.78 : 0.7)) {
    p.inX = toCenterX;
    p.inY = toCenterY;
    return;
  }

  const foes = s.players.filter((o) => o.seat !== p.seat && o.alive && o.ghostTicks === 0);
  if (foes.length === 0) {
    p.inX = toCenterX * 0.6;
    p.inY = toCenterY * 0.6;
    return;
  }

  let target = foes[0]!;
  if (diff === 'hard') {
    // Prefer the foe flirting with the rim — and wobbly, spin-drained prey.
    const rank = (o: SumoTop) =>
      Math.hypot(o.x - CENTER, o.y - CENTER) / radius -
      Math.hypot(o.x - p.x, o.y - p.y) / 2000 +
      (1 - o.spin / SUMO_SPIN_MAX) * 0.3;
    target = foes.reduce((best, o) => (rank(o) > rank(best) ? o : best));
  } else {
    target = foes.reduce((best, o) =>
      Math.hypot(o.x - p.x, o.y - p.y) < Math.hypot(best.x - p.x, best.y - p.y) ? o : best,
    );
  }

  let aimX = target.x;
  let aimY = target.y;
  if (diff === 'hard') {
    // Line up behind the target relative to the rim: push them outward.
    const tx = target.x - CENTER;
    const ty = target.y - CENTER;
    const td = Math.hypot(tx, ty) || 1;
    aimX = target.x + (tx / td) * SUMO_TOP_RADIUS * 1.2;
    aimY = target.y + (ty / td) * SUMO_TOP_RADIUS * 1.2;
  }

  let dx = aimX - p.x;
  let dy = aimY - p.y;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;

  // Donut maps: if the straight attack line crosses the hole, skirt around it.
  if (s.holeRadius > 0) {
    const t = Math.max(
      0,
      Math.min(1, ((CENTER - p.x) * (aimX - p.x) + (CENTER - p.y) * (aimY - p.y)) / (d * d)),
    );
    const nearX = p.x + (aimX - p.x) * t;
    const nearY = p.y + (aimY - p.y) * t;
    const clearance = Math.hypot(nearX - CENTER, nearY - CENTER);
    if (clearance < s.holeRadius + SUMO_TOP_RADIUS * 1.5) {
      // Deflect toward the side of the hole the path already favors.
      let px = nearX - CENTER;
      let py = nearY - CENTER;
      const pm = Math.hypot(px, py) || 1;
      px /= pm;
      py /= pm;
      const mixX = dx * 0.45 + px;
      const mixY = dy * 0.45 + py;
      const mm = Math.hypot(mixX, mixY) || 1;
      dx = mixX / mm;
      dy = mixY / mm;
    }
  }

  if (diff === 'easy') {
    // Half-hearted: mostly hover, sometimes commit.
    const lunge = Math.floor(s.tick / 40) % 3 === 0;
    p.inX = lunge ? dx : toCenterX * 0.5 + (s.rng() - 0.5) * 0.6;
    p.inY = lunge ? dy : toCenterY * 0.5 + (s.rng() - 0.5) * 0.6;
    return;
  }
  p.inX = dx;
  p.inY = dy;
}

// ── the clock ───────────────────────────────────────────────────────────────

export function sumoTick(s: SumoState): { events: GameEvent[]; changed: boolean } {
  const events: GameEvent[] = [];
  if (s.over) return { events, changed: false };
  s.tick++;

  for (const p of s.players) {
    if (p.isBot && p.alive && s.tick % BOT_THINK_TICKS === p.seat % BOT_THINK_TICKS) {
      botSteer(s, p);
    }
  }

  // Integrate motion. A weary top steers sluggishly; rotation ebbs with time.
  for (const p of s.players) {
    if (!p.alive) {
      if (!p.eliminated && p.respawnTicks > 0 && --p.respawnTicks === 0) respawn(s, p);
      continue;
    }
    if (p.ghostTicks > 0) p.ghostTicks--;
    p.spin = Math.max(0, p.spin - SPIN_DECAY);
    const grip = 0.55 + 0.45 * (p.spin / SUMO_SPIN_MAX);
    p.vx = (p.vx + p.inX * ACCEL * grip) * FRICTION;
    p.vy = (p.vy + p.inY * ACCEL * grip) * FRICTION;
    p.x += p.vx;
    p.y += p.vy;
  }

  // Circle-vs-circle collisions. Rotation is the whole fight now: spin scales
  // the knockback you deal (power) and shrug off (stability), every contact
  // pops (BUMP_BASE), the opponent's rotation drags you sideways (the curl),
  // and impacts drain spin — defenders bleed harder than attackers.
  for (let i = 0; i < s.players.length; i++) {
    const a = s.players[i]!;
    if (!a.alive || a.ghostTicks > 0) continue;
    for (let j = i + 1; j < s.players.length; j++) {
      const b = s.players[j]!;
      if (!b.alive || b.ghostTicks > 0) continue;
      let nx = b.x - a.x;
      let ny = b.y - a.y;
      const dist = Math.hypot(nx, ny);
      const minDist = SUMO_TOP_RADIUS * 2;
      if (dist >= minDist || dist === 0) continue;
      nx /= dist;
      ny /= dist;
      // Separate the overlap evenly.
      const push = (minDist - dist) / 2;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
      const va = a.vx * nx + a.vy * ny;
      const vb = b.vx * nx + b.vy * ny;
      if (va - vb <= 0) continue; // already separating

      const spinA = a.spin / SUMO_SPIN_MAX;
      const spinB = b.spin / SUMO_SPIN_MAX;
      const powerA = 0.5 + 0.5 * spinA;
      const powerB = 0.5 + 0.5 * spinB;
      const stabilityA = 0.6 + 0.4 * spinA;
      const stabilityB = 0.6 + 0.4 * spinB;

      // Exchange normal velocity, amplified, plus the flat pop — each side
      // scaled by the striker's power against the receiver's stability.
      const dA = (vb * RESTITUTION - va - BUMP_BASE) * (powerB / stabilityA);
      const dB = (va * RESTITUTION - vb + BUMP_BASE) * (powerA / stabilityB);
      a.vx += dA * nx;
      a.vy += dA * ny;
      b.vx += dB * nx;
      b.vy += dB * ny;

      // Both tops rotate the same way, so the contact point sweeps each of
      // them toward opposite tangents — hits curl instead of ping straight.
      const tx = -ny;
      const ty = nx;
      a.vx -= tx * SPIN_TANGENT * spinB;
      a.vy -= ty * SPIN_TANGENT * spinB;
      b.vx += tx * SPIN_TANGENT * spinA;
      b.vy += ty * SPIN_TANGENT * spinA;

      // Impact grinds rotation away: A (faster along the normal) is the
      // attacker here, B the defender.
      const approach = va - vb;
      a.spin = Math.max(0, a.spin - approach * SPIN_COST_ATTACKER);
      b.spin = Math.max(0, b.spin - approach * SPIN_COST_DEFENDER);

      a.lastHitBy = b.seat;
      a.lastHitTick = s.tick;
      b.lastHitBy = a.seat;
      b.lastHitTick = s.tick;
      const key = i * 8 + j;
      if ((s.clashCooldown.get(key) ?? -100) + 10 <= s.tick && approach > 18) {
        s.clashCooldown.set(key, s.tick);
        events.push({ t: 'clash' });
      }
    }
  }

  // Ring-outs.
  for (const p of s.players) {
    if (p.alive && offField(s, p.x, p.y)) knockOut(s, p, events);
  }

  // End conditions.
  if (s.settings.mode === 'lives') {
    const standing = s.players.filter((p) => !p.eliminated);
    if (standing.length <= 1) {
      s.winnerSeats = standing.map((p) => p.seat);
      settleWinners(s, events);
    }
  } else if (s.tick >= s.settings.matchSeconds * 20) {
    const top = Math.max(...s.players.map((p) => p.kos));
    s.winnerSeats = top > 0 ? s.players.filter((p) => p.kos === top).map((p) => p.seat) : [];
    settleWinners(s, events);
  }

  return { events, changed: true };
}

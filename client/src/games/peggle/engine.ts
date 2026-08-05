import { mulberry32 } from '@shared/rng';

/**
 * Peggle-style peg shooter — pure engine, no DOM. The component drives
 * `step()` with fixed-dt substeps from rAF, but every rule (board
 * generation, ball physics, collisions, scoring, win/lose) lives here so
 * it's deterministic given the seed and the sequence of fired shots.
 *
 * Like Sand Play, this is deliberately NOT built on SoloGameModule: it's a
 * continuous physics game, not a discrete-move puzzle, so it records
 * results directly via recordResult()/flushOutbox() in the component.
 */

export const WIDTH = 400;
export const HEIGHT = 560;
export const PEG_RADIUS = 9;
export const BALL_RADIUS = 6;
/** Cannon zone — no pegs may intrude above this line. */
export const TOP_ZONE = 70;
/** Bucket lane — no pegs may intrude below HEIGHT - BOTTOM_ZONE. */
export const BOTTOM_ZONE = 60;

export const GRAVITY = 900; // px/s²
export const RESTITUTION = 0.75; // peg bounce energy retention
export const MAX_SPEED = 900; // px/s hard velocity clamp
export const LAUNCH_SPEED = 520; // px/s muzzle speed
/** Deterministic integration step (s). The component accumulates rAF time
 *  and calls step() in multiples of this. */
export const FIXED_DT = 1 / 240;

export const BALLS_PER_GAME = 10;
export const ORANGE_COUNT = 20;
/** The shared daily board is deliberately easier than endless — same
 *  reasoning as Sudoku's DAILY_REMOVE_TARGET: the daily is the low-friction
 *  everyone-plays-it ritual, not the challenge mode. Half the orange pegs
 *  with the same ball count gives real margin for a missed shot or two,
 *  instead of endless's ~2-pegs-per-ball, zero-margin requirement. */
export const DAILY_ORANGE_COUNT = 10;
export const PURPLE_COUNT = 2;
export const PEG_SCORE: Record<PegColor, number> = { blue: 10, orange: 100, purple: 500 };
export const WIN_BONUS_PER_BALL = 1000;

export const BUCKET_WIDTH = 72;
export const BUCKET_TOP = HEIGHT - 42;
export const BUCKET_SPEED = 110; // px/s sweep speed
export const CANNON_X = WIDTH / 2;
export const CANNON_Y = 36;

/** Minimum aim angle from horizontal (rad) — clamps shots to the downward
 *  hemisphere so the ball can never be fired back up out of play. */
const AIM_MIN = 0.15;

/** Minimum center-to-center distance between pegs (touching would be 2r). */
const MIN_PEG_DIST = PEG_RADIUS * 2 + 4;

export type PegColor = 'blue' | 'orange' | 'purple';

/** A lit peg dissolves this many seconds after being hit, so a ball resting
 *  on lit pegs always gets freed instead of sitting stuck forever. */
export const HIT_PEG_LIFETIME_S = 5;

export interface Peg {
  x: number;
  y: number;
  r: number;
  color: PegColor;
  /** Lit by the current shot; scored once; removed when the ball leaves play. */
  hit: boolean;
  /** Flight-clock time this peg was lit, for the dissolve timer. */
  hitAt: number | null;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

export interface Bucket {
  x: number;
  dir: 1 | -1;
}

/** Position snapshot of a peg lit during the last step() — for hit effects. */
export interface HitInfo {
  x: number;
  y: number;
  color: PegColor;
}

export type Status = 'aiming' | 'flying' | 'won' | 'lost';

export interface GameState {
  pegs: Peg[];
  /** null while aiming / after the game ends. One ball in flight at a time. */
  ball: Ball | null;
  bucket: Bucket;
  ballsLeft: number;
  score: number;
  orangeRemaining: number;
  status: Status;
  /** Seconds the current shot has been in flight (drives the peg dissolve). */
  flightTime: number;
  /** Pegs newly lit during the most recent step() call. */
  newHits: HitInfo[];
  /** Set when the ball left play during the most recent step() call. */
  shotEnded: 'caught' | 'exited' | null;
}

/* ── board generation ─────────────────────────────────────────────────── */

/** Region peg centers may occupy (keeps the full circle inside bounds and
 *  clear of the cannon zone and bucket lane). */
const FIELD = {
  left: 20,
  right: WIDTH - 20,
  top: TOP_ZONE + PEG_RADIUS + 6,
  bottom: HEIGHT - BOTTOM_ZONE - PEG_RADIUS - 6,
};

interface Pt {
  x: number;
  y: number;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** A circular arc of 8–12 pegs. */
function arcPattern(rand: () => number): Pt[] {
  const cx = 80 + rand() * (WIDTH - 160);
  const cy = FIELD.top + 60 + rand() * (FIELD.bottom - FIELD.top - 120);
  const radius = 55 + rand() * 60;
  const count = 8 + Math.floor(rand() * 5);
  const start = rand() * Math.PI * 2;
  const span = Math.PI * (0.7 + rand() * 0.9);
  const pts: Pt[] = [];
  for (let i = 0; i < count; i++) {
    const a = start + (i / (count - 1)) * span;
    pts.push({ x: cx + Math.cos(a) * radius, y: cy + Math.sin(a) * radius });
  }
  return pts;
}

/** 2–3 staggered rows of 6–8 pegs. */
function rowsPattern(rand: () => number): Pt[] {
  const rows = 2 + Math.floor(rand() * 2);
  const cols = 6 + Math.floor(rand() * 3);
  const spacingX = 34 + rand() * 14;
  const spacingY = 34 + rand() * 12;
  const w = (cols - 1) * spacingX + spacingX * 0.5;
  const x0 = FIELD.left + rand() * Math.max(1, FIELD.right - FIELD.left - w);
  const y0 = FIELD.top + rand() * Math.max(1, FIELD.bottom - FIELD.top - (rows - 1) * spacingY);
  const pts: Pt[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      pts.push({ x: x0 + c * spacingX + (r % 2) * spacingX * 0.5, y: y0 + r * spacingY });
    }
  }
  return pts;
}

/** A diamond lattice cluster of 13 pegs. */
function diamondPattern(rand: () => number): Pt[] {
  const cx = 90 + rand() * (WIDTH - 180);
  const cy = FIELD.top + 70 + rand() * (FIELD.bottom - FIELD.top - 140);
  const s = 26 + rand() * 8;
  const pts: Pt[] = [];
  for (let i = -2; i <= 2; i++) {
    for (let j = -2; j <= 2; j++) {
      if (Math.abs(i) + Math.abs(j) <= 2) {
        pts.push({ x: cx + (i - j) * s, y: cy + (i + j) * s * 0.7 });
      }
    }
  }
  return pts;
}

/**
 * Deterministic board: ~45–55 non-overlapping pegs from a seed-shuffled mix
 * of arcs, staggered rows, and diamond clusters, topped up with random
 * scatter. Exactly ORANGE_COUNT orange targets and PURPLE_COUNT purple
 * bonus pegs; the rest blue. Same seed → identical board (the shared daily
 * "Peggle Map").
 */
export function generateBoard(seed: number, orangeCount: number = ORANGE_COUNT): Peg[] {
  const rand = mulberry32(seed);
  const target = 45 + Math.floor(rand() * 11); // 45–55
  const patterns = shuffle(
    [arcPattern, rowsPattern, diamondPattern, arcPattern, rowsPattern, diamondPattern, arcPattern, rowsPattern],
    rand,
  );

  const placed: Pt[] = [];
  const tryPlace = (p: Pt): void => {
    if (placed.length >= target) return;
    if (p.x < FIELD.left || p.x > FIELD.right || p.y < FIELD.top || p.y > FIELD.bottom) return;
    for (const q of placed) {
      const dx = p.x - q.x;
      const dy = p.y - q.y;
      if (dx * dx + dy * dy < MIN_PEG_DIST * MIN_PEG_DIST) return;
    }
    placed.push(p);
  };

  for (const pattern of patterns) {
    if (placed.length >= target) break;
    for (const p of pattern(rand)) tryPlace(p);
  }
  // Top up with random scatter; the field is far larger than the packing
  // area needed, so this always reaches the target well within the guard.
  let guard = 0;
  while (placed.length < target && guard++ < 5000) {
    tryPlace({
      x: FIELD.left + rand() * (FIELD.right - FIELD.left),
      y: FIELD.top + rand() * (FIELD.bottom - FIELD.top),
    });
  }

  const order = shuffle(placed.map((_, i) => i), rand);
  const colors: PegColor[] = placed.map(() => 'blue');
  for (const i of order.slice(0, orangeCount)) colors[i] = 'orange';
  for (const i of order.slice(orangeCount, orangeCount + PURPLE_COUNT)) colors[i] = 'purple';

  return placed.map((p, i) => ({ x: p.x, y: p.y, r: PEG_RADIUS, color: colors[i]!, hit: false, hitAt: null }));
}

export function createGame(
  seed: number,
  orangeCount: number = ORANGE_COUNT,
  ballsPerGame: number = BALLS_PER_GAME,
): GameState {
  return {
    pegs: generateBoard(seed, orangeCount),
    ball: null,
    bucket: { x: (WIDTH - BUCKET_WIDTH) / 2, dir: 1 },
    ballsLeft: ballsPerGame,
    score: 0,
    orangeRemaining: orangeCount,
    status: 'aiming',
    flightTime: 0,
    newHits: [],
    shotEnded: null,
  };
}

/* ── aiming & firing ──────────────────────────────────────────────────── */

/**
 * Clamp an atan2-style angle (y-down coordinates) to the downward
 * hemisphere, at least AIM_MIN rad below horizontal on either side.
 */
export function clampAimAngle(angle: number): number {
  if (angle >= AIM_MIN && angle <= Math.PI - AIM_MIN) return angle;
  if (angle >= 0) return angle < Math.PI / 2 ? AIM_MIN : Math.PI - AIM_MIN;
  return angle > -Math.PI / 2 ? AIM_MIN : Math.PI - AIM_MIN;
}

/** Fire the ball from the cannon. Only while aiming with balls in stock —
 *  one ball in flight at a time. Returns whether the shot happened. */
export function fireBall(state: GameState, angle: number): boolean {
  if (state.status !== 'aiming' || state.ballsLeft <= 0) return false;
  const a = clampAimAngle(angle);
  state.ballsLeft -= 1;
  state.ball = {
    x: CANNON_X,
    y: CANNON_Y,
    vx: Math.cos(a) * LAUNCH_SPEED,
    vy: Math.sin(a) * LAUNCH_SPEED,
    r: BALL_RADIUS,
  };
  state.status = 'flying';
  state.flightTime = 0;
  return true;
}

/** Trajectory preview: the first ~maxDist px of flight (stops early at the
 *  first peg or wall contact). Pure — never mutates game state. */
export function traceAim(pegs: Peg[], angle: number, maxDist = 120): Pt[] {
  const a = clampAimAngle(angle);
  const ball: Ball = {
    x: CANNON_X,
    y: CANNON_Y,
    vx: Math.cos(a) * LAUNCH_SPEED,
    vy: Math.sin(a) * LAUNCH_SPEED,
    r: BALL_RADIUS,
  };
  const pts: Pt[] = [{ x: ball.x, y: ball.y }];
  let dist = 0;
  let guard = 0;
  while (dist < maxDist && guard++ < 400) {
    ball.vy += GRAVITY * FIXED_DT;
    const px = ball.x;
    const py = ball.y;
    ball.x += ball.vx * FIXED_DT;
    ball.y += ball.vy * FIXED_DT;
    dist += Math.hypot(ball.x - px, ball.y - py);
    pts.push({ x: ball.x, y: ball.y });
    if (ball.x < ball.r || ball.x > WIDTH - ball.r) break;
    const rr = ball.r + PEG_RADIUS;
    let contact = false;
    for (const peg of pegs) {
      const dx = ball.x - peg.x;
      const dy = ball.y - peg.y;
      if (dx * dx + dy * dy < rr * rr) {
        contact = true;
        break;
      }
    }
    if (contact) break;
  }
  return pts;
}

/* ── physics ──────────────────────────────────────────────────────────── */

/** Clamp the ball's speed to MAX_SPEED (mutates the ball). */
export function clampSpeed(ball: Ball): void {
  const s2 = ball.vx * ball.vx + ball.vy * ball.vy;
  if (s2 > MAX_SPEED * MAX_SPEED) {
    const s = Math.sqrt(s2);
    ball.vx *= MAX_SPEED / s;
    ball.vy *= MAX_SPEED / s;
  }
}

/**
 * Circle-circle collision: if the ball overlaps the peg, push it out along
 * the contact normal and reflect its velocity with RESTITUTION (only when
 * actually moving into the peg — a ball separating after a bounce isn't
 * re-reflected). Returns whether contact occurred. Mutates the ball only;
 * marking the peg hit / scoring is the caller's job.
 */
export function collideBallPeg(ball: Ball, peg: Peg): boolean {
  const dx = ball.x - peg.x;
  const dy = ball.y - peg.y;
  const rr = ball.r + peg.r;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 0.0001;
  const nx = dx / d;
  const ny = dy / d;
  ball.x = peg.x + nx * rr;
  ball.y = peg.y + ny * rr;
  const vn = ball.vx * nx + ball.vy * ny;
  if (vn < 0) {
    ball.vx -= (1 + RESTITUTION) * vn * nx;
    ball.vy -= (1 + RESTITUTION) * vn * ny;
  }
  return true;
}

/** The ball has left play (bucket or bottom). Removes lit pegs, refunds a
 *  caught ball, and settles win/lose. */
function endShot(state: GameState, caught: boolean): void {
  state.ball = null;
  state.pegs = state.pegs.filter((p) => !p.hit);
  if (caught) state.ballsLeft += 1;
  state.shotEnded = caught ? 'caught' : 'exited';
  if (state.orangeRemaining <= 0) {
    state.score += state.ballsLeft * WIN_BONUS_PER_BALL;
    state.status = 'won';
  } else if (state.ballsLeft <= 0) {
    state.status = 'lost';
  } else {
    state.status = 'aiming';
  }
}

/**
 * One fixed-dt physics step (mutates state). Always sweeps the bucket;
 * while a ball is in flight it integrates gravity, bounces off the side/top
 * walls, resolves peg collisions (lighting + scoring each peg exactly
 * once), clamps speed, and detects bucket catches and bottom exits.
 */
export function step(state: GameState, dt: number): void {
  state.newHits = [];
  state.shotEnded = null;

  const b = state.bucket;
  b.x += b.dir * BUCKET_SPEED * dt;
  if (b.x <= 0) {
    b.x = 0;
    b.dir = 1;
  } else if (b.x + BUCKET_WIDTH >= WIDTH) {
    b.x = WIDTH - BUCKET_WIDTH;
    b.dir = -1;
  }

  if (state.status !== 'flying' || !state.ball) return;
  const ball = state.ball;
  state.flightTime += dt;

  // Lit pegs dissolve after HIT_PEG_LIFETIME_S so a ball resting on them
  // can never be stuck for good (already scored — removal changes nothing).
  if (state.pegs.some((p) => p.hit && state.flightTime - (p.hitAt ?? 0) >= HIT_PEG_LIFETIME_S)) {
    state.pegs = state.pegs.filter((p) => !(p.hit && state.flightTime - (p.hitAt ?? 0) >= HIT_PEG_LIFETIME_S));
  }

  ball.vy += GRAVITY * dt;
  clampSpeed(ball);
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // Walls: left / right / top. The bottom is open (bucket or exit).
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.r > WIDTH) {
    ball.x = WIDTH - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  for (const peg of state.pegs) {
    if (collideBallPeg(ball, peg)) {
      if (!peg.hit) {
        peg.hit = true;
        peg.hitAt = state.flightTime;
        state.score += PEG_SCORE[peg.color];
        if (peg.color === 'orange') state.orangeRemaining -= 1;
        state.newHits.push({ x: peg.x, y: peg.y, color: peg.color });
      }
      clampSpeed(ball);
    }
  }

  // Free-ball bucket: falling into the opening refunds the ball.
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= BUCKET_TOP &&
    ball.y - ball.r < HEIGHT &&
    ball.x >= b.x &&
    ball.x <= b.x + BUCKET_WIDTH
  ) {
    endShot(state, true);
    return;
  }

  if (ball.y - ball.r > HEIGHT) endShot(state, false);
}

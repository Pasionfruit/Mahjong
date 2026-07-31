/**
 * Brick Breaker — pure engine (no DOM). A classic paddle/ball/bricks game:
 * procedural levels from a seeded generator, angle-of-incidence paddle
 * bounces, AABB brick collisions with proper side reflection, 3 lives.
 *
 * Like Sand Play, this is a continuous physics game, so it is NOT built on
 * SoloGameModule/useSoloGame (that abstraction assumes discrete replayable
 * moves). The component wires the result pipeline directly via
 * recordResult()/flushOutbox().
 *
 * All step functions mutate the passed state in place — the component owns
 * a single state object in a ref and calls stepFrame() from its rAF loop.
 * "Pure" here means: deterministic given (state, dt, rand), no DOM, no
 * globals, no wall-clock time.
 */

export const WIDTH = 380;
export const HEIGHT = 540;

export const PADDLE_W = 70;
export const PADDLE_H = 12;
/** Top edge of the paddle. */
export const PADDLE_Y = HEIGHT - 34;

export const BALL_R = 6;

export const BRICK_COLS = 9;
export const BRICK_W = 40;
export const BRICK_H = 16;
export const BRICK_OFFSET_X = (WIDTH - BRICK_COLS * BRICK_W) / 2;
export const BRICK_OFFSET_Y = 54;

export const START_LIVES = 3;
export const MAX_LIVES = 5;

/** Ball speed in px per 60fps frame. Each level starts slightly faster. */
export const BASE_SPEED = 4.0;
export const MAX_SPEED = 7.0;
export const LEVEL_SPEED_STEP = 0.25;
/** Every N paddle hits within a level, the ball speeds up a touch. */
export const PADDLE_HITS_PER_SPEEDUP = 4;
export const RALLY_SPEED_STEP = 0.12;

/** Max deflection off the paddle, measured from straight up (60°). */
export const MAX_BOUNCE_ANGLE = Math.PI / 3;

export const SCORE_PER_HIT = 10;
export const SCORE_PER_BRICK = 25;
export const LEVEL_CLEAR_BONUS = 100;

/** Frames a brick glows after being hit (visual only, decays in stepFrame). */
export const FLASH_FRAMES = 6;

export type Rand = () => number;

export interface Brick {
  x: number;
  y: number;
  w: number;
  h: number;
  hp: number;
  maxHp: number;
  /** Row index within the layout — drives the color in the component. */
  row: number;
  /** Frames of hit-flash remaining (cosmetic). */
  flash: number;
}

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface BrickBreakerState {
  ball: Ball;
  /** Ball riding the paddle, waiting for launch. */
  attached: boolean;
  /** Left edge of the paddle. */
  paddleX: number;
  bricks: Brick[];
  /** 1-based. */
  level: number;
  lives: number;
  score: number;
  bricksDestroyed: number;
  /** Paddle hits since the level started — drives the rally speed-up. */
  paddleHits: number;
  /** Current ball speed magnitude (px per 60fps frame). */
  speed: number;
  over: boolean;
}

export type LevelPattern = 'solid' | 'checker' | 'pyramid' | 'gaps';
const PATTERNS: LevelPattern[] = ['solid', 'checker', 'pyramid', 'gaps'];

/** Chance a generated brick needs 2 hits — climbs with level, bounded. */
export function twoHitChance(levelIndex: number): number {
  return Math.min(0.08 + levelIndex * 0.07, 0.55);
}

/** Starting ball speed for a level (0-based index), capped. */
export function levelSpeed(levelIndex: number): number {
  return Math.min(BASE_SPEED + levelIndex * LEVEL_SPEED_STEP, MAX_SPEED);
}

/**
 * Procedural layout for level `levelIndex` (0-based) using the injected
 * rand — same rand sequence, same layout. Patterns: solid rows, checker,
 * pyramid (widening downward), or random gaps. Later levels get more rows
 * and more 2-hit bricks.
 */
export function generateLevel(levelIndex: number, rand: Rand): Brick[] {
  const pattern = PATTERNS[Math.floor(rand() * PATTERNS.length)]!;
  const rows = Math.min(4 + Math.floor(levelIndex / 2), 7);
  const chance = twoHitChance(levelIndex);
  const center = (BRICK_COLS - 1) / 2;
  const bricks: Brick[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      let present = true;
      if (pattern === 'checker') present = (row + col) % 2 === 0;
      else if (pattern === 'pyramid') present = Math.abs(col - center) <= row + 1;
      else if (pattern === 'gaps') present = rand() >= 0.25;
      if (!present) continue;
      const hp = rand() < chance ? 2 : 1;
      bricks.push({
        x: BRICK_OFFSET_X + col * BRICK_W,
        y: BRICK_OFFSET_Y + row * BRICK_H,
        w: BRICK_W,
        h: BRICK_H,
        hp,
        maxHp: hp,
        row,
        flash: 0,
      });
    }
  }
  // A 'gaps' roll could in principle blank the whole board — guarantee a level.
  if (bricks.length === 0) {
    for (let col = 0; col < BRICK_COLS; col++) {
      bricks.push({
        x: BRICK_OFFSET_X + col * BRICK_W,
        y: BRICK_OFFSET_Y,
        w: BRICK_W,
        h: BRICK_H,
        hp: 1,
        maxHp: 1,
        row: 0,
        flash: 0,
      });
    }
  }
  return bricks;
}

export function createGame(rand: Rand): BrickBreakerState {
  const paddleX = WIDTH / 2 - PADDLE_W / 2;
  return {
    ball: { x: WIDTH / 2, y: PADDLE_Y - BALL_R, vx: 0, vy: 0 },
    attached: true,
    paddleX,
    bricks: generateLevel(0, rand),
    level: 1,
    lives: START_LIVES,
    score: 0,
    bricksDestroyed: 0,
    paddleHits: 0,
    speed: levelSpeed(0),
    over: false,
  };
}

export function clampPaddleX(x: number): number {
  return Math.max(0, Math.min(WIDTH - PADDLE_W, x));
}

/**
 * Outgoing velocity for a ball leaving the paddle: the bounce angle depends
 * on where the ball struck relative to the paddle center (edge hits deflect
 * up to MAX_BOUNCE_ANGLE from vertical), speed magnitude preserved.
 */
export function paddleBounceVelocity(ballX: number, paddleX: number, speed: number): { vx: number; vy: number } {
  const rel = Math.max(-1, Math.min(1, (ballX - (paddleX + PADDLE_W / 2)) / (PADDLE_W / 2)));
  const angle = rel * MAX_BOUNCE_ANGLE;
  return { vx: speed * Math.sin(angle), vy: -speed * Math.cos(angle) };
}

/**
 * Release an attached ball. Launch angle comes from the ball's offset on
 * the paddle (the ball rides the paddle center, so this is straight up
 * unless a `tilt` rand is supplied for a little variety: ±15° max).
 */
export function launchBall(state: BrickBreakerState, rand?: Rand): void {
  if (!state.attached || state.over) return;
  const base = paddleBounceVelocity(state.ball.x, state.paddleX, state.speed);
  const tilt = rand ? (rand() * 2 - 1) * (Math.PI / 12) : 0;
  const angle = Math.atan2(base.vx, -base.vy) + tilt;
  state.ball.vx = state.speed * Math.sin(angle);
  state.ball.vy = -state.speed * Math.cos(angle);
  state.attached = false;
}

/** Bounce off the side walls and ceiling, clamping back inside. */
export function reflectWalls(ball: Ball, width: number = WIDTH): boolean {
  let bounced = false;
  if (ball.x - BALL_R < 0) {
    ball.x = BALL_R;
    ball.vx = Math.abs(ball.vx);
    bounced = true;
  } else if (ball.x + BALL_R > width) {
    ball.x = width - BALL_R;
    ball.vx = -Math.abs(ball.vx);
    bounced = true;
  }
  if (ball.y - BALL_R < 0) {
    ball.y = BALL_R;
    ball.vy = Math.abs(ball.vy);
    bounced = true;
  }
  return bounced;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

/**
 * Circle-vs-AABB overlap test returning which face of the brick the ball
 * struck (the axis of least penetration), or null when not touching.
 */
export function brickCollisionSide(ball: Ball, brick: { x: number; y: number; w: number; h: number }): Side | null {
  const cx = brick.x + brick.w / 2;
  const cy = brick.y + brick.h / 2;
  const overlapX = brick.w / 2 + BALL_R - Math.abs(ball.x - cx);
  const overlapY = brick.h / 2 + BALL_R - Math.abs(ball.y - cy);
  if (overlapX <= 0 || overlapY <= 0) return null;
  if (overlapX < overlapY) return ball.x < cx ? 'left' : 'right';
  return ball.y < cy ? 'top' : 'bottom';
}

/** Push the ball out of the brick along the struck face and reflect it. */
export function resolveBrickBounce(ball: Ball, brick: { x: number; y: number; w: number; h: number }, side: Side): void {
  if (side === 'left') {
    ball.x = brick.x - BALL_R;
    ball.vx = -Math.abs(ball.vx);
  } else if (side === 'right') {
    ball.x = brick.x + brick.w + BALL_R;
    ball.vx = Math.abs(ball.vx);
  } else if (side === 'top') {
    ball.y = brick.y - BALL_R;
    ball.vy = -Math.abs(ball.vy);
  } else {
    ball.y = brick.y + brick.h + BALL_R;
    ball.vy = Math.abs(ball.vy);
  }
}

export interface StepResult {
  brickHits: number;
  destroyed: number;
  levelCleared: boolean;
  lifeLost: boolean;
  gameOver: boolean;
}

/**
 * One physics step (dt in 60fps-frame units; callers should keep dt ≤ 1 and
 * substep larger deltas — at MAX_SPEED a unit step cannot tunnel through a
 * brick or the paddle band). Handles ball motion, wall/paddle/brick
 * collisions, scoring, rally speed-up, and floor = life loss. Level
 * advancement is the caller's job (see advanceLevel) so the component can
 * react to `levelCleared`.
 */
export function stepFrame(state: BrickBreakerState, dt: number = 1): StepResult {
  const res: StepResult = { brickHits: 0, destroyed: 0, levelCleared: false, lifeLost: false, gameOver: false };
  for (const b of state.bricks) if (b.flash > 0) b.flash = Math.max(0, b.flash - dt);
  if (state.over) return res;

  const ball = state.ball;
  if (state.attached) {
    ball.x = state.paddleX + PADDLE_W / 2;
    ball.y = PADDLE_Y - BALL_R;
    return res;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  reflectWalls(ball);

  // Paddle: only while the ball is descending through the paddle band.
  if (
    ball.vy > 0 &&
    ball.y + BALL_R >= PADDLE_Y &&
    ball.y + BALL_R <= PADDLE_Y + PADDLE_H + 8 &&
    ball.x >= state.paddleX - BALL_R &&
    ball.x <= state.paddleX + PADDLE_W + BALL_R
  ) {
    state.paddleHits += 1;
    if (state.paddleHits % PADDLE_HITS_PER_SPEEDUP === 0) {
      state.speed = Math.min(state.speed + RALLY_SPEED_STEP, MAX_SPEED);
    }
    const v = paddleBounceVelocity(ball.x, state.paddleX, state.speed);
    ball.vx = v.vx;
    ball.vy = v.vy;
    ball.y = PADDLE_Y - BALL_R;
  }

  // Bricks: resolve at most one collision per step (avoids double reflections
  // when the ball grazes two bricks in the same frame).
  for (let i = 0; i < state.bricks.length; i++) {
    const brick = state.bricks[i];
    if (!brick) continue;
    const side = brickCollisionSide(ball, brick);
    if (!side) continue;
    resolveBrickBounce(ball, brick, side);
    brick.hp -= 1;
    brick.flash = FLASH_FRAMES;
    state.score += SCORE_PER_HIT;
    res.brickHits = 1;
    if (brick.hp <= 0) {
      state.bricks.splice(i, 1);
      state.score += SCORE_PER_BRICK;
      state.bricksDestroyed += 1;
      res.destroyed = 1;
      if (state.bricks.length === 0) res.levelCleared = true;
    }
    break;
  }

  // Floor: lose a life; last life ends the run.
  if (ball.y - BALL_R > HEIGHT) {
    state.lives -= 1;
    res.lifeLost = true;
    if (state.lives <= 0) {
      state.over = true;
      res.gameOver = true;
    } else {
      state.attached = true;
      ball.vx = 0;
      ball.vy = 0;
      ball.x = state.paddleX + PADDLE_W / 2;
      ball.y = PADDLE_Y - BALL_R;
    }
  }

  return res;
}

/**
 * Move to the next level after a clear: +100 bonus, +1 life every 3 levels
 * cleared (capped), fresh layout from the injected rand, slightly faster
 * ball, ball re-attached for launch.
 */
export function advanceLevel(state: BrickBreakerState, rand: Rand): void {
  state.score += LEVEL_CLEAR_BONUS;
  if (state.level % 3 === 0) state.lives = Math.min(state.lives + 1, MAX_LIVES);
  state.level += 1;
  state.speed = levelSpeed(state.level - 1);
  state.bricks = generateLevel(state.level - 1, rand);
  state.paddleHits = 0;
  state.attached = true;
  state.ball.vx = 0;
  state.ball.vy = 0;
  state.ball.x = state.paddleX + PADDLE_W / 2;
  state.ball.y = PADDLE_Y - BALL_R;
}

import { describe, expect, it } from 'vitest';
import { mulberry32 } from '@shared/rng';
import {
  BALL_R,
  BRICK_COLS,
  BRICK_OFFSET_X,
  BRICK_OFFSET_Y,
  HEIGHT,
  LEVEL_CLEAR_BONUS,
  MAX_LIVES,
  MAX_SPEED,
  PADDLE_HITS_PER_SPEEDUP,
  PADDLE_W,
  PADDLE_Y,
  RALLY_SPEED_STEP,
  SCORE_PER_BRICK,
  SCORE_PER_HIT,
  START_LIVES,
  WIDTH,
  advanceLevel,
  brickCollisionSide,
  clampPaddleX,
  createGame,
  generateLevel,
  launchBall,
  levelSpeed,
  paddleBounceVelocity,
  reflectWalls,
  resolveBrickBounce,
  stepFrame,
  twoHitChance,
  type Ball,
  type Brick,
  type BrickBreakerState,
} from './engine';

function ball(x: number, y: number, vx: number, vy: number): Ball {
  return { x, y, vx, vy };
}

function brick(x: number, y: number, hp = 1): Brick {
  return { x, y, w: 40, h: 16, hp, maxHp: hp, row: 0, flash: 0 };
}

function baseState(overrides: Partial<BrickBreakerState> = {}): BrickBreakerState {
  return {
    ball: ball(50, 200, 0, -4),
    attached: false,
    paddleX: WIDTH / 2 - PADDLE_W / 2,
    bricks: [],
    level: 1,
    lives: START_LIVES,
    score: 0,
    bricksDestroyed: 0,
    paddleHits: 0,
    speed: 4,
    over: false,
    ...overrides,
  };
}

describe('reflectWalls', () => {
  it('bounces off the left wall, clamping back inside', () => {
    const b = ball(2, 100, -3, 1);
    expect(reflectWalls(b)).toBe(true);
    expect(b.vx).toBe(3);
    expect(b.x).toBe(BALL_R);
  });

  it('bounces off the right wall', () => {
    const b = ball(WIDTH - 2, 100, 3, 1);
    expect(reflectWalls(b)).toBe(true);
    expect(b.vx).toBe(-3);
    expect(b.x).toBe(WIDTH - BALL_R);
  });

  it('bounces off the ceiling', () => {
    const b = ball(100, 2, 1, -3);
    expect(reflectWalls(b)).toBe(true);
    expect(b.vy).toBe(3);
    expect(b.y).toBe(BALL_R);
  });

  it('does nothing mid-field', () => {
    const b = ball(100, 100, 1, 1);
    expect(reflectWalls(b)).toBe(false);
    expect(b).toEqual(ball(101, 100, 1, 1) === b ? b : { x: 100, y: 100, vx: 1, vy: 1 });
  });
});

describe('paddleBounceVelocity', () => {
  const paddleX = 100;
  const center = paddleX + PADDLE_W / 2;

  it('sends a center hit straight up', () => {
    const v = paddleBounceVelocity(center, paddleX, 5);
    expect(v.vx).toBeCloseTo(0, 6);
    expect(v.vy).toBeCloseTo(-5, 6);
  });

  it('deflects toward the side that was hit', () => {
    expect(paddleBounceVelocity(center + 20, paddleX, 5).vx).toBeGreaterThan(0);
    expect(paddleBounceVelocity(center - 20, paddleX, 5).vx).toBeLessThan(0);
  });

  it('deflects more the farther from center the hit lands', () => {
    const near = paddleBounceVelocity(center + 8, paddleX, 5);
    const far = paddleBounceVelocity(center + 30, paddleX, 5);
    expect(far.vx).toBeGreaterThan(near.vx);
  });

  it('always bounces upward and preserves speed, even past the paddle edge', () => {
    for (const offset of [-60, -35, -10, 0, 10, 35, 60]) {
      const v = paddleBounceVelocity(center + offset, paddleX, 5);
      expect(v.vy).toBeLessThan(0);
      expect(Math.hypot(v.vx, v.vy)).toBeCloseTo(5, 6);
    }
  });
});

describe('brickCollisionSide', () => {
  const target = { x: 100, y: 100, w: 40, h: 16 };

  it('detects a hit on the left face', () => {
    expect(brickCollisionSide(ball(96, 108, 3, 0), target)).toBe('left');
  });

  it('detects a hit on the right face', () => {
    expect(brickCollisionSide(ball(144, 108, -3, 0), target)).toBe('right');
  });

  it('detects a hit on the top face', () => {
    expect(brickCollisionSide(ball(120, 97, 0, 3), target)).toBe('top');
  });

  it('detects a hit on the bottom face', () => {
    expect(brickCollisionSide(ball(120, 119, 0, -3), target)).toBe('bottom');
  });

  it('returns null when not touching', () => {
    expect(brickCollisionSide(ball(120, 200, 0, -3), target)).toBeNull();
    expect(brickCollisionSide(ball(40, 108, 3, 0), target)).toBeNull();
  });

  it('resolveBrickBounce reflects velocity away from the struck face', () => {
    const fromBelow = ball(120, 119, 1, -3);
    resolveBrickBounce(fromBelow, target, 'bottom');
    expect(fromBelow.vy).toBe(3);
    expect(fromBelow.y).toBe(target.y + target.h + BALL_R);

    const fromLeft = ball(96, 108, 3, 1);
    resolveBrickBounce(fromLeft, target, 'left');
    expect(fromLeft.vx).toBe(-3);
    expect(fromLeft.x).toBe(target.x - BALL_R);
  });
});

describe('stepFrame — bricks', () => {
  it('a 2-hit brick survives the first hit (tinted-darker HP) and dies on the second', () => {
    const s = baseState({ bricks: [brick(40, 80, 2)], ball: ball(60, 100, 0, -4) });
    let res = stepFrame(s);
    expect(res.brickHits).toBe(1);
    expect(res.destroyed).toBe(0);
    expect(s.bricks).toHaveLength(1);
    expect(s.bricks[0]!.hp).toBe(1);
    expect(s.bricks[0]!.flash).toBeGreaterThan(0);
    expect(s.score).toBe(SCORE_PER_HIT);
    expect(s.ball.vy).toBeGreaterThan(0); // reflected off the bottom face

    s.ball = ball(60, 100, 0, -4);
    res = stepFrame(s);
    expect(res.destroyed).toBe(1);
    expect(s.bricks).toHaveLength(0);
    expect(s.score).toBe(SCORE_PER_HIT * 2 + SCORE_PER_BRICK);
    expect(s.bricksDestroyed).toBe(1);
  });

  it('reports levelCleared when the last breakable brick is destroyed', () => {
    const s = baseState({ bricks: [brick(40, 80, 1)], ball: ball(60, 100, 0, -4) });
    const res = stepFrame(s);
    expect(res.destroyed).toBe(1);
    expect(res.levelCleared).toBe(true);
  });

  it('does not report levelCleared while bricks remain', () => {
    const s = baseState({ bricks: [brick(40, 80, 1), brick(200, 80, 1)], ball: ball(60, 100, 0, -4) });
    const res = stepFrame(s);
    expect(res.destroyed).toBe(1);
    expect(res.levelCleared).toBe(false);
    expect(s.bricks).toHaveLength(1);
  });
});

describe('stepFrame — paddle and floor', () => {
  it('bounces off the paddle with the angle set by the hit offset', () => {
    const s = baseState();
    const center = s.paddleX + PADDLE_W / 2;
    s.ball = ball(center + 20, PADDLE_Y - BALL_R - 1, 0, 4);
    stepFrame(s);
    expect(s.ball.vy).toBeLessThan(0);
    expect(s.ball.vx).toBeGreaterThan(0); // right-of-center hit deflects right
    expect(s.paddleHits).toBe(1);
  });

  it('speeds the ball up every PADDLE_HITS_PER_SPEEDUP paddle hits, capped', () => {
    const s = baseState({ speed: 4 });
    for (let i = 0; i < PADDLE_HITS_PER_SPEEDUP; i++) {
      s.ball = ball(s.paddleX + PADDLE_W / 2, PADDLE_Y - BALL_R - 1, 0, 4);
      stepFrame(s);
    }
    expect(s.speed).toBeCloseTo(4 + RALLY_SPEED_STEP, 6);
    expect(s.speed).toBeLessThanOrEqual(MAX_SPEED);
  });

  it('loses a life when the ball falls past the floor and re-attaches the ball', () => {
    const s = baseState({ lives: 3 });
    s.ball = ball(100, HEIGHT - 2, 0, 12);
    const res = stepFrame(s);
    expect(res.lifeLost).toBe(true);
    expect(res.gameOver).toBe(false);
    expect(s.lives).toBe(2);
    expect(s.attached).toBe(true);
    expect(s.over).toBe(false);
  });

  it('ends the game when the last life is lost', () => {
    const s = baseState({ lives: 1 });
    s.ball = ball(100, HEIGHT - 2, 0, 12);
    const res = stepFrame(s);
    expect(res.gameOver).toBe(true);
    expect(s.over).toBe(true);
    expect(s.lives).toBe(0);
  });

  it('an attached ball rides the paddle instead of moving', () => {
    const s = baseState({ attached: true, paddleX: 200 });
    stepFrame(s);
    expect(s.ball.x).toBe(200 + PADDLE_W / 2);
    expect(s.ball.y).toBe(PADDLE_Y - BALL_R);
  });
});

describe('launchBall', () => {
  it('releases the attached ball upward at the current speed', () => {
    const s = baseState({ attached: true, speed: 5 });
    stepFrame(s); // settle onto paddle center
    launchBall(s);
    expect(s.attached).toBe(false);
    expect(s.ball.vy).toBeLessThan(0);
    expect(Math.hypot(s.ball.vx, s.ball.vy)).toBeCloseTo(5, 6);
  });

  it('does nothing when the ball is already in flight', () => {
    const s = baseState({ attached: false });
    const before = { ...s.ball };
    launchBall(s);
    expect(s.ball).toEqual(before);
  });
});

describe('advanceLevel', () => {
  it('adds the clear bonus, bumps the level, regenerates bricks, and speeds up', () => {
    const rand = mulberry32(5);
    const s = baseState({ level: 1, score: 500, bricks: [] });
    advanceLevel(s, rand);
    expect(s.score).toBe(500 + LEVEL_CLEAR_BONUS);
    expect(s.level).toBe(2);
    expect(s.bricks.length).toBeGreaterThan(0);
    expect(s.speed).toBeCloseTo(levelSpeed(1), 6);
    expect(s.attached).toBe(true);
  });

  it('awards a bonus life every 3 levels cleared, capped at MAX_LIVES', () => {
    const bonus = baseState({ level: 3, lives: 3 });
    advanceLevel(bonus, mulberry32(1));
    expect(bonus.lives).toBe(4);
    expect(bonus.level).toBe(4);

    const noBonus = baseState({ level: 2, lives: 3 });
    advanceLevel(noBonus, mulberry32(1));
    expect(noBonus.lives).toBe(3);

    const capped = baseState({ level: 6, lives: MAX_LIVES });
    advanceLevel(capped, mulberry32(1));
    expect(capped.lives).toBe(MAX_LIVES);
  });
});

describe('generateLevel', () => {
  it('is deterministic for the same seeded rand', () => {
    for (const level of [0, 1, 3, 6]) {
      expect(generateLevel(level, mulberry32(42))).toEqual(generateLevel(level, mulberry32(42)));
    }
  });

  it('different seeds produce different layouts (across several levels)', () => {
    const a = [0, 1, 2, 3, 4].map((l) => generateLevel(l, mulberry32(7)));
    const b = [0, 1, 2, 3, 4].map((l) => generateLevel(l, mulberry32(8)));
    expect(JSON.stringify(a)).not.toEqual(JSON.stringify(b));
  });

  it('always yields at least one brick, inside the canvas, with hp 1 or 2', () => {
    for (let seed = 0; seed < 15; seed++) {
      for (let level = 0; level < 9; level++) {
        const bricks = generateLevel(level, mulberry32(seed * 31 + level));
        expect(bricks.length).toBeGreaterThan(0);
        for (const b of bricks) {
          expect(b.x).toBeGreaterThanOrEqual(BRICK_OFFSET_X);
          expect(b.x + b.w).toBeLessThanOrEqual(WIDTH - BRICK_OFFSET_X + 0.001);
          expect(b.y).toBeGreaterThanOrEqual(BRICK_OFFSET_Y);
          expect([1, 2]).toContain(b.hp);
          expect(b.hp).toBe(b.maxHp);
        }
      }
    }
  });

  it('two-hit chance ramps with level and stays bounded', () => {
    for (let i = 0; i < 20; i++) {
      expect(twoHitChance(i + 1)).toBeGreaterThanOrEqual(twoHitChance(i));
      expect(twoHitChance(i)).toBeLessThanOrEqual(0.55);
    }
    expect(twoHitChance(0)).toBeLessThan(0.15);
  });

  it('level speed ramps and is capped', () => {
    for (let i = 0; i < 30; i++) {
      expect(levelSpeed(i + 1)).toBeGreaterThanOrEqual(levelSpeed(i));
      expect(levelSpeed(i)).toBeLessThanOrEqual(MAX_SPEED);
    }
  });
});

describe('createGame / clampPaddleX', () => {
  it('starts with 3 lives, level 1, an attached ball, and a fresh layout', () => {
    const s = createGame(mulberry32(9));
    expect(s.lives).toBe(START_LIVES);
    expect(s.level).toBe(1);
    expect(s.attached).toBe(true);
    expect(s.bricks.length).toBeGreaterThan(0);
    expect(s.over).toBe(false);
  });

  it('clamps the paddle inside the canvas', () => {
    expect(clampPaddleX(-50)).toBe(0);
    expect(clampPaddleX(WIDTH)).toBe(WIDTH - PADDLE_W);
    expect(clampPaddleX(120)).toBe(120);
    expect(BRICK_COLS * 40 + BRICK_OFFSET_X * 2).toBe(WIDTH);
  });
});

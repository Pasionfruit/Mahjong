import { describe, expect, it } from 'vitest';
import {
  BALLS_PER_GAME,
  BOTTOM_ZONE,
  BUCKET_TOP,
  BUCKET_WIDTH,
  CANNON_X,
  CANNON_Y,
  FIXED_DT,
  HEIGHT,
  HIT_PEG_LIFETIME_S,
  MAX_SPEED,
  ORANGE_COUNT,
  PEG_RADIUS,
  PEG_SCORE,
  PURPLE_COUNT,
  TOP_ZONE,
  WIDTH,
  WIN_BONUS_PER_BALL,
  clampAimAngle,
  clampSpeed,
  collideBallPeg,
  createGame,
  fireBall,
  generateBoard,
  step,
  traceAim,
  type Ball,
  type GameState,
  type Peg,
} from './engine';

function peg(x: number, y: number, color: Peg['color'] = 'blue'): Peg {
  return { x, y, r: PEG_RADIUS, color, hit: false, hitAt: null };
}

/** Minimal hand-built state for physics tests — no generated board noise. */
function bareState(overrides: Partial<GameState> = {}): GameState {
  return {
    pegs: [],
    ball: null,
    bucket: { x: (WIDTH - BUCKET_WIDTH) / 2, dir: 1 },
    ballsLeft: 5,
    score: 0,
    orangeRemaining: 5,
    status: 'flying',
    flightTime: 0,
    newHits: [],
    shotEnded: null,
    ...overrides,
  };
}

function speed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vy);
}

describe('generateBoard', () => {
  it('is deterministic: the same seed always yields the identical board', () => {
    expect(generateBoard(1234)).toEqual(generateBoard(1234));
  });

  it('different seeds produce different boards', () => {
    expect(generateBoard(1)).not.toEqual(generateBoard(2));
  });

  it('places 45-55 pegs with exactly 20 orange and 2 purple, for many seeds', () => {
    for (let seed = 0; seed < 25; seed++) {
      const pegs = generateBoard(seed);
      expect(pegs.length).toBeGreaterThanOrEqual(45);
      expect(pegs.length).toBeLessThanOrEqual(55);
      expect(pegs.filter((p) => p.color === 'orange')).toHaveLength(ORANGE_COUNT);
      expect(pegs.filter((p) => p.color === 'purple')).toHaveLength(PURPLE_COUNT);
      expect(pegs.every((p) => !p.hit)).toBe(true);
    }
  });

  it('never overlaps pegs', () => {
    for (let seed = 0; seed < 25; seed++) {
      const pegs = generateBoard(seed);
      for (let i = 0; i < pegs.length; i++) {
        for (let j = i + 1; j < pegs.length; j++) {
          const a = pegs[i]!;
          const b = pegs[j]!;
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(a.r + b.r);
        }
      }
    }
  });

  it('keeps every peg inside the walls and clear of the cannon zone and bucket lane', () => {
    for (let seed = 0; seed < 25; seed++) {
      for (const p of generateBoard(seed)) {
        expect(p.x - p.r).toBeGreaterThanOrEqual(0);
        expect(p.x + p.r).toBeLessThanOrEqual(WIDTH);
        expect(p.y - p.r).toBeGreaterThanOrEqual(TOP_ZONE);
        expect(p.y + p.r).toBeLessThanOrEqual(HEIGHT - BOTTOM_ZONE);
      }
    }
  });
});

describe('createGame', () => {
  it('starts aiming with a full rack of balls and all orange targets standing', () => {
    const g = createGame(7);
    expect(g.status).toBe('aiming');
    expect(g.ball).toBeNull();
    expect(g.ballsLeft).toBe(BALLS_PER_GAME);
    expect(g.orangeRemaining).toBe(ORANGE_COUNT);
    expect(g.score).toBe(0);
    expect(g.pegs).toEqual(generateBoard(7));
  });
});

describe('clampAimAngle', () => {
  it('passes through angles already in the downward hemisphere', () => {
    expect(clampAimAngle(Math.PI / 2)).toBe(Math.PI / 2);
    expect(clampAimAngle(0.5)).toBe(0.5);
  });

  it('clamps upward or too-flat angles to the nearest downward edge', () => {
    const nearlyRight = clampAimAngle(0);
    const nearlyLeft = clampAimAngle(Math.PI);
    expect(nearlyRight).toBeGreaterThan(0);
    expect(nearlyLeft).toBeLessThan(Math.PI);
    // Up-right and up-left aims map to the corresponding downward edge.
    expect(clampAimAngle(-0.8)).toBe(nearlyRight);
    expect(clampAimAngle(-Math.PI + 0.3)).toBe(nearlyLeft);
    // Everything clamps into (0, PI): always some downward component.
    for (const a of [-3, -1.5, -0.1, 0, 3.1, Math.PI]) {
      const c = clampAimAngle(a);
      expect(Math.sin(c)).toBeGreaterThan(0);
    }
  });
});

describe('fireBall', () => {
  it('launches from the cannon, spends a ball, and blocks a second ball in flight', () => {
    const g = createGame(3);
    expect(fireBall(g, Math.PI / 2)).toBe(true);
    expect(g.status).toBe('flying');
    expect(g.ballsLeft).toBe(BALLS_PER_GAME - 1);
    expect(g.ball).not.toBeNull();
    expect(g.ball!.x).toBe(CANNON_X);
    expect(g.ball!.y).toBe(CANNON_Y);
    expect(g.ball!.vy).toBeGreaterThan(0);
    // One ball in flight at a time.
    expect(fireBall(g, Math.PI / 2)).toBe(false);
    expect(g.ballsLeft).toBe(BALLS_PER_GAME - 1);
  });

  it('does not fire once the game is over', () => {
    const g = createGame(3);
    g.status = 'lost';
    expect(fireBall(g, Math.PI / 2)).toBe(false);
    expect(g.ball).toBeNull();
  });
});

describe('walls', () => {
  it('reflects off the left wall', () => {
    const g = bareState({ ball: { x: 8, y: 200, vx: -300, vy: 0, r: 6 } });
    for (let i = 0; i < 10; i++) step(g, FIXED_DT);
    expect(g.ball!.vx).toBeGreaterThan(0);
    expect(g.ball!.x).toBeGreaterThanOrEqual(g.ball!.r);
  });

  it('reflects off the right wall', () => {
    const g = bareState({ ball: { x: WIDTH - 8, y: 200, vx: 300, vy: 0, r: 6 } });
    for (let i = 0; i < 10; i++) step(g, FIXED_DT);
    expect(g.ball!.vx).toBeLessThan(0);
    expect(g.ball!.x + g.ball!.r).toBeLessThanOrEqual(WIDTH);
  });

  it('reflects off the top wall', () => {
    const g = bareState({ ball: { x: 200, y: 8, vx: 0, vy: -400, r: 6 } });
    for (let i = 0; i < 10; i++) step(g, FIXED_DT);
    expect(g.ball!.vy).toBeGreaterThan(0);
    expect(g.ball!.y).toBeGreaterThanOrEqual(g.ball!.r);
  });
});

describe('peg collision', () => {
  it('reflects the ball with restitution and marks the peg hit exactly once', () => {
    const target = peg(200, 300, 'blue');
    const g = bareState({ pegs: [target], ball: { x: 200, y: 280, vx: 0, vy: 300, r: 6 } });
    let steps = 0;
    while (!target.hit && steps++ < 50) step(g, FIXED_DT);
    expect(target.hit).toBe(true);
    expect(g.score).toBe(PEG_SCORE.blue);
    // Head-on: the bounce reverses vertical velocity, scaled by restitution.
    expect(g.ball!.vy).toBeLessThan(0);
    // Further steps (even while still near the peg) never score it again.
    for (let i = 0; i < 50; i++) step(g, FIXED_DT);
    expect(g.score).toBe(PEG_SCORE.blue);
  });

  it('reports newly lit pegs via newHits for exactly one step', () => {
    const target = peg(200, 300, 'orange');
    const g = bareState({ pegs: [target], ball: { x: 200, y: 280, vx: 0, vy: 300, r: 6 } });
    let sawHit = 0;
    for (let i = 0; i < 50; i++) {
      step(g, FIXED_DT);
      sawHit += g.newHits.length;
    }
    expect(sawHit).toBe(1);
    expect(g.orangeRemaining).toBe(4);
  });

  it('collideBallPeg pushes the ball out of overlap and reflects only inbound velocity', () => {
    const p = peg(100, 100);
    const inbound: Ball = { x: 100, y: 92, vx: 0, vy: 250, r: 6 };
    expect(collideBallPeg(inbound, p)).toBe(true);
    expect(Math.hypot(inbound.x - p.x, inbound.y - p.y)).toBeCloseTo(inbound.r + p.r, 5);
    expect(inbound.vy).toBeLessThan(0); // reflected upward
    // A separating ball still in overlap is not re-reflected.
    const outbound: Ball = { x: 100, y: 92, vx: 0, vy: -250, r: 6 };
    expect(collideBallPeg(outbound, p)).toBe(true);
    expect(outbound.vy).toBe(-250);
  });

  it('hit pegs are removed once the ball leaves play, unhit pegs stay', () => {
    const hitPeg = peg(200, 300);
    const bystander = peg(60, 120); // parked far above anywhere the ball can reach
    const g = bareState({
      pegs: [hitPeg, bystander],
      // slightly off-center so the bounce rolls the ball off and out of play
      ball: { x: 203, y: 280, vx: 0, vy: 300, r: 6 },
      bucket: { x: 0, dir: 1 },
    });
    let steps = 0;
    while (g.shotEnded === null && steps++ < 5000) step(g, FIXED_DT);
    expect(g.shotEnded).not.toBeNull();
    expect(g.pegs).toEqual([bystander]);
  });
});

describe('bucket', () => {
  it('sweeps left-right within the board forever', () => {
    const g = bareState({ status: 'aiming' });
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < 5000; i++) {
      step(g, FIXED_DT);
      minX = Math.min(minX, g.bucket.x);
      maxX = Math.max(maxX, g.bucket.x);
      expect(g.bucket.x).toBeGreaterThanOrEqual(0);
      expect(g.bucket.x + BUCKET_WIDTH).toBeLessThanOrEqual(WIDTH);
    }
    // It actually traverses (reverses at both ends over ~20s of sweep).
    expect(minX).toBe(0);
    expect(maxX).toBe(WIDTH - BUCKET_WIDTH);
  });

  it('catching the ball refunds it and returns to aiming', () => {
    const g = bareState({
      bucket: { x: 100, dir: 1 },
      ballsLeft: 3,
      ball: { x: 136, y: BUCKET_TOP - 12, vx: 0, vy: 300, r: 6 },
    });
    let steps = 0;
    while (g.shotEnded === null && steps++ < 200) step(g, FIXED_DT);
    expect(g.shotEnded).toBe('caught');
    expect(g.ballsLeft).toBe(4); // refunded
    expect(g.status).toBe('aiming');
    expect(g.ball).toBeNull();
  });

  it('missing the bucket exits at the bottom without a refund', () => {
    const g = bareState({
      bucket: { x: 0, dir: 1 },
      ballsLeft: 3,
      ball: { x: 380, y: HEIGHT - 60, vx: 0, vy: 400, r: 6 },
    });
    let steps = 0;
    while (g.shotEnded === null && steps++ < 200) step(g, FIXED_DT);
    expect(g.shotEnded).toBe('exited');
    expect(g.ballsLeft).toBe(3);
    expect(g.status).toBe('aiming');
  });

  it('running out of balls without clearing orange is a loss', () => {
    const g = bareState({
      bucket: { x: 0, dir: 1 },
      ballsLeft: 0, // last ball already in flight
      orangeRemaining: 2,
      ball: { x: 380, y: HEIGHT - 60, vx: 0, vy: 400, r: 6 },
    });
    let steps = 0;
    while (g.shotEnded === null && steps++ < 200) step(g, FIXED_DT);
    expect(g.status).toBe('lost');
  });
});

describe('winning & scoring', () => {
  it('hitting the last orange peg wins when the ball leaves, with +1000 per unused ball', () => {
    const lastOrange = peg(380, 400, 'orange');
    const g = bareState({
      pegs: [lastOrange],
      bucket: { x: 0, dir: 1 },
      ballsLeft: 4,
      orangeRemaining: 1,
      score: 700,
      // slightly off-center so the ball rolls off the peg and exits (the
      // bucket, starting at x=0, cannot reach this corner before it lands)
      ball: { x: 383, y: 380, vx: 0, vy: 300, r: 6 },
    });
    let steps = 0;
    while (g.shotEnded === null && steps++ < 5000) step(g, FIXED_DT);
    expect(lastOrange.hit).toBe(true);
    expect(g.orangeRemaining).toBe(0);
    expect(g.status).toBe('won');
    expect(g.score).toBe(700 + PEG_SCORE.orange + 4 * WIN_BONUS_PER_BALL);
  });

  it('a bucket catch on the winning shot counts the refunded ball in the bonus', () => {
    const g = bareState({
      pegs: [],
      bucket: { x: 100, dir: 1 },
      ballsLeft: 2,
      orangeRemaining: 0, // final orange lit earlier in this flight
      score: 0,
      ball: { x: 136, y: BUCKET_TOP - 12, vx: 0, vy: 300, r: 6 },
    });
    let steps = 0;
    while (g.shotEnded === null && steps++ < 200) step(g, FIXED_DT);
    expect(g.shotEnded).toBe('caught');
    expect(g.status).toBe('won');
    expect(g.score).toBe(3 * WIN_BONUS_PER_BALL);
  });

  it('scores blue +10, orange +100, purple +500', () => {
    for (const color of ['blue', 'orange', 'purple'] as const) {
      const target = peg(200, 300, color);
      const g = bareState({ pegs: [target], ball: { x: 200, y: 280, vx: 0, vy: 300, r: 6 } });
      let steps = 0;
      while (!target.hit && steps++ < 50) step(g, FIXED_DT);
      expect(g.score).toBe(PEG_SCORE[color]);
    }
    expect(PEG_SCORE.blue).toBe(10);
    expect(PEG_SCORE.orange).toBe(100);
    expect(PEG_SCORE.purple).toBe(500);
  });
});

describe('speed clamp', () => {
  it('clampSpeed caps a runaway velocity, preserving direction', () => {
    const ball: Ball = { x: 0, y: 0, vx: 3000, vy: -4000, r: 6 };
    clampSpeed(ball);
    expect(speed(ball)).toBeCloseTo(MAX_SPEED, 6);
    expect(ball.vx).toBeGreaterThan(0);
    expect(ball.vy).toBeLessThan(0);
  });

  it('holds under sustained bouncing on a bed of pegs', () => {
    // A packed floor of pegs (gaps too narrow for the ball) keeps it
    // ricocheting under gravity for the whole run.
    const floor: Peg[] = [];
    for (let x = 12; x <= WIDTH - 12; x += 24) floor.push(peg(x, 480));
    const g = bareState({ pegs: floor, ball: { x: 137, y: 100, vx: 5000, vy: 4000, r: 6 } });
    let collisions = 0;
    for (let i = 0; i < 2000; i++) {
      step(g, FIXED_DT);
      if (g.shotEnded !== null || !g.ball) break;
      collisions += g.newHits.length;
      expect(speed(g.ball)).toBeLessThanOrEqual(MAX_SPEED + 1e-9);
    }
    expect(collisions).toBeGreaterThan(0);
  });
});

describe('traceAim', () => {
  it('starts at the cannon, heads downward, and covers about the requested distance', () => {
    const pts = traceAim([], Math.PI / 2, 120);
    expect(pts.length).toBeGreaterThan(3);
    expect(pts[0]).toEqual({ x: CANNON_X, y: CANNON_Y });
    let dist = 0;
    for (let i = 1; i < pts.length; i++) {
      dist += Math.hypot(pts[i]!.x - pts[i - 1]!.x, pts[i]!.y - pts[i - 1]!.y);
    }
    expect(dist).toBeGreaterThanOrEqual(120);
    expect(dist).toBeLessThan(140);
    expect(pts[pts.length - 1]!.y).toBeGreaterThan(CANNON_Y);
  });

  it('stops early at the first peg in the path', () => {
    const blocker = peg(CANNON_X, CANNON_Y + 60);
    const pts = traceAim([blocker], Math.PI / 2, 120);
    const last = pts[pts.length - 1]!;
    expect(Math.hypot(last.x - blocker.x, last.y - blocker.y)).toBeLessThan(60);
    expect(last.y).toBeLessThan(blocker.y);
  });
});

describe('stuck-ball rescue (hit pegs dissolve)', () => {
  it('a lit peg disappears HIT_PEG_LIFETIME_S after being hit, mid-flight', () => {
    // Ball dropped straight onto a peg: it gets hit, then the ball rests.
    const target = peg(WIDTH / 2, HEIGHT / 2);
    const s = bareState({
      pegs: [target],
      ball: { x: WIDTH / 2, y: HEIGHT / 2 - PEG_RADIUS - 4, vx: 0, vy: 10, r: 6 },
    });
    step(s, FIXED_DT);
    expect(target.hit).toBe(true);
    expect(target.hitAt).not.toBeNull();

    // Advance just under the lifetime: peg still present.
    while (s.flightTime < HIT_PEG_LIFETIME_S - FIXED_DT * 2 && s.ball) step(s, FIXED_DT);
    expect(s.pegs).toHaveLength(1);

    // Cross the threshold: the peg dissolves while the shot is still live,
    // and the freed ball eventually falls out of play, ending the shot.
    let guard = 0;
    while (s.pegs.length > 0 && guard++ < 10) step(s, FIXED_DT);
    expect(s.pegs).toHaveLength(0);
    guard = 0;
    while (s.ball && guard++ < 2000) step(s, FIXED_DT);
    expect(s.ball).toBeNull();
  });

  it('the dissolve never double-scores the peg', () => {
    const target = peg(WIDTH / 2, HEIGHT / 2);
    const s = bareState({
      pegs: [target],
      ball: { x: WIDTH / 2, y: HEIGHT / 2 - PEG_RADIUS - 4, vx: 0, vy: 10, r: 6 },
    });
    step(s, FIXED_DT);
    const scored = s.score;
    let guard = 0;
    while (s.pegs.length > 0 && guard++ < 2000) step(s, FIXED_DT);
    expect(s.score).toBe(scored);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOMBER_H, BOMBER_MAPS, BOMBER_W, DEFAULT_BOMBERMAN_SETTINGS } from '@shared/bomberman';
import { mulberry32 } from '../../engine/rng';
import { BRICK, FLOOR, WALL, buildMap, shrinkSpiral, spawnPoints } from './maps';
import {
  FUSE_TICKS,
  INVULN_TICKS,
  MOVE_COOLDOWN,
  RESPAWN_TICKS,
  SLOW_PENALTY,
  dropBomb,
  grabOrThrow,
  newGame,
  setInput,
  tick,
  type BombermanState,
} from './engine';
import { botThink } from './bot';
import { bombermanModule as m } from './index';

const W = BOMBER_W;
const idx = (x: number, y: number) => y * W + x;

function settings(overrides?: Partial<typeof DEFAULT_BOMBERMAN_SETTINGS>) {
  return { ...DEFAULT_BOMBERMAN_SETTINGS, suddenDeathSeconds: 0 as const, ...overrides };
}

/** Empty-floor arena for deterministic move/bomb tests. */
function openState(playerCount = 2): BombermanState {
  const s = newGame(settings(), playerCount, 1, 42);
  for (let i = 0; i < s.grid.length; i++) {
    const x = i % W;
    const y = Math.floor(i / W);
    const border = x === 0 || y === 0 || x === W - 1 || y === BOMBER_H - 1;
    s.grid[i] = border ? WALL : FLOOR;
    s.hidden[i] = null;
    s.floorPU[i] = null;
  }
  return s;
}

function ticks(s: BombermanState, n: number) {
  const all: ReturnType<typeof tick>[] = [];
  for (let i = 0; i < n; i++) all.push(tick(s));
  return all;
}

describe('bomberman maps', () => {
  for (const map of BOMBER_MAPS) {
    it(`${map}: borders are walls, spawns are clear, 8 spawns fit`, () => {
      const { grid, spawns } = buildMap(map, 8, 7);
      for (let x = 0; x < W; x++) {
        expect(grid[idx(x, 0)]).toBe(WALL);
        expect(grid[idx(x, BOMBER_H - 1)]).toBe(WALL);
      }
      expect(spawns).toHaveLength(8);
      const seen = new Set(spawns.map((s) => idx(s.x, s.y)));
      expect(seen.size).toBe(8);
      for (const { x, y } of spawns) expect(grid[idx(x, y)]).toBe(FLOOR);
    });
  }

  it('hides powerups only under bricks', () => {
    const { grid, hidden } = buildMap('classic', 4, 99);
    hidden.forEach((pu, i) => {
      if (pu) expect(grid[i]).toBe(BRICK);
    });
    expect(hidden.some((pu) => pu !== null)).toBe(true);
  });

  it('shrink spiral covers the interior except the 3×3 center', () => {
    const spiral = shrinkSpiral();
    const mx = Math.floor(W / 2);
    const my = Math.floor(BOMBER_H / 2);
    const center = [];
    for (let y = my - 1; y <= my + 1; y++) {
      for (let x = mx - 1; x <= mx + 1; x++) center.push(idx(x, y));
    }
    for (const c of center) expect(spiral).not.toContain(c);
    expect(spiral).toContain(idx(1, 1));
    // Outer ring precedes inner cells (spiral moves inward).
    expect(spiral.indexOf(idx(1, 1))).toBeLessThan(spiral.indexOf(idx(2, 2)));
  });
});

describe('bomberman engine', () => {
  it('moves with a cooldown, faster than when slowed', () => {
    const s = openState();
    const p = s.players[0]!;
    setInput(s, 0, 'right');
    ticks(s, 1);
    expect([p.x, p.y]).toEqual([2, 1]);
    ticks(s, MOVE_COOLDOWN - 1); // still cooling down
    expect(p.x).toBe(2);
    ticks(s, 1);
    expect(p.x).toBe(3);

    p.slowedUntil = s.tick + 1000;
    const x0 = p.x;
    ticks(s, MOVE_COOLDOWN + SLOW_PENALTY);
    expect(p.x).toBe(x0 + 1); // one step per slowed cooldown now
  });

  it('speed boots shorten the move cooldown', () => {
    const s = openState();
    const p = s.players[0]!;
    p.speed = 2;
    setInput(s, 0, 'right');
    ticks(s, 1); // first step is instant (cooldown 0)
    const x0 = p.x;
    ticks(s, MOVE_COOLDOWN - 2); // boots: cooldown is MOVE_COOLDOWN - speed
    expect(p.x).toBe(x0 + 1);
  });

  it('bombs block movement and explode after the fuse, killing bystanders', () => {
    const s = openState();
    const p0 = s.players[0]!;
    const p1 = s.players[1]!;
    p1.x = 3;
    p1.y = 1; // within blast range of (1,1)
    dropBomb(s, 0);
    expect(s.bombs).toHaveLength(1);

    // p1 can't walk onto the bomb cell.
    p1.x = 2;
    setInput(s, 1, 'left');
    ticks(s, 2);
    expect(p1.x).toBe(2);

    setInput(s, 1, null);
    const results = ticks(s, FUSE_TICKS);
    const events = results.flatMap((r) => r.events);
    expect(events.some((e) => e.t === 'boom')).toBe(true);
    expect(events.some((e) => e.t === 'death' && e.seat === 1)).toBe(true);
    expect(events.some((e) => e.t === 'death' && e.seat === 0)).toBe(true); // stood on it
    expect(s.over).toBe(true);
    expect(s.result).toEqual({ winnerSeat: null }); // mutual kill → draw
  });

  it('explosions destroy the first brick and stop — unless pierce', () => {
    const s = openState();
    const p = s.players[0]!;
    p.fire = 4;
    s.grid[idx(3, 1)] = BRICK;
    s.grid[idx(4, 1)] = BRICK;
    dropBomb(s, 0);
    p.x = 1;
    p.y = 3; // step out of the blast column
    ticks(s, FUSE_TICKS);
    expect(s.grid[idx(3, 1)]).toBe(FLOOR); // first brick destroyed
    expect(s.grid[idx(4, 1)]).toBe(BRICK); // ray stopped

    const s2 = openState();
    const q = s2.players[0]!;
    q.fire = 4;
    q.pierce = true;
    s2.grid[idx(3, 1)] = BRICK;
    s2.grid[idx(4, 1)] = BRICK;
    dropBomb(s2, 0);
    q.x = 1;
    q.y = 3;
    ticks(s2, FUSE_TICKS);
    expect(s2.grid[idx(3, 1)]).toBe(FLOOR);
    expect(s2.grid[idx(4, 1)]).toBe(FLOOR); // pierce chews through both
  });

  it('reveals a hidden powerup when its brick burns, and picking it up applies it', () => {
    const s = openState();
    const p = s.players[0]!;
    s.grid[idx(2, 1)] = BRICK;
    s.hidden[idx(2, 1)] = 'fire';
    dropBomb(s, 0);
    p.x = 3;
    p.y = 3; // fully outside the blast cross
    ticks(s, FUSE_TICKS + 12); // let the flames clear
    expect(s.floorPU[idx(2, 1)]).toBe('fire');

    p.x = 1;
    p.y = 1;
    const fire0 = p.fire;
    setInput(s, 0, 'right');
    ticks(s, 2);
    expect(p.fire).toBe(fire0 + 1);
    expect(s.floorPU[idx(2, 1)]).toBe(null);
  });

  it('slow powerup slows every other player, not the collector', () => {
    const s = openState(3);
    const p = s.players[0]!;
    s.floorPU[idx(2, 1)] = 'slow';
    setInput(s, 0, 'right');
    ticks(s, 2);
    expect(p.slowedUntil).toBe(0);
    expect(s.players[1]!.slowedUntil).toBeGreaterThan(s.tick);
    expect(s.players[2]!.slowedUntil).toBeGreaterThan(s.tick);
  });

  it('glove: picks up a bomb and throws it ahead of the player', () => {
    const s = openState();
    const p = s.players[0]!;
    p.glove = true;
    dropBomb(s, 0);
    grabOrThrow(s, 0); // pick up
    expect(s.bombs[0]!.carriedBySeat).toBe(0);

    p.facing = 'right';
    grabOrThrow(s, 0); // throw
    const b = s.bombs[0]!;
    expect(b.carriedBySeat).toBe(null);
    expect(b.x).toBe(p.x + 3);
    expect(b.y).toBe(p.y);
  });

  it('sudden death closes the arena and crushes stragglers', () => {
    const s = newGame(settings({ suddenDeathSeconds: 60 }), 2, 1, 5);
    // Fast-forward to the start of sudden death.
    s.tick = s.suddenDeathAtTick! - 1;
    s.nextShrinkTick = 0;
    const p = s.players[0]!; // spawned at (1,1) — the first spiral cell
    s.players[1]!.x = 7;
    s.players[1]!.y = 6;
    const results = ticks(s, 4);
    const events = results.flatMap((r) => r.events);
    expect(s.grid[idx(1, 1)]).toBe(WALL);
    expect(p.alive).toBe(false);
    expect(events.some((e) => e.t === 'death' && e.seat === 0)).toBe(true);
    expect(s.over).toBe(true);
    expect(s.result).toEqual({ winnerSeat: 1 });
  });
});

describe('bomberman lives & respawn', () => {
  it('with lives > 1, a death respawns at the corner with brief protection', () => {
    const s = openState();
    const p0 = s.players[0]!;
    const p1 = s.players[1]!;
    p0.lives = 2;
    p1.x = 9;
    p1.y = 9; // far from the blast
    dropBomb(s, 0); // stand on it
    const results = ticks(s, FUSE_TICKS + 1);
    const events = results.flatMap((r) => r.events);
    expect(events.some((e) => e.t === 'death' && e.seat === 0)).toBe(true);
    expect(s.over).toBe(false); // still has a life — game continues
    expect(p0.alive).toBe(true);
    expect(p0.respawnAtTick).not.toBe(null);

    ticks(s, RESPAWN_TICKS + 1);
    expect(p0.respawnAtTick).toBe(null);
    expect([p0.x, p0.y]).toEqual([p0.spawnX, p0.spawnY]);
    expect(p0.invulnUntil).toBeGreaterThan(s.tick); // spawn protection
    expect(p0.lives).toBe(1);

    // Flames on the spawn cell don't hurt while invulnerable.
    s.explosions.set(p0.y * 19 + p0.x, 5);
    ticks(s, 1);
    expect(p0.alive).toBe(true);
    expect(p0.respawnAtTick).toBe(null);
  });

  it('the final life is final', () => {
    const s = openState();
    const p0 = s.players[0]!;
    s.players[1]!.x = 9;
    s.players[1]!.y = 9;
    p0.lives = 1;
    dropBomb(s, 0);
    ticks(s, FUSE_TICKS + 1);
    expect(p0.alive).toBe(false);
    expect(s.over).toBe(true);
    expect(s.result).toEqual({ winnerSeat: 1 });
  });
});

describe('bomberman items & config', () => {
  it('item frequency scales how many bricks hide items', () => {
    const count = (freq: 'low' | 'high') => {
      const { hidden } = buildMap('classic', 2, 1234, freq);
      return hidden.filter((h) => h !== null).length;
    };
    expect(count('low')).toBeLessThan(count('high'));
  });

  it('powerups reset for each new game', () => {
    const first = newGame(settings(), 2, 1, 7);
    first.players[0]!.fire = 8;
    first.players[0]!.speed = 2;
    first.players[0]!.glove = true;
    const second = newGame(settings(), 2, 2, 8);
    expect(second.players[0]!.fire).toBe(2);
    expect(second.players[0]!.speed).toBe(0);
    expect(second.players[0]!.glove).toBe(false);
  });
});

describe('bomberman bots', () => {
  // The bot brain rolls Math.random for wandering/bombing whims — pin it to a
  // seeded PRNG so these tests can never flake.
  beforeEach(() => {
    const rand = mulberry32(0xb0b);
    vi.spyOn(Math, 'random').mockImplementation(rand);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function botState(difficulty: 'easy' | 'medium' | 'hard'): BombermanState {
    const s = openState();
    const p = s.players[0]!;
    p.isBot = true;
    p.botDifficulty = difficulty;
    s.players[1]!.x = 17;
    s.players[1]!.y = 13;
    return s;
  }

  it('a bot flees a bomb about to explode under it', () => {
    const s = botState('medium');
    const p = s.players[0]!;
    dropBomb(s, 0); // bomb at the bot's feet
    for (let i = 0; i < FUSE_TICKS + 2; i++) tick(s, botThink);
    expect(p.alive).toBe(true); // it ran clear of its own blast
  });

  it('a medium bot bombs bricks and survives the blast', () => {
    const s = botState('medium');
    // Surround the route with a brick target next to the spawn.
    s.grid[1 * 19 + 3] = BRICK;
    let bombed = false;
    for (let i = 0; i < 400 && !bombed; i++) {
      tick(s, botThink);
      bombed = s.bombs.length > 0 || bombed;
    }
    expect(bombed).toBe(true);
    for (let i = 0; i < FUSE_TICKS + 10; i++) tick(s, botThink);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('module.startRound marks bot seats from seat info', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 3, [
      { isBot: false },
      { isBot: true, botDifficulty: 'hard' },
    ]);
    const s = state as BombermanState;
    expect(s.players[0]!.isBot).toBe(false);
    expect(s.players[1]!.isBot).toBe(true);
    expect(s.players[1]!.botDifficulty).toBe('hard');
  });
});

describe('bomberman module', () => {
  it('validates only bomberman actions', () => {
    expect(m.validateAction({ t: 'input', dir: 'up' })).toBe(true);
    expect(m.validateAction({ t: 'input', dir: null })).toBe(true);
    expect(m.validateAction({ t: 'bomb' })).toBe(true);
    expect(m.validateAction({ t: 'grab' })).toBe(true);
    expect(m.validateAction({ t: 'input', dir: 'diagonal' })).toBe(false);
    expect(m.validateAction({ t: 'place', board: 0, cell: 0 })).toBe(false);
  });

  it('is a real-time module with bot support', () => {
    expect(m.tickMs).toBeGreaterThan(0);
    expect(m.supportsBots).toBe(true);
    expect(m.minPlayers).toBe(2);
    expect(m.maxPlayers).toBe(8);
  });

  it('redacts hidden powerups out of the view grid', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 42);
    const seats = [
      { nickname: 'A', connected: true, isHost: true, wins: 0 },
      { nickname: 'B', connected: true, isHost: false, wins: 0, color: '#e05656' },
    ];
    const v = m.redactFor(state, 0, seats, null, false);
    expect(v.g).toBe('bomberman');
    if (v.g !== 'bomberman') return;
    expect(v.grid).toHaveLength(BOMBER_H);
    // Grid chars never leak what's under a brick.
    for (const row of v.grid) expect(row).toMatch(/^[#B.fpsgb]+$/);
    expect(v.players[1]!.color).toBe('#e05656');
    expect(v.players[0]!.color).toBeTruthy(); // default palette fallback
    expect(v.suddenDeathSecondsLeft).toBe(null);
  });

  it('spawns match the player count', () => {
    expect(spawnPoints(2)).toHaveLength(2);
    expect(spawnPoints(8)).toHaveLength(8);
    const { state } = m.startRound(settings(), 8, 0, 1, 3);
    const v = m.redactFor(
      state,
      0,
      Array.from({ length: 8 }, (_, i) => ({
        nickname: `P${i}`,
        connected: true,
        isHost: i === 0,
        wins: 0,
      })),
      null,
      false,
    );
    if (v.g === 'bomberman') expect(v.players).toHaveLength(8);
  });
});

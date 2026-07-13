import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BOMBER_H, BOMBER_MAPS, BOMBER_W, DEFAULT_BOMBERMAN_SETTINGS } from '@shared/bomberman';
import { mulberry32 } from '../../engine/rng';
import { BRICK, FLOOR, WALL, buildMap, shrinkSpiral, spawnPoints } from './maps';
import {
  BASE_FIRE,
  FUSE_TICKS,
  PLAYER_HALF,
  SPEED_BASE,
  SPEED_PER_BOOT,
  SLOW_FACTOR,
  dropBomb,
  grabOrThrow,
  newGame,
  setInput,
  tick,
  type BombermanState,
} from './engine';
import { botTick } from './bot';
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
  it('glides continuously and can stop between cells', () => {
    const s = openState();
    const p = s.players[0]!;
    setInput(s, 0, 'right');
    ticks(s, 2);
    expect(p.x).toBeCloseTo(1 + 2 * SPEED_BASE, 5); // mid-cell — not snapped
    setInput(s, 0, null);
    ticks(s, 10);
    expect(p.x).toBeCloseTo(1 + 2 * SPEED_BASE, 5); // rests exactly where released
    expect(p.x % 1).not.toBe(0); // genuinely between two tiles
  });

  it('the slow hex halves speed; boots raise it', () => {
    const s = openState();
    const p = s.players[0]!;
    setInput(s, 0, 'right');
    p.slowedUntil = s.tick + 1000;
    ticks(s, 4);
    expect(p.x).toBeCloseTo(1 + 4 * SPEED_BASE * SLOW_FACTOR, 5);

    const s2 = openState();
    const q = s2.players[0]!;
    q.speed = 2;
    setInput(s2, 0, 'right');
    ticks(s2, 4);
    expect(q.x).toBeCloseTo(1 + 4 * (SPEED_BASE + 2 * SPEED_PER_BOOT), 5);
  });

  it('walls clamp the glide flush against their face', () => {
    const s = openState();
    const p = s.players[0]!;
    setInput(s, 0, 'up'); // border wall at (1,0)
    ticks(s, 20);
    expect(p.y).toBeCloseTo(0.5 + PLAYER_HALF, 2); // pressed against the wall
    expect(p.x).toBe(1);
  });

  it('corner assist slides a misaligned player around a wall edge', () => {
    const s = openState();
    const p = s.players[0]!;
    s.grid[idx(2, 2)] = WALL;
    p.x = 1;
    p.y = 1.65; // overlaps rows 1 and 2; row 2 is blocked at x=2, row 1 open
    setInput(s, 0, 'right');
    ticks(s, 30);
    expect(p.y).toBeCloseTo(1, 1); // slid up into the open lane…
    expect(p.x).toBeGreaterThan(2); // …and kept moving through it
  });

  it('only one bomb may be out until it explodes; the powerup adds more', () => {
    const s = openState();
    const p = s.players[0]!;
    expect(p.maxBombs).toBe(1);
    dropBomb(s, 0);
    setInput(s, 0, 'right');
    ticks(s, 10); // glide well off the bomb cell
    setInput(s, 0, null);
    dropBomb(s, 0); // second drop is a no-op — one already out
    expect(s.bombs).toHaveLength(1);

    p.x = 9;
    p.y = 9; // out of the blast
    ticks(s, FUSE_TICKS); // first bomb explodes
    expect(s.bombs).toHaveLength(0);
    dropBomb(s, 0); // slot free again
    expect(s.bombs).toHaveLength(1);

    // The extra-bomb powerup raises the cap.
    s.floorPU[idx(10, 9)] = 'bombs';
    setInput(s, 0, 'right');
    ticks(s, 6); // glide until the body-center crosses into (10,9)
    setInput(s, 0, null);
    expect(p.maxBombs).toBe(2);
    dropBomb(s, 0);
    expect(s.bombs).toHaveLength(2);
  });

  it('bombs block re-entry but let you walk off them; blasts kill bystanders', () => {
    const s = openState();
    const p1 = s.players[1]!;
    dropBomb(s, 0); // bomb under p0 at (1,1) — p0 stays on it
    expect(s.bombs).toHaveLength(1);

    // p1 gliding left is stopped at the bomb cell's face.
    p1.x = 2;
    p1.y = 1;
    setInput(s, 1, 'left');
    ticks(s, 10);
    expect(p1.x).toBeGreaterThan(1.5 + PLAYER_HALF - 0.01); // never entered cell (1,1)
    expect(Math.round(p1.x)).toBe(2);

    setInput(s, 1, null);
    const results = ticks(s, FUSE_TICKS);
    const events = results.flatMap((r) => r.events);
    expect(events.some((e) => e.t === 'boom')).toBe(true);
    expect(events.some((e) => e.t === 'death' && e.seat === 1)).toBe(true); // beside it
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
    ticks(s, 4); // glide until the center crosses into (2,1)
    expect(p.fire).toBe(fire0 + 1);
    expect(s.floorPU[idx(2, 1)]).toBe(null);
  });

  it('slow powerup slows every other player, not the collector', () => {
    const s = openState(3);
    const p = s.players[0]!;
    s.floorPU[idx(2, 1)] = 'slow';
    setInput(s, 0, 'right');
    ticks(s, 4); // glide until the center crosses into (2,1)
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

describe('bomberman lives', () => {
  it('with lives > 1, a hit blinks you in place — no relocation', () => {
    const s = openState();
    const p0 = s.players[0]!;
    const p1 = s.players[1]!;
    p0.lives = 2;
    p1.x = 9;
    p1.y = 9; // far from the blast
    // Walk off the corner so we can prove position is preserved on death.
    setInput(s, 0, 'right');
    ticks(s, 12); // glide well off the corner
    setInput(s, 0, null);
    const [dx, dy] = [p0.x, p0.y];
    expect([dx, dy]).not.toEqual([p0.spawnX, p0.spawnY]);

    dropBomb(s, 0); // stand on it
    const results = ticks(s, FUSE_TICKS + 1);
    const events = results.flatMap((r) => r.events);
    // Losing a spare life is a non-fatal hit.
    expect(events.some((e) => e.t === 'death' && e.seat === 0 && e.fatal === false)).toBe(true);
    expect(s.over).toBe(false); // still has a life — game continues
    expect(p0.alive).toBe(true);
    expect(p0.lives).toBe(1);
    expect([p0.x, p0.y]).toEqual([dx, dy]); // stayed exactly where hit
    expect(p0.invulnUntil).toBeGreaterThan(s.tick); // blinking protection

    // The lingering flames can't finish them off while blinking.
    ticks(s, 3);
    expect(p0.alive).toBe(true);
    expect(p0.lives).toBe(1);
  });

  it('the final life is final, and the death event says so', () => {
    const s = openState();
    const p0 = s.players[0]!;
    s.players[1]!.x = 9;
    s.players[1]!.y = 9;
    p0.lives = 1;
    dropBomb(s, 0);
    const results = ticks(s, FUSE_TICKS + 1);
    const events = results.flatMap((r) => r.events);
    expect(events.some((e) => e.t === 'death' && e.seat === 0 && e.fatal === true)).toBe(true);
    expect(p0.alive).toBe(false);
    expect(s.over).toBe(true);
    expect(s.result).toEqual({ winnerSeat: 1 });
  });

  it('a mutual knockout emits gameOver', () => {
    const s = openState();
    s.players[0]!.lives = 1;
    s.players[1]!.lives = 1;
    s.players[1]!.x = 2;
    s.players[1]!.y = 1; // inside the same blast
    dropBomb(s, 0);
    const results = ticks(s, FUSE_TICKS + 1);
    const events = results.flatMap((r) => r.events);
    expect(s.result).toEqual({ winnerSeat: null });
    expect(events.some((e) => e.t === 'gameOver')).toBe(true);
  });

  it('invulnerability expires and that tick broadcasts a change', () => {
    const s = openState();
    const p0 = s.players[0]!;
    s.players[1]!.x = 9;
    s.players[1]!.y = 9;
    p0.lives = 2;
    dropBomb(s, 0);
    ticks(s, FUSE_TICKS + 1);
    expect(s.tick < p0.invulnUntil).toBe(true); // blinking

    let changeAtExpiry = false;
    for (let i = 0; i < 70; i++) {
      const r = tick(s);
      if (r.changed && p0.invulnUntil === s.tick) changeAtExpiry = true;
    }
    expect(s.tick >= p0.invulnUntil).toBe(true); // blink over
    expect(changeAtExpiry).toBe(true); // idle clients hear about it
  });

  it('the closing walls are lethal even with spare lives', () => {
    const s = newGame(settings({ suddenDeathSeconds: 60, lives: 3 }), 2, 1, 5);
    s.tick = s.suddenDeathAtTick! - 1;
    s.nextShrinkTick = 0;
    s.players[1]!.x = 11;
    s.players[1]!.y = 8;
    ticks(s, 4); // spiral closes (1,1) under player 0
    expect(s.players[0]!.alive).toBe(false);
    expect(s.players[0]!.lives).toBe(0);
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
    expect(second.players[0]!.fire).toBe(BASE_FIRE);
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

  for (const diff of ['easy', 'medium', 'hard'] as const) {
    it(`a ${diff} bot survives a bomb dropped at its feet`, () => {
      const s = botState(diff);
      const p = s.players[0]!;
      dropBomb(s, 0); // bomb at the bot's feet
      for (let i = 0; i < FUSE_TICKS + 2; i++) tick(s, botTick);
      expect(p.alive).toBe(true); // it ran clear of its own blast
    });
  }

  it('escapes that require a turn work (the stale-direction suicide)', () => {
    // A max-fire bomb covers the bot's entire row AND column: any straight
    // run stays inside the blast — survival demands a turn mid-escape. The
    // old first-step-only planner died here every time.
    const s = botState('medium');
    const p = s.players[0]!;
    dropBomb(s, 0);
    s.bombs[0]!.fire = 8;
    for (let i = 0; i < FUSE_TICKS + 2; i++) tick(s, botTick);
    expect(p.alive).toBe(true);
    expect(p.x !== 1 && p.y !== 1).toBe(true); // stepped off both blast lines
  });

  it('never bombs when there is no escape', () => {
    // Wall the bot into a two-cell pocket with a tempting brick: bombing
    // would be suicide, so the state machine must refuse.
    const s = botState('hard');
    for (let i = 0; i < s.grid.length; i++) if (s.grid[i] === FLOOR) s.grid[i] = WALL;
    s.grid[idx(1, 1)] = FLOOR;
    s.grid[idx(2, 1)] = FLOOR;
    s.grid[idx(3, 1)] = BRICK;
    s.players[1]!.x = 5;
    s.players[1]!.y = 5; // out of the way (inside walls; irrelevant)
    for (let i = 0; i < 200; i++) tick(s, botTick);
    expect(s.bombs).toHaveLength(0);
    expect(s.players[0]!.alive).toBe(true);
  });

  it('a medium bot bombs bricks and survives the blast', () => {
    const s = botState('medium');
    // Surround the route with a brick target next to the spawn.
    s.grid[idx(3, 1)] = BRICK;
    let bombed = false;
    for (let i = 0; i < 400 && !bombed; i++) {
      tick(s, botTick);
      bombed = s.bombs.length > 0 || bombed;
    }
    expect(bombed).toBe(true);
    for (let i = 0; i < FUSE_TICKS + 10; i++) tick(s, botTick);
    expect(s.players[0]!.alive).toBe(true);
  });

  for (const diff of ['easy', 'medium', 'hard'] as const) {
    it(`a ${diff} bot outruns the closing walls`, () => {
      // Sudden death from the start; a bot idling at its corner (the spiral's
      // first cell) would be crushed almost immediately without lookahead.
      const s = botState(diff);
      s.suddenDeathAtTick = 10;
      s.nextShrinkTick = 10;
      for (let i = 0; i < 450 && !s.over; i++) tick(s, botTick);
      expect(s.players[0]!.alive).toBe(true); // retreated ahead of the wave
    });
  }

  for (const diff of ['easy', 'medium', 'hard'] as const) {
    it(`soak: a lone ${diff} bot never blows itself up on a real map`, () => {
      // Real classic map, full of bricks; the only other player idles far away
      // behind cover. For 3000 ticks (2.5 game-minutes) every bomb on the
      // board is the bot's own — so any bot death here is a self-kill.
      const s = newGame(settings({ map: 'classic', itemFrequency: 'high' }), 2, 1, 77, [
        { isBot: true, botDifficulty: diff },
        { isBot: false },
      ]);
      const bot = s.players[0]!;
      let bombsPlaced = 0;
      for (let i = 0; i < 3000 && !s.over; i++) {
        const before = s.bombs.length;
        tick(s, botTick);
        if (s.bombs.length > before) bombsPlaced++;
        if (!bot.alive) break;
      }
      expect(bot.alive).toBe(true);
      expect(bombsPlaced).toBeGreaterThan(3); // it actually played, not hid
    });
  }

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
    for (const row of v.grid) expect(row).toMatch(/^[#B.fpsgbx]+$/);
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

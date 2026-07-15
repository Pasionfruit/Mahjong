import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SUMO_SETTINGS,
  SUMO_MAP_GEOMETRY,
  SUMO_MIN_RADIUS,
  SUMO_TOP_RADIUS,
  SUMO_WORLD,
  type SumoSettings,
} from '@shared/sumo';
import type { SeatInit } from '../GameModule';
import { currentRadius, newSumoGame, setStick, sumoTick, type SumoState } from './engine';
import { sumoModule as m } from './index';

const CENTER = SUMO_WORLD / 2;

function settings(patch: Partial<SumoSettings> = {}): SumoSettings {
  return { ...DEFAULT_SUMO_SETTINGS, ...patch };
}

function seats(n: number, bots: number[] = [], difficulty: 'easy' | 'medium' | 'hard' = 'hard'): SeatInit[] {
  return Array.from({ length: n }, (_, i) => ({
    isBot: bots.includes(i),
    botDifficulty: bots.includes(i) ? difficulty : undefined,
  }));
}

function game(n = 2, patch: Partial<SumoSettings> = {}, botSeats: number[] = []): SumoState {
  return newSumoGame(settings(patch), n, 1, 7, seats(n, botSeats));
}

function run(s: SumoState, ticks: number): void {
  for (let i = 0; i < ticks && !s.over; i++) sumoTick(s);
}

describe('sumo physics', () => {
  it('spawns everyone alive, on the field, evenly spread', () => {
    const s = game(4);
    for (const p of s.players) {
      expect(p.alive).toBe(true);
      const d = Math.hypot(p.x - CENTER, p.y - CENTER);
      expect(d).toBeLessThan(currentRadius(s));
    }
    const [a, b] = [s.players[0]!, s.players[2]!];
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(200); // opposite sides
  });

  it('steering accelerates, friction caps the speed', () => {
    const s = game(2);
    const p = s.players[0]!;
    p.x = CENTER; // full runway so the top stays on the field while we measure
    p.y = CENTER;
    setStick(s, 0, 1, 0);
    sumoTick(s);
    expect(Math.hypot(p.vx, p.vy)).toBeGreaterThan(0);
    run(s, 11);
    expect(p.alive).toBe(true);
    const vmax = Math.hypot(p.vx, p.vy);
    expect(vmax).toBeLessThan(60); // terminal ≈ ACCEL·f/(1−f) ≈ 40
    expect(vmax).toBeGreaterThan(25);
  });

  it('oversized stick vectors are normalized', () => {
    const s = game(2);
    setStick(s, 0, 30, 40);
    expect(Math.hypot(s.players[0]!.inX, s.players[0]!.inY)).toBeCloseTo(1, 5);
  });

  it('collisions shove the slower top away and record the hitter', () => {
    const s = game(2);
    const [a, b] = [s.players[0]!, s.players[1]!];
    // Stage a head-on: a races right into a stationary b.
    a.x = CENTER - 80;
    a.y = CENTER;
    a.vx = 40;
    b.x = CENTER + 10;
    b.y = CENTER;
    b.vx = 0;
    b.vy = 0;
    run(s, 4);
    expect(b.vx).toBeGreaterThan(10); // knocked away
    expect(b.lastHitBy).toBe(0);
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(SUMO_TOP_RADIUS * 2 - 1);
  });

  it('falling off the rim is a knockout credited to the last hitter', () => {
    const s = game(2, { mode: 'countdown' });
    const b = s.players[1]!;
    b.lastHitBy = 0;
    b.lastHitTick = s.tick;
    b.x = CENTER + currentRadius(s) - 2;
    b.y = CENTER;
    b.vx = 60;
    const events: ReturnType<typeof sumoTick>['events'] = [];
    for (let i = 0; i < 5; i++) events.push(...sumoTick(s).events);
    const ko = events.find((e) => e.t === 'ko');
    expect(ko).toBeTruthy();
    if (ko?.t === 'ko') {
      expect(ko.seat).toBe(1);
      expect(ko.by).toBe(0);
    }
    expect(s.players[0]!.kos).toBe(1);
  });

  it('an unassisted fall credits nobody', () => {
    const s = game(2, { mode: 'countdown' });
    const b = s.players[1]!;
    b.x = CENTER + currentRadius(s) - 2;
    b.vx = 60;
    const events: ReturnType<typeof sumoTick>['events'] = [];
    for (let i = 0; i < 5; i++) events.push(...sumoTick(s).events);
    const ko = events.find((e) => e.t === 'ko');
    if (ko?.t === 'ko') expect(ko.by).toBeNull();
    expect(s.players[0]!.kos).toBe(0);
  });

  it('the donut hole eats tops too', () => {
    const s = game(3, { map: 'donut', mode: 'countdown' });
    const p = s.players[0]!;
    p.x = CENTER + SUMO_MAP_GEOMETRY.donut.hole + 4;
    p.y = CENTER;
    p.vx = -50;
    let koSeen = false;
    for (let i = 0; i < 6; i++) {
      if (sumoTick(s).events.some((e) => e.t === 'ko' && e.seat === 0)) koSeen = true;
    }
    expect(koSeen).toBe(true);
  });

  it('countdown mode respawns fallers as brief ghosts', () => {
    const s = game(2, { mode: 'countdown', matchSeconds: 180 });
    const b = s.players[1]!;
    b.x = CENTER + currentRadius(s) + 50; // already out
    sumoTick(s);
    expect(b.alive).toBe(false);
    run(s, 35);
    expect(b.alive).toBe(true);
    expect(b.ghostTicks).toBeGreaterThan(0);
    // Ghosts don't collide.
    const a = s.players[0]!;
    a.x = b.x - SUMO_TOP_RADIUS;
    a.y = b.y;
    a.vx = 50;
    const hitBefore = b.lastHitTick;
    sumoTick(s);
    expect(b.lastHitTick).toBe(hitBefore);
  });
});

describe('rotation', () => {
  /** Stage a head-on: a races right into a stationary b at center height. */
  function stageHit(s: SumoState, va = 40): void {
    const [a, b] = [s.players[0]!, s.players[1]!];
    a.x = CENTER - SUMO_TOP_RADIUS * 2 - 30;
    a.y = CENTER;
    a.vx = va;
    a.vy = 0;
    b.x = CENTER + 10;
    b.y = CENTER;
    b.vx = 0;
    b.vy = 0;
  }

  it('impacts drain spin — the defender bleeds more than the attacker', () => {
    const s = game(2, { mode: 'countdown' });
    stageHit(s);
    run(s, 3);
    const [a, b] = [s.players[0]!, s.players[1]!];
    expect(a.spin).toBeLessThan(100);
    expect(b.spin).toBeLessThan(a.spin);
  });

  it('a spin-drained top gets launched farther than a fresh one', () => {
    const fresh = game(2, { mode: 'countdown' });
    stageHit(fresh);
    run(fresh, 2);
    const freshKick = Math.hypot(fresh.players[1]!.vx, fresh.players[1]!.vy);

    const weary = game(2, { mode: 'countdown' });
    stageHit(weary);
    weary.players[1]!.spin = 15; // nearly dead rotation
    run(weary, 2);
    const wearyKick = Math.hypot(weary.players[1]!.vx, weary.players[1]!.vy);

    expect(wearyKick).toBeGreaterThan(freshKick * 1.1);
  });

  it('a drained attacker hits softer than a fresh one', () => {
    const fresh = game(2, { mode: 'countdown' });
    stageHit(fresh);
    run(fresh, 2);
    const freshKick = Math.hypot(fresh.players[1]!.vx, fresh.players[1]!.vy);

    const weary = game(2, { mode: 'countdown' });
    stageHit(weary);
    weary.players[0]!.spin = 10;
    run(weary, 2);
    const wearyKick = Math.hypot(weary.players[1]!.vx, weary.players[1]!.vy);

    expect(wearyKick).toBeLessThan(freshKick * 0.85);
  });

  it('rotation curls the hit sideways, not just along the line of impact', () => {
    const s = game(2, { mode: 'countdown' });
    stageHit(s);
    run(s, 3);
    expect(Math.abs(s.players[1]!.vy)).toBeGreaterThan(1); // tangential kick
  });

  it('spin ebbs with time and a respawn restores it', () => {
    const s = game(2, { mode: 'lives', lives: 3, shrinkAfterSeconds: 90 });
    run(s, 100);
    expect(s.players[0]!.spin).toBeLessThan(100);
    const b = s.players[1]!;
    b.spin = 12;
    b.x = CENTER + currentRadius(s) + 60; // knocked out
    sumoTick(s);
    run(s, 40); // respawn
    expect(b.alive).toBe(true);
    expect(b.spin).toBe(100);
  });

  it('the view reports spin', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 3, seats(2));
    const v = m.redactFor(
      state,
      0,
      [
        { nickname: 'A', connected: true, isHost: true, wins: 0 },
        { nickname: 'B', connected: true, isHost: false, wins: 0 },
      ],
      null,
      false,
    );
    if (v.g === 'sumo') expect(v.players[0]!.spin).toBe(100);
  });
});

describe('modes & endings', () => {
  it('lives mode: losing the last life eliminates; last one standing wins', () => {
    const s = game(3, { mode: 'lives', lives: 1 });
    for (const seat of [1, 2]) {
      const p = s.players[seat]!;
      p.x = CENTER + currentRadius(s) + 60;
      sumoTick(s);
      expect(p.eliminated).toBe(true);
    }
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([0]);
  });

  it('lives mode: with lives left you respawn instead', () => {
    const s = game(2, { mode: 'lives', lives: 3, shrinkAfterSeconds: 90 });
    const b = s.players[1]!;
    b.x = CENTER + currentRadius(s) + 60;
    sumoTick(s);
    expect(b.eliminated).toBe(false);
    expect(b.lives).toBe(2);
    run(s, 40);
    expect(b.alive).toBe(true);
  });

  it('lives mode: the arena shrinks after the countdown, never below the floor', () => {
    const s = game(2, { mode: 'lives', shrinkAfterSeconds: 15 });
    expect(currentRadius(s)).toBe(s.baseRadius);
    s.tick = 15 * 20 + 300; // halfway through the shrink
    const mid = currentRadius(s);
    expect(mid).toBeLessThan(s.baseRadius);
    expect(mid).toBeGreaterThan(SUMO_MIN_RADIUS);
    s.tick = 15 * 20 + 10_000;
    expect(currentRadius(s)).toBe(SUMO_MIN_RADIUS);
  });

  it('countdown mode: never shrinks, ends on the clock, most KOs wins', () => {
    const s = game(3, { mode: 'countdown', matchSeconds: 60 });
    s.players[2]!.kos = 3;
    s.players[0]!.kos = 1;
    s.tick = 60 * 20 - 1;
    expect(currentRadius(s)).toBe(s.baseRadius);
    const { events } = sumoTick(s);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([2]);
    expect(events.some((e) => e.t === 'win' && e.seat === 2)).toBe(true);
  });

  it('countdown mode: a zero-KO stalemate is a draw', () => {
    const s = game(2, { mode: 'countdown', matchSeconds: 60 });
    s.tick = 60 * 20 - 1;
    const { events } = sumoTick(s);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([]);
    expect(events.some((e) => e.t === 'gameOver')).toBe(true);
  });
});

describe('bots', () => {
  it('bots rarely fall off on their own (all difficulties)', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const s = newSumoGame(settings({ mode: 'countdown', matchSeconds: 180 }), 2, 1, 11, [
        { isBot: true, botDifficulty: d },
        { isBot: true, botDifficulty: d },
      ]);
      // Uncredited KOs = walked off the edge unaided. Shoved-out ones are the game.
      let selfOuts = 0;
      for (let i = 0; i < 400 && !s.over; i++) {
        for (const e of sumoTick(s).events) {
          if (e.t === 'ko' && e.by === null) selfOuts++;
        }
      }
      expect(selfOuts).toBeLessThanOrEqual(d === 'easy' ? 3 : 1);
    }
  });

  it('a hard bot knocks a passive dummy out of a lives match', () => {
    const s = newSumoGame(settings({ mode: 'lives', lives: 1, shrinkAfterSeconds: 15 }), 2, 1, 13, [
      { isBot: true, botDifficulty: 'hard' },
      { isBot: false },
    ]);
    run(s, 20 * 60); // up to a minute, shrink included
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([0]);
  });

  it('bots on a donut map avoid the hole', () => {
    const s = newSumoGame(settings({ map: 'donut', mode: 'countdown' }), 2, 1, 17, [
      { isBot: true, botDifficulty: 'medium' },
      { isBot: true, botDifficulty: 'hard' },
    ]);
    let holeFalls = 0;
    for (let i = 0; i < 400 && !s.over; i++) {
      for (const e of sumoTick(s).events) {
        if (e.t === 'ko' && e.by === null) {
          const p = s.players[e.seat]!;
          if (Math.hypot(p.x - CENTER, p.y - CENTER) < SUMO_MAP_GEOMETRY.donut.hole + 5) holeFalls++;
        }
      }
    }
    expect(holeFalls).toBeLessThanOrEqual(1); // unaided dives only — shove-ins are fair game
  });
});

describe('module wiring', () => {
  it('validates stick actions and clamps junk', () => {
    expect(m.validateAction({ t: 'stick', x: 0.5, y: -1 })).toBe(true);
    expect(m.validateAction({ t: 'stick', x: 5, y: 0 })).toBe(false);
    expect(m.validateAction({ t: 'stick', x: NaN, y: 0 })).toBe(false);
    expect(m.validateAction({ t: 'bomb' })).toBe(false);
  });

  it('steering is silent; the tick broadcasts', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 3, seats(2));
    const res = m.applyAction(state, 0, { t: 'stick', x: 1, y: 0 });
    expect(res.ok && res.sync).toBe('none');
    expect(m.tick!(state).changed).toBe(true);
  });

  it('player bounds follow the host cap; settings sanitize', () => {
    expect(m.playerBounds!(settings({ maxPlayers: 4 }))).toEqual({ min: 2, max: 4 });
    expect(m.sanitizeSettings(settings(), { maxPlayers: 7 })).toBeNull();
    expect(m.sanitizeSettings(settings(), { map: 'volcano' })).toBeNull();
    expect(m.sanitizeSettings(settings(), { mode: 'countdown', matchSeconds: 90 })).not.toBeNull();
  });

  it('redacts a public view with arena state and per-seat stats', () => {
    const { state } = m.startRound(settings({ map: 'donut' }), 3, 0, 1, 3, seats(3, [2]));
    const meta = [
      { nickname: 'A', connected: true, isHost: true, wins: 0 },
      { nickname: 'B', connected: true, isHost: false, wins: 0 },
      { nickname: 'Bot', connected: true, isHost: false, wins: 0, isBot: true },
    ];
    const v = m.redactFor(state, 1, meta, null, false);
    expect(v.g).toBe('sumo');
    if (v.g === 'sumo') {
      expect(v.players).toHaveLength(3);
      expect(v.holeRadius).toBe(SUMO_MAP_GEOMETRY.donut.hole);
      expect(v.secondsLeft).toBe(settings().shrinkAfterSeconds);
      expect(v.players[2]!.isBot).toBe(true);
      expect(v.result).toBeNull();
    }
  });
});

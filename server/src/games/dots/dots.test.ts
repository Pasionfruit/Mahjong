import { describe, expect, it } from 'vitest';
import { DEFAULT_DOTS_SETTINGS, type DotsSettings } from '@shared/dots';
import { mulberry32 } from '../../engine/rng';
import {
  applyDotsEdge,
  boxSides,
  completesBox,
  createsThirdSide,
  newDotsGame,
  undrawnEdges,
  type DotsState,
  type Edge,
} from './engine';
import { chooseDotsMove, greedyGiveaway } from './bot';
import { dotsModule as m } from './index';

function settings(patch: Partial<DotsSettings> = {}): DotsSettings {
  return { ...DEFAULT_DOTS_SETTINGS, turnTimerSeconds: 0, ...patch };
}

function game(players = 2, size: 3 | 5 | 7 = 3, dealer = 0): DotsState {
  return newDotsGame(settings({ size }), players, dealer, 1);
}

/** Draw three sides of box (r,c), alternating seats legally from `s.turnSeat`. */
function surroundBox(s: DotsState, r: number, c: number, leave: 'h-top' | 'v-left' = 'h-top'): void {
  const edges: Edge[] = [
    { o: 'h', r, c },
    { o: 'h', r: r + 1, c },
    { o: 'v', r, c },
    { o: 'v', r, c: c + 1 },
  ].filter((e) => !(leave === 'h-top' && e.o === 'h' && e.r === r) && !(leave === 'v-left' && e.o === 'v' && e.c === c)) as Edge[];
  for (const e of edges) {
    const res = applyDotsEdge(s, s.turnSeat, e);
    if (!res.ok) throw new Error(`setup failed: ${res.error}`);
  }
}

describe('dots engine', () => {
  it('rejects out-of-turn, out-of-bounds, and duplicate edges', () => {
    const s = game();
    expect(applyDotsEdge(s, 1, { o: 'h', r: 0, c: 0 }).ok).toBe(false);
    expect(applyDotsEdge(s, 0, { o: 'h', r: 4, c: 0 }).ok).toBe(false);
    expect(applyDotsEdge(s, 0, { o: 'h', r: 0, c: 3 }).ok).toBe(false);
    expect(applyDotsEdge(s, 0, { o: 'v', r: 3, c: 0 }).ok).toBe(false);
    expect(applyDotsEdge(s, 0, { o: 'h', r: 0, c: 0 }).ok).toBe(true);
    expect(applyDotsEdge(s, 1, { o: 'h', r: 0, c: 0 }).ok).toBe(false); // duplicate
  });

  it('a plain edge passes the turn; edge counts are right', () => {
    const s = game(3);
    expect(undrawnEdges(s)).toHaveLength(2 * 3 * 4); // 2·N·(N+1) = 24 for N=3
    applyDotsEdge(s, 0, { o: 'h', r: 0, c: 0 });
    expect(s.turnSeat).toBe(1);
    applyDotsEdge(s, 1, { o: 'v', r: 0, c: 0 });
    expect(s.turnSeat).toBe(2);
    applyDotsEdge(s, 2, { o: 'v', r: 2, c: 3 });
    expect(s.turnSeat).toBe(0);
  });

  it('completing a box claims it, scores it, and keeps the turn', () => {
    const s = game();
    surroundBox(s, 0, 0); // three sides drawn, top open; some seat is on turn
    const mover = s.turnSeat;
    expect(boxSides(s, 0, 0)).toBe(3);
    const res = applyDotsEdge(s, mover, { o: 'h', r: 0, c: 0 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events.some((e) => e.t === 'box' && e.count === 1)).toBe(true);
    expect(s.boxes[0]).toBe(mover);
    expect(s.scores[mover]).toBe(1);
    expect(s.turnSeat).toBe(mover); // go again
    expect(s.extraTurn).toBe(true);
  });

  it('one edge can complete two boxes at once (still one extra turn)', () => {
    const s = game(2, 3);
    // Surround (0,0) leaving its right side, and (0,1) leaving its left side —
    // the shared edge v(0,1) then completes both.
    for (const e of [
      { o: 'h', r: 0, c: 0 },
      { o: 'h', r: 1, c: 0 },
      { o: 'v', r: 0, c: 0 },
      { o: 'h', r: 0, c: 1 },
      { o: 'h', r: 1, c: 1 },
      { o: 'v', r: 0, c: 2 },
    ] as Edge[]) {
      expect(applyDotsEdge(s, s.turnSeat, e).ok).toBe(true);
    }
    const mover = s.turnSeat;
    const res = applyDotsEdge(s, mover, { o: 'v', r: 0, c: 1 });
    expect(res.ok).toBe(true);
    expect(s.scores[mover]).toBe(2);
    expect(s.turnSeat).toBe(mover);
  });

  it('fills the board, declares the majority holder, and allows ties', () => {
    const rng = mulberry32(42);
    const s = game(2, 3);
    while (!s.over) {
      const edges = undrawnEdges(s);
      const move = edges[(rng() * edges.length) | 0]!;
      expect(applyDotsEdge(s, s.turnSeat, move).ok).toBe(true);
    }
    expect(s.claimed).toBe(9);
    expect(s.scores[0]! + s.scores[1]!).toBe(9);
    const top = Math.max(...s.scores);
    expect(s.winnerSeats.every((w) => s.scores[w] === top)).toBe(true);
    expect(applyDotsEdge(s, s.turnSeat, { o: 'h', r: 0, c: 0 }).ok).toBe(false);
  });

  it('helper predicates agree with geometry', () => {
    const s = game();
    surroundBox(s, 1, 1);
    expect(completesBox(s, { o: 'h', r: 1, c: 1 })).toBe(true);
    expect(completesBox(s, { o: 'h', r: 0, c: 0 })).toBe(false);
    // Fresh board: give box (0,0) two sides — its remaining sides now create a third.
    const s2 = game();
    applyDotsEdge(s2, 0, { o: 'h', r: 0, c: 0 });
    applyDotsEdge(s2, 1, { o: 'v', r: 0, c: 0 });
    expect(createsThirdSide(s2, { o: 'h', r: 1, c: 0 })).toBe(true);
    expect(createsThirdSide(s2, { o: 'v', r: 0, c: 1 })).toBe(true);
    expect(createsThirdSide(s2, { o: 'h', r: 3, c: 2 })).toBe(false);
  });
});

describe('dots bots', () => {
  it('all difficulties always produce a legal move (fuzz)', () => {
    const rng = mulberry32(7);
    for (let round = 0; round < 30; round++) {
      const s = game(2 + (((rng() * 3) | 0) % 3), 5);
      // random midgame
      const plies = (rng() * 30) | 0;
      for (let i = 0; i < plies && !s.over; i++) {
        const edges = undrawnEdges(s);
        applyDotsEdge(s, s.turnSeat, edges[(rng() * edges.length) | 0]!);
      }
      if (s.over) continue;
      for (const d of ['easy', 'medium', 'hard'] as const) {
        const move = chooseDotsMove(s, d, rng);
        const clone = structuredClone(s);
        // structuredClone keeps Int8Array; re-wrap for the engine call
        expect(applyDotsEdge(clone as DotsState, clone.turnSeat, move).ok).toBe(true);
      }
    }
  });

  it('medium always takes a free box and never opens a chain while safe', () => {
    const rng = mulberry32(9);
    const s = game(2, 3);
    surroundBox(s, 0, 0);
    const move = chooseDotsMove(s, 'medium', rng);
    expect(completesBox(s, move)).toBe(true);
    // fresh board: plenty of safe edges → never creates a third side
    const s2 = game(2, 5);
    for (let i = 0; i < 10; i++) {
      const mv = chooseDotsMove(s2, 'medium', rng);
      expect(createsThirdSide(s2, mv)).toBe(false);
      applyDotsEdge(s2, s2.turnSeat, mv);
    }
  });

  it('hard sacrifices minimally when every edge opens a chain', () => {
    // A 3×3 with no completions and no safe edges left: hard must pick the
    // giveaway with the smallest greedy cost among all legal moves.
    const s = game(2, 3);
    const setup: Edge[] = [
      { o: 'h', r: 0, c: 0 },
      { o: 'v', r: 0, c: 0 },
      { o: 'h', r: 0, c: 1 },
      { o: 'h', r: 0, c: 2 },
      { o: 'h', r: 1, c: 1 },
      { o: 'h', r: 1, c: 2 },
      { o: 'h', r: 2, c: 0 },
      { o: 'h', r: 2, c: 1 },
      { o: 'h', r: 2, c: 2 },
      { o: 'h', r: 3, c: 0 },
      { o: 'h', r: 3, c: 1 },
      { o: 'h', r: 3, c: 2 },
      { o: 'v', r: 1, c: 0 },
    ];
    for (const e of setup) {
      const res = applyDotsEdge(s, s.turnSeat, e);
      expect(res.ok).toBe(true);
      expect(s.extraTurn).toBe(false); // setup must not complete boxes
    }
    const remaining = undrawnEdges(s);
    expect(remaining.some((e) => completesBox(s, e))).toBe(false);
    expect(remaining.every((e) => createsThirdSide(s, e))).toBe(true); // truly forced
    const move = chooseDotsMove(s, 'hard', mulberry32(3));
    const minCost = Math.min(...remaining.map((e) => greedyGiveaway(s, e)));
    expect(greedyGiveaway(s, move)).toBe(minCost);
  });

  it('hard finishes the board when the last run ends the game', () => {
    const s = game(2, 3);
    const rng = mulberry32(11);
    // Play a full deterministic bot-vs-bot game; it must terminate.
    let guard = 200;
    while (!s.over && guard-- > 0) {
      const move = chooseDotsMove(s, 'hard', rng);
      expect(applyDotsEdge(s, s.turnSeat, move).ok).toBe(true);
    }
    expect(s.over).toBe(true);
  });

  it('hard beats easy from both seats over deterministic games', () => {
    for (const hardSeat of [0, 1] as const) {
      const rng = mulberry32(hardSeat === 0 ? 21 : 22);
      const s = game(2, 5);
      let guard = 400;
      while (!s.over && guard-- > 0) {
        const d = s.turnSeat === hardSeat ? 'hard' : 'easy';
        applyDotsEdge(s, s.turnSeat, chooseDotsMove(s, d, rng));
      }
      expect(s.over).toBe(true);
      expect(s.winnerSeats).toEqual([hardSeat]);
    }
  });
});

describe('dots module', () => {
  it('validates actions structurally', () => {
    expect(m.validateAction({ t: 'edge', o: 'h', r: 0, c: 0 })).toBe(true);
    expect(m.validateAction({ t: 'edge', o: 'x', r: 0, c: 0 })).toBe(false);
    expect(m.validateAction({ t: 'place', board: 0, cell: 0 })).toBe(false);
  });

  it('reports the mover as pending and auto-moves on timeout', () => {
    const { state } = m.startRound(settings({ turnTimerSeconds: 15 }), 2, 0, 1, 1);
    expect(m.pendingSeats(state)).toEqual([{ seat: 0, kind: 'turn', fast: false }]);
    expect(m.awaitingSeat(state)).toBe(0);
    expect(m.deadlineHintMs(state)).toBe(15_000);
    const events = m.applyTimeout(state);
    expect(events[0]).toEqual({ t: 'timeout', seat: 0 });
    expect((state as DotsState).turnSeat).toBe(1);
  });

  it('redacts a public view with per-seat colors and scores', () => {
    const { state } = m.startRound(settings(), 3, 0, 1, 1);
    const seats = [
      { nickname: 'A', connected: true, isHost: true, wins: 0 },
      { nickname: 'B', connected: true, isHost: false, wins: 0, color: '#e05656' },
      { nickname: 'C', connected: true, isHost: false, wins: 0, isBot: true },
    ];
    const v = m.redactFor(state, 2, seats, null, false);
    expect(v.g).toBe('dots');
    if (v.g === 'dots') {
      expect(v.players).toHaveLength(3);
      expect(v.players[1]!.color).toBe('#e05656'); // lobby-picked color honored
      expect(v.hEdges).toHaveLength(30); // (5+1)·5
      expect(v.vEdges).toHaveLength(30);
      expect(v.boxes).toHaveLength(25);
    }
  });

  it('bot hooks return legal moves at every difficulty', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 1);
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const a = m.chooseAction(state, 0, d);
      expect(m.validateAction(a)).toBe(true);
      expect(m.applyAction(structuredClone(state), 0, a).ok).toBe(true);
    }
  });
});

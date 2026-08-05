import { describe, expect, it } from 'vitest';
import { DEFAULT_MINEFIELD_SETTINGS, MINEFIELD_PRESETS, type MinefieldSettings } from '@shared/minefield';
import type { SeatMeta } from '../GameModule';
import { applyMinefieldAction, isNoGuessSolvable, neighborsOf, newMinefieldGame, type MinefieldState } from './engine';
import { minefieldModule as m } from './index';

function settings(patch: Partial<MinefieldSettings> = {}): MinefieldSettings {
  return { ...DEFAULT_MINEFIELD_SETTINGS, ...patch };
}

function newGame(players = 2, patch: Partial<MinefieldSettings> = {}, seed = 7): MinefieldState {
  return newMinefieldGame(settings(patch), players, 1, seed);
}

function metas(n: number): SeatMeta[] {
  return Array.from({ length: n }, (_, i) => ({
    nickname: `P${i}`,
    connected: true,
    isHost: i === 0,
    wins: 0,
  }));
}

/** First hidden (unrevealed, non-mine) cell on `seat`'s own board — a safe move for tests. */
function firstHiddenSafeCell(s: MinefieldState, seat = 0): number {
  const board = s.boards[seat]!;
  const i = s.layout.findIndex((c, idx) => !board.revealed[idx] && !c.mine);
  if (i < 0) throw new Error('no hidden safe cell');
  return i;
}

function firstHiddenMineCell(s: MinefieldState, seat = 0): number {
  const board = s.boards[seat]!;
  const i = s.layout.findIndex((c, idx) => !board.revealed[idx] && c.mine);
  if (i < 0) throw new Error('no hidden mine cell');
  return i;
}

function mineIndices(s: MinefieldState): number[] {
  return s.layout.reduce<number[]>((acc, c, i) => {
    if (c.mine) acc.push(i);
    return acc;
  }, []);
}

function safeIndices(s: MinefieldState): number[] {
  return s.layout.reduce<number[]>((acc, c, i) => {
    if (!c.mine) acc.push(i);
    return acc;
  }, []);
}

/** Reveal every safe cell on `seat`'s board except the last, returning it. */
function primeForClear(s: MinefieldState, seat: number): number {
  const board = s.boards[seat]!;
  let last: number | null = null;
  for (const i of safeIndices(s)) {
    if (board.revealed[i]) continue;
    if (last !== null) applyMinefieldAction(s, seat, { t: 'mf', op: 'reveal', index: last });
    last = i;
  }
  if (last === null) throw new Error('board already clear');
  return last;
}

describe('board generation', () => {
  it('places the configured mine count and gives every player an identical, independent, auto-revealed start', () => {
    const s = newGame(3, { preset: 'beginner' });
    const spec = MINEFIELD_PRESETS.beginner;
    expect(s.rows).toBe(spec.rows);
    expect(s.cols).toBe(spec.cols);
    expect(s.mineCount).toBe(spec.mines);
    expect(s.layout).toHaveLength(spec.rows * spec.cols);
    expect(s.layout.filter((c) => c.mine)).toHaveLength(spec.mines);
    expect(s.boards).toHaveLength(3);
    // Every board starts with the same safe patch revealed, independently.
    const [a, b, c] = s.boards;
    expect(a!.revealed).toEqual(b!.revealed);
    expect(b!.revealed).toEqual(c!.revealed);
    expect(a!.revealed.some(Boolean)).toBe(true);
    for (const board of s.boards) {
      expect(board.revealedCount).toBe(0); // the free starting patch isn't credited
      expect(board.minesHit).toBe(0);
      expect(board.eliminated).toBe(false);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = newGame(3, {}, 42);
    const b = newGame(3, {}, 42);
    expect(a.layout).toEqual(b.layout);
    expect(a.boards.map((x) => x.revealed)).toEqual(b.boards.map((x) => x.revealed));
  });

  it('the safe-start cell and its neighbors are never mines', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = newGame(2, {}, seed);
      const start = Math.floor(s.rows / 2) * s.cols + Math.floor(s.cols / 2);
      expect(s.layout[start]!.mine).toBe(false);
      for (const n of neighborsOf(start, s.rows, s.cols)) expect(s.layout[n]!.mine).toBe(false);
    }
  });

  it('noGuess boards are always fully solvable by pure deduction', () => {
    for (let seed = 0; seed < 5; seed++) {
      const s = newGame(2, { preset: 'beginner', noGuess: true }, seed * 1000);
      const startRevealed = s.boards[0]!.revealed.reduce<number[]>((acc, r, i) => {
        if (r) acc.push(i);
        return acc;
      }, []);
      expect(isNoGuessSolvable(s.layout, s.rows, s.cols, s.mineCount, startRevealed)).toBe(true);
    }
  });
});

describe('isNoGuessSolvable — unit behavior on constructed boards', () => {
  it('a fully-revealed board (no mines left hidden) is trivially solvable', () => {
    const rows = 3, cols = 3;
    const layout = Array.from({ length: 9 }, () => ({ mine: false, adjacent: 0 }));
    expect(isNoGuessSolvable(layout, rows, cols, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(true);
  });

  it('a genuine 50/50 (two symmetric candidates, no distinguishing clue) is rejected', () => {
    // 1x4 row: revealed '1' at index 1 pointing at indices {0,2}; nothing else
    // constrains which of the two is the mine — classic unresolved 50/50.
    const rows = 1, cols = 4;
    const layout = [
      { mine: false, adjacent: 0 }, // 0: hidden safe
      { mine: false, adjacent: 1 }, // 1: revealed '1'
      { mine: false, adjacent: 0 }, // 2: hidden, one of these two is the mine
      { mine: false, adjacent: 0 }, // 3: fully unconstrained
    ];
    // Exactly one of {0,2} is secretly a mine, but the solver only sees clue
    // values, not ground truth — with 1 total mine among {0,2} and no other
    // information, no rule can single one out.
    expect(isNoGuessSolvable(layout, rows, cols, 1, [1])).toBe(false);
  });
});

describe('applyMinefieldAction — independent boards', () => {
  it('rejects out-of-range and already-revealed cells', () => {
    const s = newGame(2);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: -1 }).ok).toBe(false);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: s.layout.length }).ok).toBe(false);
    const already = s.boards[0]!.revealed.findIndex(Boolean);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: already }).ok).toBe(false);
  });

  it('rejects a seat outside the game and an eliminated seat', () => {
    const s = newGame(2);
    expect(applyMinefieldAction(s, 5, { t: 'mf', op: 'reveal', index: firstHiddenSafeCell(s, 0) }).ok).toBe(false);
    const mine = firstHiddenMineCell(s, 0);
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    expect(s.boards[0]!.eliminated).toBe(true);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenSafeCell(s, 0) });
    expect(res.ok).toBe(false);
  });

  it('a safe reveal flood-fills only the acting seat\'s own board — others are untouched', () => {
    const s = newGame(2);
    const target = firstHiddenSafeCell(s, 1);
    const before0 = s.boards[0]!.revealed.filter(Boolean).length;
    const before1 = s.boards[1]!.revealed.filter(Boolean).length;
    const res = applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: target });
    expect(res.ok).toBe(true);
    const after1 = s.boards[1]!.revealed.filter(Boolean).length;
    expect(after1).toBeGreaterThan(before1);
    expect(s.boards[0]!.revealed.filter(Boolean).length).toBe(before0); // seat 0 untouched
    expect(s.boards[1]!.revealedCount).toBe(after1 - before1);
  });

  it('two players can independently reveal the exact same cell on their own boards', () => {
    const s = newGame(2);
    const target = firstHiddenSafeCell(s, 0);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: target }).ok).toBe(true);
    // Same index, seat 1's own board — must still be legal there even though
    // seat 0 already revealed "the same cell" on their own copy.
    expect(s.boards[1]!.revealed[target]).toBe(false);
    expect(applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: target }).ok).toBe(true);
  });

  it('a mine reveal eliminates only that seat and emits an explode event', () => {
    const s = newGame(3);
    const mine = firstHiddenMineCell(s, 0);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events).toContainEqual({ t: 'explode', seat: 0, index: mine });
    expect(s.boards[0]!.eliminated).toBe(true);
    expect(s.boards[0]!.revealed[mine]).toBe(true);
    expect(s.boards[1]!.eliminated).toBe(false);
    expect(s.boards[2]!.eliminated).toBe(false);
    expect(s.over).toBe(false); // two other seats still active
  });

  it('last player standing wins immediately once everyone else is eliminated', () => {
    const s = newGame(2, { preset: 'beginner' });
    const mineForSeat0 = firstHiddenMineCell(s, 0);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mineForSeat0 });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([1]);
    if (res.ok) expect(res.events).toContainEqual({ t: 'win', seat: 1, by: 'lastStanding' });
  });

  it('clearing your own board wins outright, even if others are mid-board', () => {
    const s = newGame(2, { preset: 'beginner' });
    const last = primeForClear(s, 0);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: last });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([0]);
    if (res.ok) expect(res.events.some((e) => e.t === 'win' && e.by === 'cleared')).toBe(true);
    // Seat 1's own board is untouched by seat 0 finishing theirs.
    expect(s.boards[1]!.eliminated).toBe(false);
  });

  it('with 3+ players, eliminating down to one seat still ends the round for that seat', () => {
    const s = newGame(3, { preset: 'beginner' });
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, 0) });
    expect(s.over).toBe(false); // two seats still active
    const res = applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, 1) });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([2]);
    if (res.ok) expect(res.events).toContainEqual({ t: 'win', seat: 2, by: 'lastStanding' });
  });

  it('rejects any action once the round is over', () => {
    const s = newGame(2, { preset: 'beginner' });
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, 0) });
    applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, 1) });
    expect(s.over).toBe(true);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: 0 });
    expect(res.ok).toBe(false);
  });
});

describe('eliminateOnMine: false — keep playing after a mine, on your own board', () => {
  it('a mine reveal counts as a hit but does not eliminate the seat', () => {
    const s = newGame(2, { eliminateOnMine: false });
    const mine = firstHiddenMineCell(s, 0);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events).toContainEqual({ t: 'explode', seat: 0, index: mine });
    expect(s.boards[0]!.eliminated).toBe(false);
    expect(s.boards[0]!.minesHit).toBe(1);
    expect(s.boards[0]!.revealed[mine]).toBe(true);
    expect(s.over).toBe(false);
  });

  it('the same seat can keep revealing safe cells on their own board after hitting a mine', () => {
    const s = newGame(2, { eliminateOnMine: false });
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, 0) });
    const safe = firstHiddenSafeCell(s, 0);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: safe });
    expect(res.ok).toBe(true);
    expect(s.boards[0]!.eliminated).toBe(false);
    expect(s.boards[0]!.revealedCount).toBeGreaterThan(0);
  });

  it('even every seat hitting a mine never ends the round early — only a full clear does', () => {
    const s = newGame(3, { preset: 'beginner', eliminateOnMine: false });
    for (let seat = 0; seat < 3; seat++) {
      applyMinefieldAction(s, seat, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, seat) });
    }
    expect(s.over).toBe(false);
    expect(s.boards.map((b) => b.eliminated)).toEqual([false, false, false]);
    expect(s.boards.map((b) => b.minesHit)).toEqual([1, 1, 1]);
  });

  it('clearing your own board still wins outright, exactly as with elimination on', () => {
    const s = newGame(2, { preset: 'beginner', eliminateOnMine: false });
    const last = primeForClear(s, 0);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: last });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([0]);
    if (res.ok) expect(res.events.some((e) => e.t === 'win' && e.by === 'cleared')).toBe(true);
  });
});

describe('minefieldModule — GameModule wiring', () => {
  it('sanitizeSettings validates preset, noGuess, and eliminateOnMine, rejects garbage', () => {
    const base = m.defaultSettings() as MinefieldSettings;
    expect(m.sanitizeSettings(base, { preset: 'expert' })).toEqual({ ...base, preset: 'expert' });
    expect(m.sanitizeSettings(base, { noGuess: true })).toEqual({ ...base, noGuess: true });
    expect(m.sanitizeSettings(base, { eliminateOnMine: false })).toEqual({ ...base, eliminateOnMine: false });
    expect(m.sanitizeSettings(base, { preset: 'nonsense' })).toBeNull();
    expect(m.sanitizeSettings(base, { noGuess: 'yes' })).toBeNull();
    expect(m.sanitizeSettings(base, { eliminateOnMine: 'nope' })).toBeNull();
  });

  it('validateAction accepts well-formed reveal actions and rejects everything else', () => {
    expect(m.validateAction({ t: 'mf', op: 'reveal', index: 3 })).toBe(true);
    expect(m.validateAction({ t: 'mf', op: 'flag', index: 3 })).toBe(false);
    expect(m.validateAction({ t: 'mf', op: 'reveal', index: 1.5 })).toBe(false);
    expect(m.validateAction(null)).toBe(false);
    expect(m.validateAction({ t: 'other' })).toBe(false);
  });

  it("redactFor only shows the viewer's own board, hiding unrevealed mines", () => {
    const { state } = m.startRound(m.defaultSettings(), 2, 0, 1, 123);
    const s = state as MinefieldState;
    const mine = mineIndices(s).find((i) => !s.boards[0]!.revealed[i])!;
    const seats = metas(2);

    const before = m.redactFor(s, 0, seats, null, false);
    if (before.g === 'minefield') {
      expect(before.yourCells![mine]).toEqual({ revealed: false });
      expect(before.finalLayout).toBeNull();
    }

    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    const after = m.redactFor(s, 0, seats, null, false);
    if (after.g === 'minefield') {
      expect(after.yourCells![mine]).toEqual({ revealed: true, mine: true });
    }
  });

  it('reveals the shared final layout to everyone once the round is over', () => {
    const s = newGame(2, { preset: 'beginner' });
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenMineCell(s, 0) });
    expect(s.over).toBe(true);
    const seats = metas(2);
    const viewFromLoser = m.redactFor(s, 0, seats, null, false);
    const viewFromWinner = m.redactFor(s, 1, seats, null, false);
    if (viewFromLoser.g === 'minefield' && viewFromWinner.g === 'minefield') {
      expect(viewFromLoser.finalLayout).not.toBeNull();
      expect(viewFromLoser.finalLayout).toEqual(viewFromWinner.finalLayout); // identical shared layout
      expect(viewFromLoser.finalLayout!.every((c) => c.revealed)).toBe(true);
    }
  });

  it('reports totalSafeCells and per-player progress independently', () => {
    const s = newGame(2, { preset: 'beginner' });
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenSafeCell(s, 0) });
    const view = m.redactFor(s, 0, metas(2), null, false);
    if (view.g === 'minefield') {
      expect(view.totalSafeCells).toBe(s.layout.filter((c) => !c.mine).length);
      const p0 = view.players.find((p) => p.seat === 0)!;
      const p1 = view.players.find((p) => p.seat === 1)!;
      expect(p0.revealedCount).toBe(s.boards[0]!.revealedCount);
      expect(p1.revealedCount).toBe(0);
    }
  });

  it('startRound produces a playable board matching the chosen preset', () => {
    const { state } = m.startRound({ preset: 'beginner', noGuess: false }, 3, 0, 1, 99);
    const s = state as MinefieldState;
    expect(s.rows).toBe(9);
    expect(s.cols).toBe(9);
    expect(s.mineCount).toBe(10);
    expect(s.playerCount).toBe(3);
    expect(s.boards).toHaveLength(3);
  });
});

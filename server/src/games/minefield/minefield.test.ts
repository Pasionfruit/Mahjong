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

/** First hidden (unrevealed, non-mine) cell — a safe move for tests. */
function firstHiddenSafeCell(s: MinefieldState): number {
  const i = s.cells.findIndex((c) => !c.revealed && !c.mine);
  if (i < 0) throw new Error('no hidden safe cell');
  return i;
}

function firstHiddenMineCell(s: MinefieldState): number {
  const i = s.cells.findIndex((c) => !c.revealed && c.mine);
  if (i < 0) throw new Error('no hidden mine cell');
  return i;
}

describe('board generation', () => {
  it('places the configured mine count and auto-reveals a safe starting patch', () => {
    const s = newGame(2, { preset: 'beginner' });
    const spec = MINEFIELD_PRESETS.beginner;
    expect(s.rows).toBe(spec.rows);
    expect(s.cols).toBe(spec.cols);
    expect(s.mineCount).toBe(spec.mines);
    expect(s.cells).toHaveLength(spec.rows * spec.cols);
    expect(s.cells.filter((c) => c.mine)).toHaveLength(spec.mines);
    expect(s.cells.some((c) => c.revealed)).toBe(true);
    // The auto-revealed patch is nobody's credit.
    for (const c of s.cells) if (c.revealed) expect(c.owner).toBeNull();
  });

  it('is deterministic for the same seed', () => {
    const a = newGame(3, {}, 42);
    const b = newGame(3, {}, 42);
    expect(a.cells.map((c) => c.mine)).toEqual(b.cells.map((c) => c.mine));
    expect(a.cells.map((c) => c.revealed)).toEqual(b.cells.map((c) => c.revealed));
  });

  it('the safe-start cell and its neighbors are never mines', () => {
    for (let seed = 0; seed < 20; seed++) {
      const s = newGame(2, {}, seed);
      const start = Math.floor(s.rows / 2) * s.cols + Math.floor(s.cols / 2);
      expect(s.cells[start]!.mine).toBe(false);
      for (const n of neighborsOf(start, s.rows, s.cols)) expect(s.cells[n]!.mine).toBe(false);
    }
  });

  it('noGuess boards are always fully solvable by pure deduction', () => {
    for (let seed = 0; seed < 5; seed++) {
      const s = newGame(2, { preset: 'beginner', noGuess: true }, seed * 1000);
      const startRevealed = s.cells.reduce<number[]>((acc, c, i) => {
        if (c.revealed) acc.push(i);
        return acc;
      }, []);
      expect(isNoGuessSolvable(s.cells, s.rows, s.cols, s.mineCount, startRevealed)).toBe(true);
    }
  });
});

describe('isNoGuessSolvable — unit behavior on constructed boards', () => {
  it('a fully-revealed board (no mines left hidden) is trivially solvable', () => {
    const rows = 3, cols = 3;
    const cells = Array.from({ length: 9 }, () => ({ mine: false, revealed: false, adjacent: 0, owner: null }));
    expect(isNoGuessSolvable(cells, rows, cols, 0, [0, 1, 2, 3, 4, 5, 6, 7, 8])).toBe(true);
  });

  it('a genuine 50/50 (two symmetric candidates, no distinguishing clue) is rejected', () => {
    // 1x4 row: revealed '1' at index 1 pointing at indices {0,2}; nothing else
    // constrains which of the two is the mine — classic unresolved 50/50.
    const rows = 1, cols = 4;
    const cells = [
      { mine: false, revealed: false, adjacent: 0, owner: null }, // 0: hidden safe
      { mine: false, revealed: true, adjacent: 1, owner: null }, // 1: revealed '1'
      { mine: false, revealed: false, adjacent: 0, owner: null }, // 2: hidden, one of these two is the mine
      { mine: false, revealed: false, adjacent: 0, owner: null }, // 3: fully unconstrained
    ];
    // Exactly one of {0,2} is secretly a mine, but the solver only sees clue
    // values, not ground truth — with 1 total mine among {0,2} and no other
    // information, no rule can single one out.
    expect(isNoGuessSolvable(cells, rows, cols, 1, [1])).toBe(false);
  });
});

describe('applyMinefieldAction — reveal mechanics', () => {
  it('rejects out-of-range and already-revealed cells', () => {
    const s = newGame(2);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: -1 }).ok).toBe(false);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: s.cells.length }).ok).toBe(false);
    const already = s.cells.findIndex((c) => c.revealed);
    expect(applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: already }).ok).toBe(false);
  });

  it('rejects a seat outside the game and an eliminated seat', () => {
    const s = newGame(2);
    expect(applyMinefieldAction(s, 5, { t: 'mf', op: 'reveal', index: firstHiddenSafeCell(s) }).ok).toBe(false);
    const mine = firstHiddenMineCell(s);
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    expect(s.eliminated[0]).toBe(true);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: firstHiddenSafeCell(s) });
    expect(res.ok).toBe(false);
  });

  it('a safe reveal flood-fills and attributes every newly revealed cell to the acting seat', () => {
    const s = newGame(2);
    const target = firstHiddenSafeCell(s);
    const before = s.cells.filter((c) => c.revealed).length;
    const res = applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: target });
    expect(res.ok).toBe(true);
    const after = s.cells.filter((c) => c.revealed).length;
    expect(after).toBeGreaterThan(before);
    for (const c of s.cells) if (c.revealed && c.owner === 1) expect(c.mine).toBe(false);
    expect(s.revealedCount[1]).toBe(after - before);
  });

  it('a mine reveal eliminates the seat and emits an explode event', () => {
    const s = newGame(3);
    const mine = firstHiddenMineCell(s);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events).toContainEqual({ t: 'explode', seat: 0, index: mine });
    expect(s.eliminated[0]).toBe(true);
    expect(s.cells[mine]!.revealed).toBe(true);
    expect(s.over).toBe(false); // two other seats still active
  });

  it('last player standing wins immediately once everyone else is eliminated', () => {
    const s = newGame(2, { preset: 'beginner' });
    const mineForSeat0 = s.cells.findIndex((c) => !c.revealed && c.mine);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mineForSeat0 });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([1]);
    if (res.ok) expect(res.events).toContainEqual({ t: 'win', seat: 1, by: 'lastStanding' });
  });

  it('clearing every non-mine cell wins outright for whoever completed it', () => {
    const s = newGame(2, { preset: 'beginner' });
    // Reveal every non-mine cell manually except the very last one.
    const safeCells = s.cells.reduce<number[]>((acc, c, i) => {
      if (!c.mine) acc.push(i);
      return acc;
    }, []);
    let last: number | null = null;
    for (const i of safeCells) {
      if (s.cells[i]!.revealed) continue;
      if (last !== null) applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: last });
      last = i;
    }
    expect(last).not.toBeNull();
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: last! });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([0]);
    if (res.ok) expect(res.events.some((e) => e.t === 'win' && e.by === 'cleared')).toBe(true);
  });

  it('with 3+ players, eliminating down to one seat still ends the round for that seat', () => {
    const s = newGame(3, { preset: 'beginner' });
    const mines = s.cells.reduce<number[]>((acc, c, i) => {
      if (c.mine) acc.push(i);
      return acc;
    }, []);
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mines[0]! });
    expect(s.over).toBe(false); // two seats still active
    const res = applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: mines[1]! });
    expect(res.ok).toBe(true);
    expect(s.over).toBe(true);
    expect(s.winnerSeats).toEqual([2]);
    if (res.ok) expect(res.events).toContainEqual({ t: 'win', seat: 2, by: 'lastStanding' });
  });

  it('rejects any action once the round is over', () => {
    const s = newGame(2, { preset: 'beginner' });
    const mines = s.cells.reduce<number[]>((acc, c, i) => {
      if (c.mine) acc.push(i);
      return acc;
    }, []);
    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mines[0]! });
    applyMinefieldAction(s, 1, { t: 'mf', op: 'reveal', index: mines[1]! });
    expect(s.over).toBe(true);
    const res = applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: 0 });
    expect(res.ok).toBe(false);
  });
});

describe('minefieldModule — GameModule wiring', () => {
  it('sanitizeSettings validates preset and noGuess, rejects garbage', () => {
    const base = m.defaultSettings() as MinefieldSettings;
    expect(m.sanitizeSettings(base, { preset: 'expert' })).toEqual({ ...base, preset: 'expert' });
    expect(m.sanitizeSettings(base, { noGuess: true })).toEqual({ ...base, noGuess: true });
    expect(m.sanitizeSettings(base, { preset: 'nonsense' })).toBeNull();
    expect(m.sanitizeSettings(base, { noGuess: 'yes' })).toBeNull();
  });

  it('validateAction accepts well-formed reveal actions and rejects everything else', () => {
    expect(m.validateAction({ t: 'mf', op: 'reveal', index: 3 })).toBe(true);
    expect(m.validateAction({ t: 'mf', op: 'flag', index: 3 })).toBe(false);
    expect(m.validateAction({ t: 'mf', op: 'reveal', index: 1.5 })).toBe(false);
    expect(m.validateAction(null)).toBe(false);
    expect(m.validateAction({ t: 'other' })).toBe(false);
  });

  it('redactFor hides unrevealed mines and reveals everything once the round is over', () => {
    const { state } = m.startRound(m.defaultSettings(), 2, 0, 1, 123);
    const s = state as MinefieldState;
    const mine = s.cells.findIndex((c) => !c.revealed && c.mine);
    const seats = metas(2);

    const before = m.redactFor(s, 0, seats, null, false);
    if (before.g === 'minefield') {
      expect(before.cells[mine]).toEqual({ revealed: false });
    }

    applyMinefieldAction(s, 0, { t: 'mf', op: 'reveal', index: mine });
    // beginner board has 2 mines by default settings (intermediate=40 actually);
    // force game over directly for this assertion regardless of preset.
    s.over = true;
    const after = m.redactFor(s, 0, seats, null, false);
    if (after.g === 'minefield') {
      expect(after.cells[mine]).toMatchObject({ revealed: true, mine: true });
    }
  });

  it('startRound produces a playable board matching the chosen preset', () => {
    const { state } = m.startRound({ preset: 'beginner', noGuess: false }, 3, 0, 1, 99);
    const s = state as MinefieldState;
    expect(s.rows).toBe(9);
    expect(s.cols).toBe(9);
    expect(s.mineCount).toBe(10);
    expect(s.playerCount).toBe(3);
  });
});

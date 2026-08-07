import { describe, expect, it } from 'vitest';
import {
  BG_DUMP_DRAW,
  BG_LETTER_COUNTS,
  BG_SIZE,
  DEFAULT_BANANAGRAMS_SETTINGS,
  bgCellKey,
  type BananagramsSettings,
  type BgTile,
} from '@shared/bananagrams';
import type { SeatMeta } from '../GameModule';
import {
  WORDS,
  applyBananagramsAction,
  newBananagramsGame,
  refreshDerived,
  type BananagramsState,
} from './engine';
import { bananagramsModule as m } from './index';

function settings(patch: Partial<BananagramsSettings> = {}): BananagramsSettings {
  return { ...DEFAULT_BANANAGRAMS_SETTINGS, ...patch };
}

function newGame(players = 2, patch: Partial<BananagramsSettings> = {}, seed = 7): BananagramsState {
  return newBananagramsGame(settings(patch), players, 1, seed);
}

function metas(n: number): SeatMeta[] {
  return Array.from({ length: n }, (_, i) => ({
    nickname: `P${i}`,
    connected: true,
    isHost: i === 0,
    wins: 0,
  }));
}

/** Move a tray tile straight onto the board with a forced letter (test rig). */
function put(s: BananagramsState, seat: number, letter: string, x: number, y: number): void {
  const p = s.players[seat]!;
  const tile = p.tray.pop()!;
  tile.letter = letter;
  p.board.set(bgCellKey(x, y), tile);
  refreshDerived(s, p);
}

/**
 * Rig a seat one tile away from a finished "AT": the A already placed, the T
 * still in the tray (surplus tray tiles are returned to the bunch's far end so
 * tile conservation holds). Returns the T; placing it at (6,5) completes the grid.
 */
function primeAt(s: BananagramsState, seat: number): BgTile {
  const p = s.players[seat]!;
  while (p.tray.length > 2) s.bunch.unshift(p.tray.pop()!);
  p.tray[0]!.letter = 'A';
  p.tray[1]!.letter = 'T';
  const res = applyBananagramsAction(s, seat, {
    t: 'bg',
    op: 'place',
    tileId: p.tray[0]!.id,
    x: 5,
    y: 5,
  });
  expect(res.ok).toBe(true);
  return p.tray[0]!;
}

/** Every tile id across trays, boards, and the bunch. */
function allIds(s: BananagramsState): number[] {
  const ids = s.bunch.map((t) => t.id);
  for (const p of s.players) {
    ids.push(...p.tray.map((t) => t.id));
    for (const t of p.board.values()) ids.push(t.id);
  }
  return ids;
}

describe('dealing', () => {
  it('auto start tiles follow the official schedule per player count', () => {
    const expected: [number, number][] = [
      [2, 21],
      [4, 21],
      [5, 15],
      [7, 11],
      [8, 11],
    ];
    for (const [players, per] of expected) {
      const s = newGame(players);
      for (const p of s.players) expect(p.tray).toHaveLength(per);
      expect(s.bunch).toHaveLength(144 - players * per);
    }
  });

  it('clamps a 21-tile start for 8 players so a full peel always remains', () => {
    const s = newGame(8, { startTiles: 21 });
    const per = Math.floor((144 - 8) / 8); // 17
    for (const p of s.players) expect(p.tray).toHaveLength(per);
    expect(s.bunch).toHaveLength(144 - 8 * per);
    expect(s.bunch.length).toBeGreaterThanOrEqual(8);
  });

  it('deals exactly the official 144-tile letter distribution', () => {
    const s = newGame(3);
    const counts: Record<string, number> = {};
    for (const t of [...s.bunch, ...s.players.flatMap((p) => p.tray)]) {
      counts[t.letter] = (counts[t.letter] ?? 0) + 1;
    }
    expect(counts).toEqual(BG_LETTER_COUNTS);
  });

  it('same seed → identical deal; different seed → different deal', () => {
    const a = newGame(4, {}, 123);
    const b = newGame(4, {}, 123);
    expect(a.players.map((p) => p.tray)).toEqual(b.players.map((p) => p.tray));
    expect(a.bunch).toEqual(b.bunch);
    const c = newGame(4, {}, 124);
    const order = (s: BananagramsState): string => s.bunch.map((t) => t.letter).join('');
    expect(order(c)).not.toBe(order(a));
  });
});

describe('tile conservation', () => {
  it('trays + boards + bunch stay exactly 144 unique tiles through play', () => {
    const s = newGame(4, {}, 99);
    for (let seat = 0; seat < 4; seat++) {
      const p = s.players[seat]!;
      applyBananagramsAction(s, seat, { t: 'bg', op: 'place', tileId: p.tray[0]!.id, x: 1, y: 0 });
      applyBananagramsAction(s, seat, { t: 'bg', op: 'place', tileId: p.tray[0]!.id, x: 1, y: 2 });
      const moved = [...p.board.values()][0]!;
      applyBananagramsAction(s, seat, { t: 'bg', op: 'place', tileId: moved.id, x: 3, y: 4 });
      applyBananagramsAction(s, seat, { t: 'bg', op: 'recall', tileId: moved.id });
      applyBananagramsAction(s, seat, { t: 'bg', op: 'dump', tileId: p.tray[0]!.id });
    }
    const ids = allIds(s);
    expect(ids).toHaveLength(144);
    expect(new Set(ids).size).toBe(144);
  });
});

describe('shift (move all placed tiles)', () => {
  it('slides every placed tile one cell and keeps letters intact', () => {
    const s = newGame();
    put(s, 0, 'A', 5, 5);
    put(s, 0, 'T', 6, 5);
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'shift', dx: 1, dy: 0 });
    expect(res.ok).toBe(true);
    const p = s.players[0]!;
    expect(p.board.get(bgCellKey(6, 5))!.letter).toBe('A');
    expect(p.board.get(bgCellKey(7, 5))!.letter).toBe('T');
    expect(p.board.size).toBe(2);
    const down = applyBananagramsAction(s, 0, { t: 'bg', op: 'shift', dx: 0, dy: 1 });
    expect(down.ok).toBe(true);
    expect(p.board.get(bgCellKey(6, 6))!.letter).toBe('A');
  });

  it('refuses a shift that would push any tile off the board', () => {
    const s = newGame();
    put(s, 0, 'A', 0, 3);
    put(s, 0, 'T', 1, 3);
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'shift', dx: -1, dy: 0 });
    expect(res.ok).toBe(false);
    expect(s.players[0]!.board.get(bgCellKey(0, 3))!.letter).toBe('A'); // untouched
  });

  it('refuses a shift with nothing placed', () => {
    const s = newGame();
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'shift', dx: 0, dy: 1 });
    expect(res.ok).toBe(false);
  });
});

describe('placement rules', () => {
  it('rejects out-of-bounds cells', () => {
    const s = newGame();
    const id = s.players[0]!.tray[0]!.id;
    for (const [x, y] of [
      [-1, 0],
      [0, -1],
      [BG_SIZE, 0],
      [0, BG_SIZE],
      [2.5, 3],
    ]) {
      const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: id, x: x!, y: y! });
      expect(res.ok).toBe(false);
    }
    expect(s.players[0]!.tray).toHaveLength(21);
  });

  it('rejects an occupied cell', () => {
    const s = newGame();
    const p = s.players[0]!;
    applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: p.tray[0]!.id, x: 5, y: 5 });
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: p.tray[0]!.id, x: 5, y: 5 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/occupied/i);
  });

  it("rejects another seat's tile", () => {
    const s = newGame();
    const foreign = s.players[1]!.tray[0]!.id;
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: foreign, x: 5, y: 5 });
    expect(res.ok).toBe(false);
    expect(s.players[0]!.board.size).toBe(0);
    expect(s.players[1]!.tray).toHaveLength(21);
  });

  it('moves a tile already on the board to a new cell', () => {
    const s = newGame();
    const p = s.players[0]!;
    const id = p.tray[0]!.id;
    applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: id, x: 5, y: 5 });
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: id, x: 8, y: 9 });
    expect(res.ok).toBe(true);
    expect(p.board.has(bgCellKey(5, 5))).toBe(false);
    expect(p.board.get(bgCellKey(8, 9))!.id).toBe(id);
    expect(p.tray).toHaveLength(20); // the move touched no tray tile
  });

  it('recall returns a placed tile to the tray', () => {
    const s = newGame();
    const p = s.players[0]!;
    const id = p.tray[0]!.id;
    applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: id, x: 5, y: 5 });
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'recall', tileId: id });
    expect(res.ok).toBe(true);
    expect(p.board.size).toBe(0);
    expect(p.tray).toHaveLength(21);
    // Recalling it twice fails: it is no longer on the board.
    expect(applyBananagramsAction(s, 0, { t: 'bg', op: 'recall', tileId: id }).ok).toBe(false);
  });

  it('rejects every action once the round is over', () => {
    const s = newGame();
    s.over = true;
    s.winnerSeat = 1;
    const id = s.players[0]!.tray[0]!.id;
    expect(applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: id, x: 0, y: 0 }).ok).toBe(false);
    expect(applyBananagramsAction(s, 0, { t: 'bg', op: 'recall', tileId: id }).ok).toBe(false);
    expect(applyBananagramsAction(s, 0, { t: 'bg', op: 'dump', tileId: id }).ok).toBe(false);
  });
});

describe('word validation', () => {
  it('a valid crossword (RATE across, RAG down sharing the R) is clean', () => {
    const s = newGame();
    put(s, 0, 'R', 5, 5);
    put(s, 0, 'A', 6, 5);
    put(s, 0, 'T', 7, 5);
    put(s, 0, 'E', 8, 5);
    put(s, 0, 'A', 5, 6);
    put(s, 0, 'G', 5, 7);
    const p = s.players[0]!;
    expect(p.invalidCells).toEqual([]);
    expect(p.connected).toBe(true);
  });

  it('a junk run flags exactly its own cells', () => {
    const s = newGame();
    put(s, 0, 'Q', 3, 3);
    put(s, 0, 'X', 4, 3);
    put(s, 0, 'Z', 5, 3);
    const p = s.players[0]!;
    expect(p.invalidCells).toEqual([bgCellKey(3, 3), bgCellKey(4, 3), bgCellKey(5, 3)]);
    expect(p.connected).toBe(true);
  });

  it('two separate word islands are not connected', () => {
    const s = newGame();
    put(s, 0, 'A', 0, 0);
    put(s, 0, 'T', 1, 0);
    put(s, 0, 'A', 10, 10);
    put(s, 0, 'T', 11, 10);
    const p = s.players[0]!;
    expect(p.invalidCells).toEqual([]); // both "at"s are words…
    expect(p.connected).toBe(false); // …but the grid is split
    expect(p.ready).toBe(false);
  });

  it('minWordLen 3 flags a 2-letter run that minWordLen 2 accepts', () => {
    const loose = newGame(2, { minWordLen: 2 });
    put(loose, 0, 'A', 5, 5);
    put(loose, 0, 'T', 6, 5);
    expect(loose.players[0]!.invalidCells).toEqual([]);

    const strict = newGame(2, { minWordLen: 3 });
    put(strict, 0, 'A', 5, 5);
    put(strict, 0, 'T', 6, 5);
    expect(strict.players[0]!.invalidCells).toEqual([bgCellKey(5, 5), bgCellKey(6, 5)]);
  });

  it('a single tile is connected but never ready', () => {
    const s = newGame();
    const p = s.players[0]!;
    put(s, 0, 'A', 5, 5);
    while (p.tray.length > 0) s.bunch.unshift(p.tray.pop()!);
    refreshDerived(s, p);
    expect(p.connected).toBe(true);
    expect(p.ready).toBe(false); // fewer than 2 tiles placed
  });

  it('dictionary sanity: common words in, junk out', () => {
    expect(WORDS.has('cat')).toBe(true);
    expect(WORDS.has('at')).toBe(true);
    expect(WORDS.has('zzzz')).toBe(false);
    expect(WORDS.size).toBe(172809);
  });
});

describe('peel', () => {
  it('finishing a grid with a big bunch peels one tile to every seat', () => {
    const s = newGame(3);
    const t = primeAt(s, 0);
    const bunchBefore = s.bunch.length;
    const trayBefore = s.players.map((p) => p.tray.length);
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: t.id, x: 6, y: 5 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.events).toEqual([{ t: 'peel', seat: 0, bunchLeft: bunchBefore - 3 }]);
    }
    expect(s.players[0]!.tray).toHaveLength(1); // was empty at the trigger moment
    expect(s.players[1]!.tray).toHaveLength(trayBefore[1]! + 1);
    expect(s.players[2]!.tray).toHaveLength(trayBefore[2]! + 1);
    expect(s.players[0]!.peels).toBe(1);
    expect(s.players[0]!.ready).toBe(false); // the fresh tile un-readies the seat
    expect(s.over).toBe(false);
    const ids = allIds(s);
    expect(ids).toHaveLength(144);
    expect(new Set(ids).size).toBe(144);
  });
});

describe('bananas', () => {
  it('finishing when the bunch cannot cover a peel wins the round', () => {
    const s = newGame(2);
    const t = primeAt(s, 0);
    s.bunch.length = 1; // fewer than 2 players' worth
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: t.id, x: 6, y: 5 });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events).toEqual([{ t: 'win', seat: 0, by: 'bananas' }]);
    expect(s.over).toBe(true);
    expect(s.winnerSeat).toBe(0);
    expect(m.isRoundOver(s)).toBe(true);
    const after = applyBananagramsAction(s, 1, {
      t: 'bg',
      op: 'place',
      tileId: s.players[1]!.tray[0]!.id,
      x: 0,
      y: 0,
    });
    expect(after.ok).toBe(false);
  });
});

describe('dump', () => {
  it('trades one tray tile for three from the bunch and emits the event', () => {
    const s = newGame();
    const p = s.players[0]!;
    const bunchBefore = s.bunch.length;
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'dump', tileId: p.tray[0]!.id });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.events).toEqual([{ t: 'dump', seat: 0 }]);
    expect(p.tray).toHaveLength(21 - 1 + BG_DUMP_DRAW);
    expect(s.bunch).toHaveLength(bunchBefore + 1 - BG_DUMP_DRAW);
    const ids = allIds(s);
    expect(ids).toHaveLength(144);
    expect(new Set(ids).size).toBe(144);
  });

  it('is rejected when the bunch holds fewer than 3 tiles', () => {
    const s = newGame();
    const p = s.players[0]!;
    s.bunch.length = BG_DUMP_DRAW - 1;
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'dump', tileId: p.tray[0]!.id });
    expect(res.ok).toBe(false);
    expect(p.tray).toHaveLength(21);
  });

  it('is rejected for a tile on the board', () => {
    const s = newGame();
    const p = s.players[0]!;
    const id = p.tray[0]!.id;
    applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: id, x: 5, y: 5 });
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'dump', tileId: id });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/tray/i);
    expect(p.board.size).toBe(1);
  });
});

describe('redaction', () => {
  it('opponents show a letterless silhouette; you see your own letters', () => {
    const s = newGame();
    put(s, 1, 'A', 4, 4);
    put(s, 1, 'T', 5, 4);
    const v = m.redactFor(s, 0, metas(2), null, false);
    expect(v.g).toBe('bananagrams');
    if (v.g !== 'bananagrams') return;
    const opp = v.players[1]!;
    expect(opp.silhouette).toEqual([bgCellKey(4, 4), bgCellKey(5, 4)]);
    expect(opp.trayCount).toBe(19);
    expect(opp.boardCount).toBe(2);
    expect(JSON.stringify(opp)).not.toContain('"letter"');
    expect(v.players[0]!.silhouette).toBeUndefined(); // your letters live in `you`
    expect(v.you).not.toBeNull();
    expect(v.you!.tray).toHaveLength(21);
    expect(v.you!.tray.every((t) => typeof t.letter === 'string')).toBe(true);
    expect(v.bunchCount).toBe(s.bunch.length);
    expect(v.canDump).toBe(true);
    expect(v.result).toBeNull();
  });

  it('a spectator gets you: null', () => {
    const s = newGame();
    const v = m.redactFor(s, -1, metas(2), null, false);
    if (v.g !== 'bananagrams') return;
    expect(v.you).toBeNull();
    expect(v.players[0]!.silhouette).toBeDefined();
    expect(v.players[1]!.silhouette).toBeDefined();
  });

  it('the reveal: on round end every board is shown with letters', () => {
    const s = newGame(2);
    const t = primeAt(s, 0);
    put(s, 1, 'C', 0, 0);
    s.bunch.length = 0;
    const res = applyBananagramsAction(s, 0, { t: 'bg', op: 'place', tileId: t.id, x: 6, y: 5 });
    expect(res.ok).toBe(true);
    const v = m.redactFor(s, 1, metas(2), null, false);
    if (v.g !== 'bananagrams') return;
    expect(v.canDump).toBe(false);
    expect(v.result).not.toBeNull();
    expect(v.result!.winnerSeat).toBe(0);
    expect(v.result!.boards).toHaveLength(2);
    const winner = v.result!.boards.find((b) => b.seat === 0)!;
    expect(winner.tiles.map((x) => x.letter).join('')).toBe('AT');
    expect(winner.tiles[0]).toMatchObject({ letter: 'A', x: 5, y: 5 });
    const loser = v.result!.boards.find((b) => b.seat === 1)!;
    expect(loser.tiles).toHaveLength(1);
    expect(loser.tiles[0]).toMatchObject({ letter: 'C', x: 0, y: 0 });
  });
});

describe('module wiring', () => {
  it('startRound wires the state and the roundStart event', () => {
    const { state, events } = m.startRound(settings(), 3, 2, 4, 9);
    expect(events).toEqual([{ t: 'roundStart', round: 4, dealerSeat: 0 }]);
    const s = state as BananagramsState;
    expect(s.players).toHaveLength(3);
    expect(s.round).toBe(4);
    expect(m.isRoundOver(state)).toBe(false);
  });

  it('validates actions structurally', () => {
    expect(m.validateAction({ t: 'bg', op: 'place', tileId: 3, x: 1, y: 2 })).toBe(true);
    expect(m.validateAction({ t: 'bg', op: 'recall', tileId: 0 })).toBe(true);
    expect(m.validateAction({ t: 'bg', op: 'dump', tileId: 100 })).toBe(true);
    expect(m.validateAction({ t: 'bg', op: 'place', tileId: 3, x: 1.5, y: 2 })).toBe(false);
    expect(m.validateAction({ t: 'bg', op: 'place', tileId: 3 })).toBe(false);
    expect(m.validateAction({ t: 'bg', op: 'peel', tileId: 3 })).toBe(false);
    expect(m.validateAction({ t: 'bg', op: 'dump', tileId: 'x' })).toBe(false);
    expect(m.validateAction({ t: 'bg', op: 'dump' })).toBe(false);
    expect(m.validateAction({ t: 'tetris', op: 'left' })).toBe(false);
    expect(m.validateAction(null)).toBe(false);
  });

  it('accepts valid settings patches and rejects junk', () => {
    expect(m.sanitizeSettings(settings(), { startTiles: 15 })).toEqual(settings({ startTiles: 15 }));
    expect(m.sanitizeSettings(settings(), { startTiles: 13 })).toBeNull();
    expect(m.sanitizeSettings(settings(), { minWordLen: 3 })).toEqual(settings({ minWordLen: 3 }));
    expect(m.sanitizeSettings(settings(), { minWordLen: 4 })).toBeNull();
    expect(m.sanitizeSettings(settings(), { theme: 'ocean' })).toEqual(settings({ theme: 'ocean' }));
    expect(m.sanitizeSettings(settings(), { theme: 'neon' })).toBeNull();
    expect(m.sanitizeSettings(settings(), {})).toEqual(settings());
  });

  it('illegal applyAction surfaces a readable error through the module', () => {
    const { state } = m.startRound(settings(), 2, 0, 1, 5);
    const res = m.applyAction(state, 0, { t: 'bg', op: 'recall', tileId: 9999 });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.length).toBeGreaterThan(0);
  });
});

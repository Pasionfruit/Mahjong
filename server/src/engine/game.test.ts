import { describe, expect, it } from 'vitest';
import { applyPlayerAction, applyTimeout, startRoundWithWall, type GameState } from './game';
import { rigWall, testSettings } from './testUtils';
import type { Tile, TileKind } from '@shared/tiles';

// All scenarios use setsToWin = 3 (hands of 10, win with 11) to keep specs small.

function findInHand(state: GameState, seat: number, kind: TileKind): Tile {
  const tile = state.players[seat]!.hand.find((t) => t.kind === kind);
  if (!tile) throw new Error(`seat ${seat} does not hold ${kind}`);
  return tile;
}

function discardKind(state: GameState, seat: number, kind: TileKind): void {
  const res = applyPlayerAction(state, seat, { t: 'discard', tileId: findInHand(state, seat, kind).id });
  expect(res.ok).toBe(true);
}

describe('self-draw win', () => {
  it('dealer draws the winning tile and declares', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d111 d234 d567 b2', 'c123 c456 c789 wE'],
      fronts: 'b2',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    expect(state.phase).toMatchObject({ t: 'awaitingDiscard', seat: 0 });

    const res = applyPlayerAction(state, 0, { t: 'winSelfDraw' });
    expect(res.ok).toBe(true);
    expect(state.phase.t).toBe('roundOver');
    const result = state.phase.t === 'roundOver' ? state.phase.result : null;
    expect(result).toMatchObject({ type: 'win', winnerSeat: 0, by: 'selfDraw' });
    expect(result!.winningHand).toHaveLength(11);
  });

  it('rejects a false win declaration', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d111 d234 d567 b2', 'c123 c456 c789 wE'],
      fronts: 'b9',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    const res = applyPlayerAction(state, 0, { t: 'winSelfDraw' });
    expect(res).toMatchObject({ ok: false, error: 'not a winning hand' });
  });
});

describe('pong claims', () => {
  function pongSetup() {
    const wall = rigWall({
      playerCount: 3,
      hands: [
        'd123 d456 d789 gR',
        'c123 c456 c789 wE',
        'gR gR b123 b45 b9 wW wW',
      ],
      fronts: 'wN wS',
    });
    return startRoundWithWall(testSettings(), 3, 0, 1, wall).state;
  }

  it('only the holder of two matching tiles is eligible', () => {
    const state = pongSetup();
    discardKind(state, 0, 'gR');
    expect(state.phase.t).toBe('claimWindow');
    if (state.phase.t !== 'claimWindow') return;
    expect([...state.phase.eligible.keys()]).toEqual([2]);
    expect(state.phase.eligible.get(2)).toMatchObject({ pong: true, win: false, kong: false });
  });

  it('executes the pong: meld exposed, discard reclaimed, turn jumps', () => {
    const state = pongSetup();
    discardKind(state, 0, 'gR');
    const res = applyPlayerAction(state, 2, { t: 'claim', claim: 'pong' });
    expect(res.ok).toBe(true);

    const claimant = state.players[2]!;
    expect(claimant.melds).toHaveLength(1);
    expect(claimant.melds[0]).toMatchObject({ type: 'pong', claimedFromSeat: 0 });
    expect(claimant.melds[0]!.tiles.map((t) => t.kind)).toEqual(['gR', 'gR', 'gR']);
    expect(claimant.hand).toHaveLength(8);
    expect(state.players[0]!.discards).toHaveLength(0);
    expect(state.phase).toMatchObject({ t: 'awaitingDiscard', seat: 2, drawnTileId: null });
    expect(state.turnSeat).toBe(2);
  });

  it('claim window timeout passes everyone and play continues', () => {
    const state = pongSetup();
    discardKind(state, 0, 'gR');
    applyTimeout(state);
    expect(state.players[2]!.melds).toHaveLength(0);
    expect(state.players[0]!.discards.map((t) => t.kind)).toEqual(['gR']);
    expect(state.phase).toMatchObject({ t: 'awaitingDiscard', seat: 1 });
  });
});

describe('chow claims', () => {
  it('is offered only to the seat after the discarder', () => {
    const wall = rigWall({
      playerCount: 3,
      hands: [
        'd111 d222 d333 b5',
        'b4 b6 c123 c456 wE wE',
        'b4 b6 c78 d456 wS wS b1',
      ],
      fronts: 'wN',
    });
    const { state } = startRoundWithWall(testSettings(), 3, 0, 1, wall);
    discardKind(state, 0, 'b5');

    expect(state.phase.t).toBe('claimWindow');
    if (state.phase.t !== 'claimWindow') return;
    expect([...state.phase.eligible.keys()]).toEqual([1]);
    const chows = state.phase.eligible.get(1)!.chows;
    expect(chows).toHaveLength(1);

    const tileIds = chows[0]!.map((t) => t.id) as [number, number];
    const res = applyPlayerAction(state, 1, { t: 'claim', claim: 'chow', tileIds });
    expect(res.ok).toBe(true);
    expect(state.players[1]!.melds[0]!.tiles.map((t) => t.kind)).toEqual(['b4', 'b5', 'b6']);
    expect(state.phase).toMatchObject({ t: 'awaitingDiscard', seat: 1 });
  });
});

describe('claim priority', () => {
  it('win beats an earlier pong claim; resolution waits for the win-eligible seat', () => {
    const wall = rigWall({
      playerCount: 3,
      hands: [
        'd345 d678 b456 c3',
        'c3 c3 d158 wE wS gR gG b9',
        'c12 d111 b333 wW wW',
      ],
      fronts: 'wN',
    });
    const { state } = startRoundWithWall(testSettings(), 3, 0, 1, wall);
    discardKind(state, 0, 'c3');

    const pongRes = applyPlayerAction(state, 1, { t: 'claim', claim: 'pong' });
    expect(pongRes.ok).toBe(true);
    expect(state.phase.t).toBe('claimWindow'); // still waiting on the win-eligible seat

    const winRes = applyPlayerAction(state, 2, { t: 'claim', claim: 'win' });
    expect(winRes.ok).toBe(true);
    expect(state.phase.t).toBe('roundOver');
    const result = state.phase.t === 'roundOver' ? state.phase.result : null;
    expect(result).toMatchObject({ type: 'win', winnerSeat: 2, by: 'discard', fromSeat: 0 });
    expect(result!.winningTile!.kind).toBe('c3');
  });

  it('resolves to the pong when the win-eligible seat passes', () => {
    const wall = rigWall({
      playerCount: 3,
      hands: [
        'd345 d678 b456 c3',
        'c3 c3 d158 wE wS gR gG b9',
        'c12 d111 b333 wW wW',
      ],
      fronts: 'wN',
    });
    const { state } = startRoundWithWall(testSettings(), 3, 0, 1, wall);
    discardKind(state, 0, 'c3');

    applyPlayerAction(state, 1, { t: 'claim', claim: 'pong' });
    applyPlayerAction(state, 2, { t: 'pass' });
    expect(state.phase).toMatchObject({ t: 'awaitingDiscard', seat: 1 });
    expect(state.players[1]!.melds[0]!.type).toBe('pong');
  });
});

describe('kongs', () => {
  it('exposed kong claims the discard and draws a replacement from the back', () => {
    const wall = rigWall({
      playerCount: 3,
      hands: [
        'd345 d678 b456 gG',
        'c123 c789 b789 wE',
        'gG gG gG b123 c456 d9',
      ],
      fronts: 'wN',
      backs: 'd2',
    });
    const { state } = startRoundWithWall(testSettings(), 3, 0, 1, wall);
    discardKind(state, 0, 'gG');

    const res = applyPlayerAction(state, 2, { t: 'claim', claim: 'kong' });
    expect(res.ok).toBe(true);
    const claimant = state.players[2]!;
    expect(claimant.melds[0]).toMatchObject({ type: 'kongExposed', claimedFromSeat: 0 });
    expect(claimant.melds[0]!.tiles).toHaveLength(4);
    expect(claimant.hand.some((t) => t.kind === 'd2')).toBe(true);
    const phase = state.phase;
    expect(phase.t).toBe('awaitingDiscard');
    if (phase.t === 'awaitingDiscard') {
      expect(phase.seat).toBe(2);
      expect(claimant.hand.find((t) => t.id === phase.drawnTileId)!.kind).toBe('d2');
    }
  });

  it('concealed kong exposes a hidden meld and draws a replacement', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d5555 d123 b789', 'c123 c456 c789 wE'],
      fronts: 'wN',
      backs: 'c2',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    const res = applyPlayerAction(state, 0, { t: 'concealedKong', kind: 'd5' });
    expect(res.ok).toBe(true);

    const p = state.players[0]!;
    expect(p.melds[0]!.type).toBe('kongConcealed');
    expect(p.melds[0]!.tiles.map((t) => t.kind)).toEqual(['d5', 'd5', 'd5', 'd5']);
    expect(p.hand).toHaveLength(8); // 11 - 4 + 1 replacement
    expect(p.hand.some((t) => t.kind === 'c2')).toBe(true);
  });
});

describe('flowers', () => {
  it('replaces flowers at the deal and on turn draws, from the back wall', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d111 d234 d567 f1', 'c123 c456 c789 wE'],
      fronts: 'f2',
      backs: 'b7 b8',
    });
    const { state, events } = startRoundWithWall(
      testSettings({ includeFlowers: true }),
      2,
      0,
      1,
      wall,
    );

    const p = state.players[0]!;
    expect(p.flowers.map((t) => t.kind)).toEqual(['f1', 'f2']);
    expect(p.hand.map((t) => t.kind)).toContain('b7');
    expect(p.hand.map((t) => t.kind)).toContain('b8');
    expect(p.hand).toHaveLength(11);
    expect(events.filter((e) => e.t === 'flower')).toHaveLength(2);
  });
});

describe('wall exhaustion and timeouts', () => {
  it('ends the round in a draw when the wall runs out', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d1 d4 d7 b2 b5 b8 c3 c6 c9 wE', 'd2 d5 d8 b3 b6 b9 c1 c4 c7 wS'],
      fronts: 'wN',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    discardKind(state, 0, 'wN');
    expect(state.phase.t).toBe('roundOver');
    const result = state.phase.t === 'roundOver' ? state.phase.result : null;
    expect(result).toMatchObject({ type: 'wallExhausted' });
  });

  it('turn timeout auto-discards the drawn tile', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d1 d4 d7 b2 b5 b8 c3 c6 c9 wE', 'd2 d5 d8 b3 b6 b9 c1 c4 c7 wS'],
      fronts: 'wN wW',
    });
    const { state } = startRoundWithWall(testSettings({ turnTimerSeconds: 15 }), 2, 0, 1, wall);
    const events = applyTimeout(state);
    expect(events.some((e) => e.t === 'timeout')).toBe(true);
    expect(state.players[0]!.discards.map((t) => t.kind)).toEqual(['wN']);
    expect(state.phase).toMatchObject({ t: 'awaitingDiscard', seat: 1 });
  });
});

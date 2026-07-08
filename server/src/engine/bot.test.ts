import { describe, expect, it } from 'vitest';
import { chooseClaimAction, chooseTurnAction } from './bot';
import { applyPlayerAction, startRoundWithWall, type GameState } from './game';
import { rigWall, testSettings } from './testUtils';
import type { TileKind } from '@shared/tiles';

function discardKind(state: GameState, seat: number, kind: TileKind): void {
  const tile = state.players[seat]!.hand.find((t) => t.kind === kind)!;
  const res = applyPlayerAction(state, seat, { t: 'discard', tileId: tile.id });
  expect(res.ok).toBe(true);
}

describe('bot turn actions', () => {
  it('every difficulty declares a self-drawn win', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
      const wall = rigWall({
        playerCount: 2,
        hands: ['d111 d234 d567 b2', 'c123 c456 c789 wE'],
        fronts: 'b2',
      });
      const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
      expect(chooseTurnAction(state, 0, difficulty)).toEqual({ t: 'winSelfDraw' });
    }
  });

  it('hard bot discards the lone honor over connected suit tiles', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d123 d456 d789 b5', 'c123 c456 c789 wS'],
      fronts: 'wE',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    const action = chooseTurnAction(state, 0, 'hard');
    expect(action.t).toBe('discard');
    if (action.t !== 'discard') return;
    const discarded = state.players[0]!.hand.find((t) => t.id === action.tileId)!;
    expect(discarded.kind).toBe('wE');
  });

  it('easy bot discards a legal tile', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d123 d456 d789 b5', 'c123 c456 c789 wS'],
      fronts: 'wE',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    const action = chooseTurnAction(state, 0, 'easy');
    expect(action.t).toBe('discard');
    if (action.t !== 'discard') return;
    expect(state.players[0]!.hand.some((t) => t.id === action.tileId)).toBe(true);
  });
});

describe('bot claim actions', () => {
  function pongWindow(): GameState {
    const wall = rigWall({
      playerCount: 3,
      hands: [
        'd123 d456 d789 gR',
        'c123 c456 c789 wE',
        'gR gR b123 b45 b9 wW wW',
      ],
      fronts: 'wN wS',
    });
    const state = startRoundWithWall(testSettings(), 3, 0, 1, wall).state;
    discardKind(state, 0, 'gR');
    expect(state.phase.t).toBe('claimWindow');
    return state;
  }

  it('easy passes on a pong', () => {
    expect(chooseClaimAction(pongWindow(), 2, 'easy')).toEqual({ t: 'pass' });
  });

  it('medium takes the pong', () => {
    expect(chooseClaimAction(pongWindow(), 2, 'medium')).toEqual({ t: 'claim', claim: 'pong' });
  });

  it('hard takes a pong that improves the hand', () => {
    expect(chooseClaimAction(pongWindow(), 2, 'hard')).toEqual({ t: 'claim', claim: 'pong' });
  });

  it('every difficulty claims a winning discard', () => {
    for (const difficulty of ['easy', 'medium', 'hard'] as const) {
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
      expect(chooseClaimAction(state, 2, difficulty)).toEqual({ t: 'claim', claim: 'win' });
    }
  });
});

import { describe, expect, it } from 'vitest';
import { applyPlayerAction, startRoundWithWall, type GameState } from './game';
import { deadlineHintMs, redactFor, type SeatMeta } from './redact';
import { rigWall, testSettings } from './testUtils';
import type { GameSettings } from '@shared/settings';

const seats: SeatMeta[] = [
  { nickname: 'Ana', connected: true, isHost: true, wins: 0 },
  { nickname: 'Ben', connected: true, isHost: false, wins: 1 },
  { nickname: 'Cho', connected: true, isHost: false, wins: 0 },
];

function pongWindowState(settings?: Partial<GameSettings>): GameState {
  const wall = rigWall({
    playerCount: 3,
    hands: [
      'd123 d456 d789 gR',
      'c123 c456 c789 wE',
      'gR gR b123 b45 b9 wW wW',
    ],
    fronts: 'wN',
  });
  const { state } = startRoundWithWall(testSettings(settings), 3, 0, 1, wall);
  const gr = state.players[0]!.hand.find((t) => t.kind === 'gR')!;
  applyPlayerAction(state, 0, { t: 'discard', tileId: gr.id });
  return state;
}

describe('redactFor', () => {
  it('hides opponents’ hands but exposes counts, melds, discards', () => {
    const state = pongWindowState();
    const view = redactFor(state, 1, seats, null);
    expect(view.hand.map((t) => t.kind).sort()).toEqual(
      state.players[1]!.hand.map((t) => t.kind).sort(),
    );
    for (const p of view.players) {
      expect(p.hand).toBeUndefined();
    }
    expect(view.players[0]!.handCount).toBe(10);
    expect(view.players[0]!.discards.map((t) => t.kind)).toEqual(['gR']);
  });

  it('reveals all hands in open-hands mode', () => {
    const state = pongWindowState({ openHands: true });
    const view = redactFor(state, 1, seats, null);
    expect(view.players[0]!.hand).toBeDefined();
    expect(view.players[2]!.hand).toBeDefined();
  });

  it('gives claim options only to the eligible seat', () => {
    const state = pongWindowState();
    const eligibleView = redactFor(state, 2, seats, null);
    expect(eligibleView.yourOptions.claim).toMatchObject({ pong: true, win: false });
    const otherView = redactFor(state, 1, seats, null);
    expect(otherView.yourOptions.claim).toBeNull();
    const discarderView = redactFor(state, 0, seats, null);
    expect(discarderView.yourOptions.claim).toBeNull();
    expect(discarderView.yourOptions.canDiscard).toBe(false);
  });

  it('masks concealed kong tiles from other players', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d5555 d123 b789', 'c123 c456 c789 wE'],
      fronts: 'wN',
      backs: 'c2',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    applyPlayerAction(state, 0, { t: 'concealedKong', kind: 'd5' });

    const ownerView = redactFor(state, 0, seats, null);
    expect(ownerView.players[0]!.melds[0]!.tiles.every((t) => t !== null)).toBe(true);
    const otherView = redactFor(state, 1, seats, null);
    expect(otherView.players[0]!.melds[0]!.tiles.every((t) => t === null)).toBe(true);
  });

  it('marks the drawn tile only for the player whose turn it is', () => {
    const wall = rigWall({
      playerCount: 2,
      hands: ['d1 d4 d7 b2 b5 b8 c3 c6 c9 wE', 'd2 d5 d8 b3 b6 b9 c1 c4 c7 wS'],
      fronts: 'wN',
    });
    const { state } = startRoundWithWall(testSettings(), 2, 0, 1, wall);
    expect(redactFor(state, 0, seats, null).drawnTileId).not.toBeNull();
    expect(redactFor(state, 1, seats, null).drawnTileId).toBeNull();
  });
});

describe('deadlineHintMs', () => {
  it('uses the turn timer for awaitingDiscard and a fixed window for claims', () => {
    const withTimer = pongWindowState({ turnTimerSeconds: 30 });
    expect(deadlineHintMs(withTimer)).toBe(7000); // claim window

    const wall = rigWall({
      playerCount: 2,
      hands: ['d1 d4 d7 b2 b5 b8 c3 c6 c9 wE', 'd2 d5 d8 b3 b6 b9 c1 c4 c7 wS'],
      fronts: 'wN',
    });
    const { state } = startRoundWithWall(testSettings({ turnTimerSeconds: 30 }), 2, 0, 1, wall);
    expect(deadlineHintMs(state)).toBe(30_000);
    const untimed = startRoundWithWall(
      testSettings({ turnTimerSeconds: 0 }),
      2,
      0,
      1,
      rigWall({
        playerCount: 2,
        hands: ['d1 d4 d7 b2 b5 b8 c3 c6 c9 wE', 'd2 d5 d8 b3 b6 b9 c1 c4 c7 wS'],
        fronts: 'wN',
      }),
    ).state;
    expect(deadlineHintMs(untimed)).toBeNull();
  });
});

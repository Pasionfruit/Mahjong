import { describe, expect, it } from 'vitest';
import { mahjongModule as m } from './index';
import { testSettings } from '../../engine/testUtils';

describe('mahjongModule.validateAction', () => {
  const ok = [
    { t: 'discard', tileId: 5 },
    { t: 'pass' },
    { t: 'claim', claim: 'win' },
    { t: 'claim', claim: 'pong' },
    { t: 'claim', claim: 'kong' },
    { t: 'claim', claim: 'chow', tileIds: [1, 2] },
    { t: 'claim', claim: 'chowIntent' }, // regression: was rejected before the refactor
    { t: 'concealedKong', kind: 'b5' },
    { t: 'addedKong', tileId: 9 },
    { t: 'winSelfDraw' },
  ];
  for (const a of ok) {
    it(`accepts ${JSON.stringify(a)}`, () => expect(m.validateAction(a)).toBe(true));
  }

  const bad = [
    null,
    {},
    { t: 'bogus' },
    { t: 'discard' }, // missing tileId
    { t: 'claim', claim: 'nope' },
    { t: 'claim', claim: 'chow' }, // chow needs tileIds
    { t: 'claim', claim: 'chow', tileIds: [1] }, // wrong length
  ];
  for (const a of bad) {
    it(`rejects ${JSON.stringify(a)}`, () => expect(m.validateAction(a)).toBe(false));
  }
});

describe('mahjongModule adapter', () => {
  it('exposes Mahjong metadata', () => {
    expect(m.id).toBe('mahjong');
    expect(m.minPlayers).toBe(2);
    expect(m.maxPlayers).toBe(4);
  });

  it('starts a round and reports the dealer owing a turn', () => {
    const { state } = m.startRound(testSettings(), 2, 0, 1, 12345);
    expect(m.isRoundOver(state)).toBe(false);
    expect(m.awaitingSeat(state)).toBe(0);
    expect(m.pendingSeats(state)).toEqual([{ seat: 0, kind: 'turn', fast: false }]);
  });

  it('produces a redacted view for a seat', () => {
    const { state } = m.startRound(testSettings(), 2, 0, 1, 12345);
    const seats = [
      { nickname: 'A', connected: true, isHost: true, wins: 0 },
      { nickname: 'B', connected: true, isHost: false, wins: 0 },
    ];
    const view = m.redactFor(state, 0, seats, null, false);
    expect(view.yourSeat).toBe(0);
    expect(view.players).toHaveLength(2);
  });
});

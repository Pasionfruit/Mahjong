import { describe, expect, it } from 'vitest';
import {
  addedKongTileIds,
  canKongFromHand,
  canPong,
  chowOptions,
  concealedKongKinds,
} from './melds';
import { tiles } from './testUtils';
import type { Meld } from '@shared/view';

describe('pong / kong eligibility', () => {
  it('pong needs two matching tiles', () => {
    expect(canPong(tiles('d5 d5 b1'), 'd5')).toBe(true);
    expect(canPong(tiles('d5 b1 c9'), 'd5')).toBe(false);
  });

  it('exposed kong needs three matching tiles', () => {
    expect(canKongFromHand(tiles('d5 d5 d5'), 'd5')).toBe(true);
    expect(canKongFromHand(tiles('d5 d5 b1'), 'd5')).toBe(false);
  });

  it('detects concealed kongs', () => {
    expect(concealedKongKinds(tiles('d5 d5 d5 d5 b1'))).toEqual(['d5']);
    expect(concealedKongKinds(tiles('d5 d5 d5 b1'))).toEqual([]);
  });

  it('detects added-kong tiles against exposed pongs', () => {
    const hand = tiles('d5 b1');
    const melds: Meld[] = [{ type: 'pong', tiles: tiles('d5 d5 d5'), claimedFromSeat: 1 }];
    expect(addedKongTileIds(hand, melds)).toEqual([hand[0]!.id]);
    expect(addedKongTileIds(tiles('b1 c2'), melds)).toEqual([]);
  });
});

describe('chowOptions', () => {
  it('returns all three run variants when hand allows', () => {
    // hand 3,4,6,7 vs discarded 5 -> 345, 456, 567
    const opts = chowOptions(tiles('b3 b4 b6 b7'), 'b5');
    expect(opts.map((p) => p.map((t) => t.kind).sort())).toEqual([
      ['b3', 'b4'],
      ['b4', 'b6'],
      ['b6', 'b7'],
    ]);
  });

  it('respects rank bounds', () => {
    expect(chowOptions(tiles('d2 d3'), 'd1').length).toBe(1); // only 123
    expect(chowOptions(tiles('d8 d7'), 'd9').length).toBe(1); // only 789
  });

  it('requires same suit', () => {
    expect(chowOptions(tiles('b4 c6'), 'd5')).toEqual([]);
  });

  it('never offers chows on honor discards', () => {
    expect(chowOptions(tiles('wE wS'), 'wW')).toEqual([]);
  });
});

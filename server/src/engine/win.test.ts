import { describe, expect, it } from 'vitest';
import { isWinningHand } from './win';
import { k } from './testUtils';

describe('standard win: N sets + 1 pair', () => {
  it('accepts a fully concealed N=5 hand (17 tiles)', () => {
    expect(isWinningHand(k('d111 d234 d567 c345 c678 b22'), 0, 5)).toBe(true);
  });

  it('accepts mixed triplets and runs with honors as sets/pair', () => {
    expect(isWinningHand(k('d123 d456 b789 wNx3 gRx3 wE wE'), 0, 5)).toBe(true);
  });

  it('accepts with exposed melds reducing the concealed requirement', () => {
    // 2 exposed melds -> 3 concealed sets + pair = 11 tiles
    expect(isWinningHand(k('d123 d456 c789 wNx2'), 2, 5)).toBe(true);
    // 5 exposed melds -> just the pair
    expect(isWinningHand(k('b33'), 5, 5)).toBe(true);
  });

  it('scales to N=4 and N=3', () => {
    expect(isWinningHand(k('d111 d234 c345 b678 wE wE'), 0, 4)).toBe(true);
    expect(isWinningHand(k('d111222333 b44'), 0, 3)).toBe(true);
  });

  it('handles hands needing runs over triplets (multi-decomposition)', () => {
    // d112233 must decompose as 123+123, not 11+22+33
    expect(isWinningHand(k('d112233 d456 c789 b55 wSx3'), 0, 5)).toBe(true);
  });

  it('uses a concealed 4-of-a-kind as triplet + one leftover correctly', () => {
    // d1111 can't be one set + spare pair half; needs the 4th tile in a run
    expect(isWinningHand(k('d111 d123 d456 c234 c88 wWx3'), 0, 5)).toBe(true);
    expect(isWinningHand(k('d1111 d23 d456 c234 c88 wWx3'), 0, 5)).toBe(true); // 1+123 + 111... same tiles rearranged
  });

  it('rejects a hand one tile off', () => {
    expect(isWinningHand(k('d111 d234 d567 c345 c678 b23'), 0, 5)).toBe(false);
  });

  it('rejects honor runs (winds/dragons cannot form sequences)', () => {
    expect(isWinningHand(k('d123 d456 d789 c111 wE wS wW b22'), 0, 5)).toBe(false);
  });

  it('rejects when hand size does not match N and exposed melds', () => {
    // 17 tiles but 2 melds exposed already -> impossible
    expect(isWinningHand(k('d111 d234 d567 c345 c678 b22'), 2, 5)).toBe(false);
  });

  it('rejects runs that wrap around 9-1', () => {
    // the only dots are 8,9,1 — a set exists only if 8-9-1 wrapped
    expect(isWinningHand(k('d891 c234 c567 b234 b567 wE wE'), 0, 5)).toBe(false);
  });
});

describe('pairs win: (N+2) pairs + 1 set', () => {
  it('accepts 7 pairs + concealed run at N=5', () => {
    expect(isWinningHand(k('d11 d22 d33 d44 b55 b66 c77 c123'), 0, 5)).toBe(true);
  });

  it('accepts 7 pairs + concealed triplet at N=5', () => {
    expect(isWinningHand(k('d11 d22 d33 d44 b55 b66 c77 wEx3'), 0, 5)).toBe(true);
  });

  it('accepts 7 pairs + one exposed meld at N=5', () => {
    expect(isWinningHand(k('d11 d22 d33 d44 b55 b66 c77'), 1, 5)).toBe(true);
  });

  it('counts a concealed 4-of-a-kind as two pairs', () => {
    expect(isWinningHand(k('d1111 d22 b33 b44 c55 c66 c123'), 0, 5)).toBe(true);
  });

  it('scales pair count with N (N=3 -> 5 pairs + set)', () => {
    expect(isWinningHand(k('d11 d22 b33 b44 c55 wSx3'), 0, 3)).toBe(true);
    expect(isWinningHand(k('d11 d22 b33 b44 c55'), 1, 3)).toBe(true);
  });

  it('rejects pairs hands with 2+ exposed melds', () => {
    expect(isWinningHand(k('d11 d22 d33 b44'), 2, 3)).toBe(false);
  });

  it('rejects 6 pairs + two spare tiles masquerading as a seventh', () => {
    expect(isWinningHand(k('d11 d22 d33 d44 b55 b66 c7 c8 c123'), 0, 5)).toBe(false);
  });
});

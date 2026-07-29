import { describe, expect, it } from 'vitest';
import { dailyRng, dailySeed, mulberry32 } from './rng';

describe('mulberry32', () => {
  it('is deterministic: same seed, same sequence', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('produces floats in [0, 1)', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 500; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('different seeds diverge', () => {
    const a = mulberry32(1)();
    const b = mulberry32(2)();
    expect(a).not.toBe(b);
  });

  it('handles negative and out-of-range seeds via >>> 0 coercion', () => {
    expect(() => mulberry32(-5)()).not.toThrow();
    expect(() => mulberry32(2 ** 40)()).not.toThrow();
  });
});

describe('dailySeed', () => {
  it('is deterministic for identical inputs', () => {
    expect(dailySeed('wordle', '2026-07-29')).toBe(dailySeed('wordle', '2026-07-29'));
  });

  it('varies by game id', () => {
    expect(dailySeed('wordle', '2026-07-29')).not.toBe(dailySeed('minesweeper', '2026-07-29'));
  });

  it('varies by date', () => {
    expect(dailySeed('wordle', '2026-07-29')).not.toBe(dailySeed('wordle', '2026-07-30'));
  });

  it('varies by salt, enabling invalidation of a broken daily', () => {
    const original = dailySeed('wordle', '2026-07-29', 'v1');
    const bumped = dailySeed('wordle', '2026-07-29', 'v2');
    expect(original).not.toBe(bumped);
  });

  it('defaults salt to "v1"', () => {
    expect(dailySeed('wordle', '2026-07-29')).toBe(dailySeed('wordle', '2026-07-29', 'v1'));
  });

  it('returns an unsigned 32-bit integer', () => {
    const seed = dailySeed('minesweeper', '2026-12-31');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });
});

describe('dailyRng', () => {
  it('is deterministic and matches mulberry32(dailySeed(...))', () => {
    const a = dailyRng('2048', '2026-07-29');
    const b = mulberry32(dailySeed('2048', '2026-07-29'));
    expect(a()).toBe(b());
  });

  it('two players on the same day get the identical puzzle sequence', () => {
    const player1 = dailyRng('wordle', '2026-08-01');
    const player2 = dailyRng('wordle', '2026-08-01');
    const seq1 = Array.from({ length: 5 }, () => player1());
    const seq2 = Array.from({ length: 5 }, () => player2());
    expect(seq1).toEqual(seq2);
  });
});

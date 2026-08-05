import { describe, expect, it } from 'vitest';
import { WORD_BANK } from './words';

describe('WORD_BANK', () => {
  it('every word is 4-8 lowercase letters', () => {
    const bad = WORD_BANK.filter((w) => !/^[a-z]{4,8}$/.test(w));
    expect(bad).toEqual([]);
  });

  it('has no duplicates', () => {
    expect(new Set(WORD_BANK).size).toBe(WORD_BANK.length);
  });

  it('has a reasonably large bank to draw daily/endless puzzles from', () => {
    expect(WORD_BANK.length).toBeGreaterThan(50);
  });
});

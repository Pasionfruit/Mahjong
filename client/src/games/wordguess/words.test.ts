import { describe, expect, it } from 'vitest';
import { ANSWER_WORDS, NORMALIZED_ANSWER_WORDS, VALID_GUESSES, isValidGuess, pickAnswer } from './words';

describe('word lists', () => {
  it('every raw ANSWER_WORDS entry is a clean 5-letter lowercase word', () => {
    const bad = ANSWER_WORDS.filter((w) => !/^[a-z]{5}$/.test(w.trim().toLowerCase()));
    expect(bad).toEqual([]);
  });

  it('has no accidental duplicate answers', () => {
    expect(NORMALIZED_ANSWER_WORDS.length).toBe(new Set(NORMALIZED_ANSWER_WORDS).size);
  });

  it('every answer is itself accepted as a valid guess', () => {
    for (const w of NORMALIZED_ANSWER_WORDS) expect(VALID_GUESSES.has(w)).toBe(true);
  });

  it('has a reasonably large answer pool', () => {
    expect(NORMALIZED_ANSWER_WORDS.length).toBeGreaterThan(150);
  });

  it('isValidGuess is case/whitespace-insensitive and rejects non-words', () => {
    expect(isValidGuess(' ABOUT ')).toBe(true);
    expect(isValidGuess('zzzzz')).toBe(false);
  });

  it('pickAnswer deterministically maps an rng draw to a word in the pool', () => {
    const word = pickAnswer(() => 0.1);
    expect(NORMALIZED_ANSWER_WORDS).toContain(word);
    expect(pickAnswer(() => 0.1)).toBe(word);
  });
});

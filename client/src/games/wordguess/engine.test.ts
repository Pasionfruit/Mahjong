import { describe, expect, it } from 'vitest';
import { MAX_GUESSES, scoreGuess, wordGuessModule } from './engine';

const SETTINGS = { answer: 'apple' };

describe('scoreGuess', () => {
  it('marks every letter correct on an exact match', () => {
    expect(scoreGuess('apple', 'apple')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
  });

  it('marks present letters without double-counting when the answer has one of each', () => {
    // answer m-a-n-g-o vs guess a-r-o-m-a: the guess's second "a" has no
    // remaining unmatched "a" in the answer, so only the first counts.
    expect(scoreGuess('aroma', 'mango')).toEqual(['present', 'absent', 'present', 'present', 'absent']);
  });

  it('never double-counts a repeated answer letter against a single guess letter', () => {
    // answer a-p-p-l-e vs guess p-l-e-a-d: every non-"d" guess letter finds
    // exactly one unused match in the answer.
    expect(scoreGuess('plead', 'apple')).toEqual(['present', 'present', 'present', 'present', 'absent']);
  });

  it('is case-insensitive', () => {
    expect(scoreGuess('APPLE', 'apple')).toEqual(['correct', 'correct', 'correct', 'correct', 'correct']);
  });
});

describe('wordGuessModule', () => {
  it('rejects a guess that is not in the dictionary', () => {
    const state = wordGuessModule.generate(1, SETTINGS);
    expect(wordGuessModule.applyMove(state, { guess: 'zzzzz' })).toBeNull();
  });

  it('accepts a valid guess and records feedback', () => {
    const state = wordGuessModule.generate(1, SETTINGS);
    const next = wordGuessModule.applyMove(state, { guess: 'plead' });
    expect(next?.guesses).toEqual(['plead']);
    expect(next?.feedback).toHaveLength(1);
  });

  it('reports won as soon as the answer is guessed, even before 6 tries', () => {
    let state = wordGuessModule.generate(1, SETTINGS);
    state = wordGuessModule.applyMove(state, { guess: 'plead' })!;
    expect(wordGuessModule.status(state)).toBe('playing');
    state = wordGuessModule.applyMove(state, { guess: 'apple' })!;
    expect(wordGuessModule.status(state)).toBe('won');
    expect(wordGuessModule.result(state)).toEqual({ status: 'won', score: 500, stats: { guesses: 2 } });
  });

  it('reports lost after 6 wrong guesses, with score 0', () => {
    let state = wordGuessModule.generate(1, SETTINGS);
    const wrongGuesses = ['plead', 'crony', 'ditch', 'humor', 'vivid', 'globe'];
    for (const guess of wrongGuesses) state = wordGuessModule.applyMove(state, { guess })!;
    expect(state.guesses).toHaveLength(MAX_GUESSES);
    expect(wordGuessModule.status(state)).toBe('lost');
    expect(wordGuessModule.result(state)).toEqual({ status: 'lost', score: 0, stats: { guesses: 6 } });
  });

  it('refuses further guesses once already won', () => {
    let state = wordGuessModule.generate(1, SETTINGS);
    state = wordGuessModule.applyMove(state, { guess: 'apple' })!;
    expect(wordGuessModule.applyMove(state, { guess: 'plead' })).toBeNull();
  });

  it('scores a 1-guess win higher than a slower win', () => {
    let fast = wordGuessModule.generate(1, SETTINGS);
    fast = wordGuessModule.applyMove(fast, { guess: 'apple' })!;
    let slow = wordGuessModule.generate(1, SETTINGS);
    slow = wordGuessModule.applyMove(slow, { guess: 'plead' })!;
    slow = wordGuessModule.applyMove(slow, { guess: 'apple' })!;
    expect(wordGuessModule.result(fast)!.score).toBeGreaterThan(wordGuessModule.result(slow)!.score);
  });

  it('replay reproduces the exact same state from a move log', () => {
    const moveLog = [{ guess: 'plead' }, { guess: 'apple' }];
    let state = wordGuessModule.generate(1, SETTINGS);
    for (const m of moveLog) state = wordGuessModule.applyMove(state, m)!;
    const replayed = wordGuessModule.replay(1, SETTINGS, moveLog);
    expect(replayed).toEqual(state);
  });

  it('shareText renders a spoiler-free emoji grid, empty while still playing', () => {
    let state = wordGuessModule.generate(1, SETTINGS);
    expect(wordGuessModule.shareText!(state)).toBe('');
    state = wordGuessModule.applyMove(state, { guess: 'plead' })!;
    state = wordGuessModule.applyMove(state, { guess: 'apple' })!;
    const text = wordGuessModule.shareText!(state);
    expect(text).toContain('2/6');
    expect(text).not.toMatch(/apple/i);
    expect(text).toContain('🟩');
  });
});

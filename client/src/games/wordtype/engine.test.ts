import { describe, expect, it } from 'vitest';
import { WORDS } from './data';
import {
  PENALTY_MS,
  createRun,
  finalMs,
  pickEntry,
  sectionsFor,
  totalChars,
  typeChar,
  typedChars,
  wpm,
  type RunState,
} from './engine';

const ENTRY = { word: 'cat', definition: 'A cat.', story: 'Cat sat. Cat ran.' };

/** Type an exact string of (correct) characters into the run. */
function typeAll(state: RunState, text: string): RunState {
  for (const ch of text) state = typeChar(state, ch).state;
  return state;
}

describe('data pool', () => {
  it('every entry is ASCII-typeable with a word, definition, and 2-sentence story', () => {
    expect(WORDS.length).toBeGreaterThanOrEqual(30);
    for (const e of WORDS) {
      for (const field of [e.word, e.definition, e.story]) {
        expect(field.length).toBeGreaterThan(0);
        // plain ASCII only — no curly quotes/dashes a keyboard can't type
        expect([...field].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127)).toBe(true);
      }
      // exactly two sentences: two terminal periods (allowing . inside none)
      expect(e.story.trim().split(/[.!?]+\s*/).filter(Boolean)).toHaveLength(2);
      expect(e.story.toLowerCase()).toContain(e.word.slice(0, Math.max(4, e.word.length - 4)).toLowerCase());
    }
  });

  it('picks the same daily entry for the same seed, spread across the pool', () => {
    expect(pickEntry(7)).toBe(pickEntry(7));
    expect(pickEntry(7)).not.toBe(pickEntry(8));
    expect(pickEntry(WORDS.length + 3)).toBe(WORDS[3]);
  });
});

describe('typing', () => {
  it('advances only on the correct character', () => {
    let s = createRun(ENTRY);
    const wrong = typeChar(s, 'x');
    expect(wrong.correct).toBe(false);
    expect(wrong.state.pos).toBe(0);
    expect(wrong.state.mistakes).toBe(1);
    const right = typeChar(wrong.state, 'c');
    expect(right.correct).toBe(true);
    expect(right.state.pos).toBe(1);
    expect(right.state.mistakes).toBe(1);
  });

  it('rolls through word → definition → story and finishes', () => {
    let s = createRun(ENTRY);
    s = typeAll(s, 'cat');
    expect(s.section).toBe(1);
    expect(s.pos).toBe(0);
    s = typeAll(s, 'A cat.');
    expect(s.section).toBe(2);
    s = typeAll(s, 'Cat sat. Cat ran.');
    expect(s.done).toBe(true);
    expect(typedChars(s)).toBe(totalChars(s));
  });

  it('is case-sensitive', () => {
    const s = typeAll(createRun(ENTRY), 'cat');
    const r = typeChar(s, 'a'); // definition starts with 'A'
    expect(r.correct).toBe(false);
  });

  it('ignores input after completion', () => {
    let s = typeAll(createRun(ENTRY), 'catA cat.Cat sat. Cat ran.');
    expect(s.done).toBe(true);
    const after = typeChar(s, 'x');
    expect(after.state).toBe(s);
    expect(after.state.mistakes).toBe(0);
  });

  it('counts typed chars across sections', () => {
    let s = typeAll(createRun(ENTRY), 'catA c');
    expect(typedChars(s)).toBe(6);
  });
});

describe('scoring', () => {
  it('adds a fixed penalty per mistake', () => {
    expect(finalMs(10_000, 0)).toBe(10_000);
    expect(finalMs(10_000, 4)).toBe(10_000 + 4 * PENALTY_MS);
  });

  it('computes standard 5-chars-per-word wpm', () => {
    expect(wpm(300, 60_000)).toBe(60);
    expect(wpm(0, 60_000)).toBe(0);
    expect(wpm(100, 0)).toBe(0);
  });

  it('sectionsFor exposes the three parts in typing order', () => {
    expect(sectionsFor(ENTRY).map((s) => s.label)).toEqual(['word', 'definition', 'story']);
  });
});

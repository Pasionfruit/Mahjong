import { WORDS, type WordEntry } from './data';

/**
 * Pure Word Type engine: a strict copy-typing run over three sections —
 * the word of the day, its definition, and a two-sentence story. The
 * cursor only advances on the correct character; every wrong keystroke
 * counts as a mistake, and each mistake costs PENALTY_MS on the clock.
 * Final score = elapsed ms + mistakes * PENALTY_MS (lower is better).
 */

export const PENALTY_MS = 500;

export type SectionLabel = 'word' | 'definition' | 'story';

export interface Section {
  label: SectionLabel;
  text: string;
}

export interface RunState {
  sections: Section[];
  /** Index of the section being typed. */
  section: number;
  /** Char index within the current section. */
  pos: number;
  mistakes: number;
  done: boolean;
}

/** Deterministic word-of-the-day pick — same seed, same word for everyone. */
export function pickEntry(seed: number): WordEntry {
  return WORDS[((seed % WORDS.length) + WORDS.length) % WORDS.length]!;
}

export function sectionsFor(entry: WordEntry): Section[] {
  return [
    { label: 'word', text: entry.word },
    { label: 'definition', text: entry.definition },
    { label: 'story', text: entry.story },
  ];
}

export function createRun(entry: WordEntry): RunState {
  return { sections: sectionsFor(entry), section: 0, pos: 0, mistakes: 0, done: false };
}

/** One keystroke. Correct chars advance (rolling into the next section and
 *  finishing after the last); wrong ones only bump the mistake count. */
export function typeChar(state: RunState, ch: string): { state: RunState; correct: boolean } {
  if (state.done || ch.length !== 1) return { state, correct: false };
  const text = state.sections[state.section]!.text;
  if (ch !== text[state.pos]) {
    return { state: { ...state, mistakes: state.mistakes + 1 }, correct: false };
  }
  let { section, pos } = state;
  pos += 1;
  let done = false;
  if (pos >= text.length) {
    if (section + 1 >= state.sections.length) done = true;
    else {
      section += 1;
      pos = 0;
    }
  }
  return { state: { ...state, section, pos, done }, correct: true };
}

export function totalChars(state: RunState): number {
  return state.sections.reduce((n, s) => n + s.text.length, 0);
}

export function typedChars(state: RunState): number {
  if (state.done) return totalChars(state);
  let n = 0;
  for (let i = 0; i < state.section; i++) n += state.sections[i]!.text.length;
  return n + state.pos;
}

/** Standard words-per-minute: 5 chars = one word. */
export function wpm(chars: number, elapsedMs: number): number {
  if (elapsedMs <= 0) return 0;
  return Math.round((chars / 5) / (elapsedMs / 60000));
}

/** The score the leaderboard ranks by (ascending). */
export function finalMs(elapsedMs: number, mistakes: number): number {
  return elapsedMs + mistakes * PENALTY_MS;
}

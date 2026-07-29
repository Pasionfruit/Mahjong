import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';
import { isValidGuess } from './words';

export const MAX_GUESSES = 6;
export const WORD_LENGTH = 5;

export type LetterState = 'correct' | 'present' | 'absent';

export interface WordGuessSettings {
  /** Resolved by the caller before generate() — daily mode fetches this
   *  from the server-gated RPC, endless mode picks it locally. Never
   *  derived inside the pure engine itself; see the design doc on why the
   *  daily answer can't be a pure function of the seed alone. */
  answer: string;
}

export interface WordGuessState {
  answer: string;
  guesses: string[];
  feedback: LetterState[][];
}

export interface WordGuessMove {
  guess: string;
}

/** Standard Wordle-style duplicate-letter-aware scoring: exact matches
 *  first, then present-elsewhere matches consume only the answer's
 *  remaining (unmatched) letter counts. */
export function scoreGuess(guess: string, answer: string): LetterState[] {
  const g = guess.toLowerCase().split('');
  const a = answer.toLowerCase().split('');
  const result: LetterState[] = new Array(WORD_LENGTH).fill('absent');
  const used = new Array(WORD_LENGTH).fill(false);

  for (let i = 0; i < WORD_LENGTH; i++) {
    if (g[i] === a[i]) {
      result[i] = 'correct';
      used[i] = true;
    }
  }
  for (let i = 0; i < WORD_LENGTH; i++) {
    if (result[i] === 'correct') continue;
    const j = a.findIndex((c, idx) => c === g[i] && !used[idx]);
    if (j !== -1) {
      result[i] = 'present';
      used[j] = true;
    }
  }
  return result;
}

function generate(_seed: number, settings: WordGuessSettings): WordGuessState {
  return { answer: settings.answer.toLowerCase(), guesses: [], feedback: [] };
}

function applyMove(state: WordGuessState, move: WordGuessMove): WordGuessState | null {
  if (state.guesses.length >= MAX_GUESSES) return null;
  if (state.feedback.some((f) => f.every((s) => s === 'correct'))) return null; // already won
  const guess = move.guess.trim().toLowerCase();
  if (!isValidGuess(guess)) return null;
  return {
    ...state,
    guesses: [...state.guesses, guess],
    feedback: [...state.feedback, scoreGuess(guess, state.answer)],
  };
}

function status(state: WordGuessState): SoloStatus {
  const won = state.feedback.some((f) => f.every((s) => s === 'correct'));
  if (won) return 'won';
  if (state.guesses.length >= MAX_GUESSES) return 'lost';
  return 'playing';
}

function result(state: WordGuessState): SoloResult | null {
  const s = status(state);
  if (s === 'playing') return null;
  const won = s === 'won';
  const guessesUsed = state.guesses.length;
  // Higher is better; a 1-guess win scores highest, a loss scores 0 — a
  // loss can never accidentally rank above any real win.
  const score = won ? (MAX_GUESSES + 1 - guessesUsed) * 100 : 0;
  return { status: s, score, stats: { guesses: guessesUsed } };
}

function replay(seed: number, settings: WordGuessSettings, moveLog: WordGuessMove[]): WordGuessState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

/** Wordle-style emoji grid — the shareable result summary, no answer text. */
function shareText(state: WordGuessState): string {
  const s = status(state);
  if (s === 'playing') return '';
  const label = s === 'won' ? `${state.guesses.length}/${MAX_GUESSES}` : `X/${MAX_GUESSES}`;
  const grid = state.feedback
    .map((row) => row.map((c) => (c === 'correct' ? '🟩' : c === 'present' ? '🟨' : '⬛')).join(''))
    .join('\n');
  return `Word Guess ${label}\n${grid}`;
}

export const wordGuessModule: SoloGameModule<WordGuessState, WordGuessMove, WordGuessSettings> = {
  id: 'wordguess',
  scoreDirection: 'desc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

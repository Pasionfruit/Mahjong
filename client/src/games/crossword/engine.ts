import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';
import { PUZZLES, type CrosswordPuzzle } from './data';

/**
 * 5×5 mini crossword as a pure SoloGameModule. generate(seed) picks a
 * puzzle from the hand-authored bank (seed % bank size), so the daily seed
 * gives everyone the same mini and endless picks a random one. Standard
 * crossword numbering is derived programmatically from the grid shape —
 * the data file's clue numbers are validated against it in tests, never
 * hand-trusted. Timing mirrors minesweeper: timestamps ride on the moves
 * so replay() is a pure fold with no wall-clock reads.
 */

export const SIZE = 5;
export const CELLS = SIZE * SIZE;

export interface CrosswordState {
  /** Index into PUZZLES — kept in state so the UI can find its clues. */
  puzzle: number;
  /** Solution rows (5 strings of '#' | 'A'–'Z') — the source of truth. */
  solution: string[];
  /** Player letters, 25 entries: '' = empty (always '' on black cells). */
  letters: string[];
  firstMoveAt: number | null;
  lastMoveAt: number | null;
}

export interface CrosswordMove {
  cell: number;
  /** 'A'–'Z' to write, '' to erase. */
  letter: string;
  /** Client timestamp (Date.now()) — timing as move data, replay-safe. */
  at: number;
}

export interface CrosswordEntry {
  num: number;
  dir: 'across' | 'down';
  /** Flat cell indices (row * 5 + col), in reading order. */
  cells: number[];
  answer: string;
}

export function letterAt(grid: string[], cell: number): string {
  return grid[Math.floor(cell / SIZE)]?.[cell % SIZE] ?? '#';
}

export function isBlack(grid: string[], cell: number): boolean {
  return letterAt(grid, cell) === '#';
}

/**
 * Standard crossword numbering: scan row-major; a cell gets the next
 * number if it starts an across run (nothing white to its left, something
 * white to its right) or a down run (same, vertically). Every run of ≥2
 * becomes an entry — the bank validation separately guarantees no run of
 * exactly 2 exists.
 */
export function computeEntries(grid: string[]): { across: CrosswordEntry[]; down: CrosswordEntry[] } {
  const across: CrosswordEntry[] = [];
  const down: CrosswordEntry[] = [];
  let num = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (letterAt(grid, r * SIZE + c) === '#') continue;
      const startsAcross =
        (c === 0 || letterAt(grid, r * SIZE + c - 1) === '#') &&
        c + 1 < SIZE &&
        letterAt(grid, r * SIZE + c + 1) !== '#';
      const startsDown =
        (r === 0 || letterAt(grid, (r - 1) * SIZE + c) === '#') &&
        r + 1 < SIZE &&
        letterAt(grid, (r + 1) * SIZE + c) !== '#';
      if (!startsAcross && !startsDown) continue;
      num++;
      if (startsAcross) {
        const cells: number[] = [];
        for (let i = c; i < SIZE && letterAt(grid, r * SIZE + i) !== '#'; i++) cells.push(r * SIZE + i);
        across.push({ num, dir: 'across', cells, answer: cells.map((i) => letterAt(grid, i)).join('') });
      }
      if (startsDown) {
        const cells: number[] = [];
        for (let i = r; i < SIZE && letterAt(grid, i * SIZE + c) !== '#'; i++) cells.push(i * SIZE + c);
        down.push({ num, dir: 'down', cells, answer: cells.map((i) => letterAt(grid, i)).join('') });
      }
    }
  }
  return { across, down };
}

export function puzzleAt(index: number): CrosswordPuzzle {
  const p = PUZZLES[index];
  if (!p) throw new Error(`crossword: no puzzle at index ${index}`);
  return p;
}

export type CrosswordDifficulty = 'easy' | 'medium' | 'hard';
export const DIFFICULTIES: CrosswordDifficulty[] = ['easy', 'medium', 'hard'];

export interface CrosswordSettings {
  /** Endless mode only — null (daily, or "any") draws from the whole bank. */
  difficulty: CrosswordDifficulty | null;
}

// Standard Scrabble letter values as a difficulty proxy: puzzles built from
// rarer letters (Q/X/Z/J/K, or a lot of F/H/V/W/Y) are genuinely harder to
// intersect your way through than ones built from common vowels/consonants.
// Deterministic and grid-derived, so no per-puzzle authoring is needed.
const LETTER_SCORE: Record<string, number> = {
  A: 1, E: 1, I: 1, O: 1, U: 1, L: 1, N: 1, S: 1, T: 1, R: 1,
  D: 2, G: 2,
  B: 3, C: 3, M: 3, P: 3,
  F: 4, H: 4, V: 4, W: 4, Y: 4,
  K: 5,
  J: 8, X: 8,
  Q: 10, Z: 10,
};

function difficultyScore(grid: string[]): number {
  let score = 0;
  for (const row of grid) for (const ch of row) if (ch !== '#') score += LETTER_SCORE[ch] ?? 0;
  return score;
}

/** Puzzle index -> difficulty, computed once by ranking the whole bank on
 *  difficultyScore and splitting it into equal thirds (ties broken by index
 *  for a stable, reproducible split). */
const PUZZLE_DIFFICULTY: CrosswordDifficulty[] = (() => {
  const ranked = PUZZLES.map((p, i) => ({ i, score: difficultyScore(p.grid) }));
  ranked.sort((a, b) => a.score - b.score || a.i - b.i);
  const result: CrosswordDifficulty[] = new Array(PUZZLES.length);
  const third = Math.ceil(PUZZLES.length / 3);
  ranked.forEach(({ i }, rank) => {
    result[i] = rank < third ? 'easy' : rank < third * 2 ? 'medium' : 'hard';
  });
  return result;
})();

export function difficultyOf(puzzleIndex: number): CrosswordDifficulty {
  return PUZZLE_DIFFICULTY[puzzleIndex]!;
}

function poolFor(settings: CrosswordSettings): number[] {
  if (!settings.difficulty) return PUZZLES.map((_, i) => i);
  const diff = settings.difficulty;
  return PUZZLE_DIFFICULTY.reduce<number[]>((acc, d, i) => {
    if (d === diff) acc.push(i);
    return acc;
  }, []);
}

function generate(seed: number, settings: CrosswordSettings): CrosswordState {
  const pool = poolFor(settings);
  const index = pool[(seed >>> 0) % pool.length]!;
  return {
    puzzle: index,
    solution: puzzleAt(index).grid,
    letters: Array.from({ length: CELLS }, () => ''),
    firstMoveAt: null,
    lastMoveAt: null,
  };
}

function isWon(state: CrosswordState): boolean {
  for (let i = 0; i < CELLS; i++) {
    const sol = letterAt(state.solution, i);
    if (sol === '#') continue;
    if (state.letters[i] !== sol) return false;
  }
  return true;
}

function applyMove(state: CrosswordState, move: CrosswordMove): CrosswordState | null {
  if (isWon(state)) return null;
  const { cell, letter } = move;
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return null;
  if (isBlack(state.solution, cell)) return null;
  if (letter !== '' && !/^[A-Z]$/.test(letter)) return null;
  if (state.letters[cell] === letter) return null; // no-op
  const letters = state.letters.slice();
  letters[cell] = letter;
  return { ...state, letters, firstMoveAt: state.firstMoveAt ?? move.at, lastMoveAt: move.at };
}

function status(state: CrosswordState): SoloStatus {
  return isWon(state) ? 'won' : 'playing';
}

function result(state: CrosswordState): SoloResult | null {
  if (!isWon(state)) return null;
  const elapsedMs =
    state.firstMoveAt !== null && state.lastMoveAt !== null ? state.lastMoveAt - state.firstMoveAt : 0;
  return {
    status: 'won',
    score: elapsedMs,
    stats: { time: Math.round(elapsedMs / 100) / 10, puzzle: state.puzzle, difficulty: difficultyOf(state.puzzle) },
  };
}

function replay(seed: number, settings: CrosswordSettings, moveLog: CrosswordMove[]): CrosswordState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: CrosswordState): string {
  const r = result(state);
  if (!r) return '';
  return `Crossword Mini ✅ — solved in ${r.stats?.time}s`;
}

export const crosswordModule: SoloGameModule<CrosswordState, CrosswordMove, CrosswordSettings> = {
  id: 'crossword',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

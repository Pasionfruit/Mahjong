import { mulberry32 } from '@shared/rng';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';
import { WORD_BANK } from './words';

export const GRID_SIZE = 10;
export const WORDS_PER_PUZZLE = 6;

const DIRECTIONS: { dRow: number; dCol: number }[] = [
  { dRow: 0, dCol: 1 },
  { dRow: 0, dCol: -1 },
  { dRow: 1, dCol: 0 },
  { dRow: -1, dCol: 0 },
  { dRow: 1, dCol: 1 },
  { dRow: 1, dCol: -1 },
  { dRow: -1, dCol: 1 },
  { dRow: -1, dCol: -1 },
];

export interface PlacedWord {
  word: string;
  row: number;
  col: number;
  dRow: number;
  dCol: number;
}

export interface Puzzle {
  /** GRID_SIZE*GRID_SIZE letters, row-major. */
  grid: string[];
  words: PlacedWord[];
}

export interface WordSearchState {
  puzzle: Puzzle;
  found: string[];
  firstMoveAt: number | null;
  lastMoveAt: number | null;
}

export interface WordSearchMove {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  at: number;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function cellIndex(row: number, col: number): number {
  return row * GRID_SIZE + col;
}

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < GRID_SIZE && col >= 0 && col < GRID_SIZE;
}

function canPlace(grid: (string | null)[], word: string, row: number, col: number, dRow: number, dCol: number): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = row + dRow * i;
    const c = col + dCol * i;
    if (!inBounds(r, c)) return false;
    const existing = grid[cellIndex(r, c)];
    if (existing !== null && existing !== word[i]) return false;
  }
  return true;
}

function place(grid: (string | null)[], word: string, row: number, col: number, dRow: number, dCol: number): void {
  for (let i = 0; i < word.length; i++) {
    grid[cellIndex(row + dRow * i, col + dCol * i)] = word[i]!;
  }
}

/**
 * Deterministic puzzle: WORDS_PER_PUZZLE words from the bank (seed-picked),
 * longest-first for easier placement, each dropped into the first
 * seed-shuffled (position, direction) combo that fits without conflicting
 * with an already-placed letter (overlaps are fine when the letters
 * agree). Remaining cells fill with random letters. 100 cells is generous
 * for 6 words averaging ~5-6 letters, so placement essentially never fails
 * within the attempt budget.
 */
export function generatePuzzle(seed: number): Puzzle {
  const rand = mulberry32(seed);
  const chosen = shuffle(WORD_BANK, rand)
    .slice(0, WORDS_PER_PUZZLE)
    .sort((a, b) => b.length - a.length);

  const grid: (string | null)[] = new Array(GRID_SIZE * GRID_SIZE).fill(null);
  const words: PlacedWord[] = [];

  for (const word of chosen) {
    let placed = false;
    for (let attempt = 0; attempt < 300 && !placed; attempt++) {
      const { dRow, dCol } = DIRECTIONS[Math.floor(rand() * DIRECTIONS.length)]!;
      const row = Math.floor(rand() * GRID_SIZE);
      const col = Math.floor(rand() * GRID_SIZE);
      if (!canPlace(grid, word, row, col, dRow, dCol)) continue;
      place(grid, word, row, col, dRow, dCol);
      words.push({ word, row, col, dRow, dCol });
      placed = true;
    }
  }

  const alphabet = 'abcdefghijklmnopqrstuvwxyz';
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === null) grid[i] = alphabet[Math.floor(rand() * alphabet.length)]!;
  }

  return { grid: grid as string[], words };
}

function cellsForWord(w: PlacedWord): { row: number; col: number }[] {
  return Array.from({ length: w.word.length }, (_, i) => ({ row: w.row + w.dRow * i, col: w.col + w.dCol * i }));
}

function cellsForSelection(startRow: number, startCol: number, endRow: number, endCol: number): { row: number; col: number }[] | null {
  const dr = endRow - startRow;
  const dc = endCol - startCol;
  if (dr === 0 && dc === 0) return null;
  const stepR = Math.sign(dr);
  const stepC = Math.sign(dc);
  // A straight line means the delta is purely horizontal, vertical, or a
  // perfect 45° diagonal — i.e. |dr| and |dc| are equal or one is zero.
  if (dr !== 0 && dc !== 0 && Math.abs(dr) !== Math.abs(dc)) return null;
  const length = Math.max(Math.abs(dr), Math.abs(dc)) + 1;
  return Array.from({ length }, (_, i) => ({ row: startRow + stepR * i, col: startCol + stepC * i }));
}

function sameCells(a: { row: number; col: number }[], b: { row: number; col: number }[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.row === b[i]!.row && p.col === b[i]!.col);
}

function generate(seed: number, _settings: void): WordSearchState {
  return { puzzle: generatePuzzle(seed), found: [], firstMoveAt: null, lastMoveAt: null };
}

/**
 * A selection matches an unfound word if its cell path equals that word's
 * placed cells, in either direction (dragging start-to-end or end-to-start
 * both count — same as a real word search).
 */
function applyMove(state: WordSearchState, move: WordSearchMove): WordSearchState | null {
  if (state.found.length >= state.puzzle.words.length) return null;
  const selection = cellsForSelection(move.startRow, move.startCol, move.endRow, move.endCol);
  if (!selection) return null;

  const match = state.puzzle.words.find((w) => {
    if (state.found.includes(w.word)) return false;
    const cells = cellsForWord(w);
    return sameCells(cells, selection) || sameCells(cells, selection.slice().reverse());
  });
  if (!match) return null;

  return {
    ...state,
    found: [...state.found, match.word],
    firstMoveAt: state.firstMoveAt ?? move.at,
    lastMoveAt: move.at,
  };
}

function status(state: WordSearchState): SoloStatus {
  return state.found.length >= state.puzzle.words.length ? 'won' : 'playing';
}

function result(state: WordSearchState): SoloResult | null {
  if (status(state) === 'playing') return null;
  const elapsedMs = state.firstMoveAt !== null && state.lastMoveAt !== null ? state.lastMoveAt - state.firstMoveAt : 0;
  return { status: 'won', score: elapsedMs, stats: { time: Math.round(elapsedMs / 100) / 10, words: state.puzzle.words.length } };
}

function replay(seed: number, settings: void, moveLog: WordSearchMove[]): WordSearchState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: WordSearchState): string {
  if (status(state) !== 'won') return '';
  const res = result(state);
  return `Word Search — found all ${state.puzzle.words.length} words in ${res?.stats?.time}s`;
}

export const wordSearchModule: SoloGameModule<WordSearchState, WordSearchMove, void> = {
  id: 'wordsearch',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

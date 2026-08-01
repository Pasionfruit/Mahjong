import { mulberry32 } from '@shared/rng';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

/**
 * Classic 9×9 Sudoku as a pure SoloGameModule. Generation is fully seeded
 * (mulberry32): build a complete valid grid via backtracking with rng-
 * shuffled candidate digits, then carve givens out one cell at a time in a
 * seeded order, keeping the puzzle uniquely solvable (verified by a
 * counting solver capped at 2 solutions). Timing follows minesweeper's
 * pattern exactly: timestamps ride on the moves themselves so replay()
 * stays a pure fold and never touches the wall clock.
 */

export const SIZE = 9;
export const CELLS = SIZE * SIZE;
/** Carve until this many cells are blank (~medium difficulty), or until no
 *  further cell can be removed without losing uniqueness. */
export const REMOVE_TARGET = 48;
/** The daily is deliberately always EASY (more givens) — it's the shared
 *  everyone-plays-it ritual, not the challenge mode; endless stays medium. */
export const DAILY_REMOVE_TARGET = 38;

/** Optional per-round knobs; omitted (old saves, endless) = medium. */
export interface SudokuSettings {
  removeTarget?: number;
}

export interface SudokuState {
  /** 81 cells, row-major; 0 = not a given. */
  givens: number[];
  /** The unique full solution, 81 digits. */
  solution: number[];
  /** Current board (givens included); 0 = empty. */
  entries: number[];
  mistakes: number;
  firstMoveAt: number | null;
  lastMoveAt: number | null;
}

export type SudokuMove =
  | { type: 'set'; cell: number; value: number; at: number }
  | { type: 'clear'; cell: number; at: number };

export function rowOf(cell: number): number {
  return Math.floor(cell / SIZE);
}

export function colOf(cell: number): number {
  return cell % SIZE;
}

/** 3×3 box index (0..8), row-major. */
export function boxOf(cell: number): number {
  return Math.floor(rowOf(cell) / 3) * 3 + Math.floor(colOf(cell) / 3);
}

function shuffled<T>(items: T[], rng: () => number): T[] {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = a[i]!;
    a[i] = a[j]!;
    a[j] = tmp;
  }
  return a;
}

const DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** Fills `grid` (mutating) starting at `pos`, trying digits in an
 *  rng-shuffled order per cell — the seeded source of puzzle variety. */
function fillGrid(grid: number[], pos: number, rng: () => number): boolean {
  if (pos === CELLS) return true;
  if (grid[pos]! !== 0) return fillGrid(grid, pos + 1, rng);
  for (const d of shuffled(DIGITS, rng)) {
    if (canPlace(grid, pos, d)) {
      grid[pos] = d;
      if (fillGrid(grid, pos + 1, rng)) return true;
      grid[pos] = 0;
    }
  }
  return false;
}

function canPlace(grid: number[], cell: number, d: number): boolean {
  const r = rowOf(cell);
  const c = colOf(cell);
  for (let i = 0; i < SIZE; i++) {
    if (grid[r * SIZE + i] === d) return false;
    if (grid[i * SIZE + c] === d) return false;
  }
  const br = Math.floor(r / 3) * 3;
  const bc = Math.floor(c / 3) * 3;
  for (let dr = 0; dr < 3; dr++) {
    for (let dc = 0; dc < 3; dc++) {
      if (grid[(br + dr) * SIZE + (bc + dc)] === d) return false;
    }
  }
  return true;
}

/**
 * Counts solutions of `grid` up to `cap` using bitmask candidates + a
 * most-constrained-cell heuristic — fast enough to be called dozens of
 * times during carving (the whole generate() stays well under ~200ms).
 */
export function countSolutions(grid: number[], cap = 2): number {
  const rows = new Array<number>(SIZE).fill(0);
  const cols = new Array<number>(SIZE).fill(0);
  const boxes = new Array<number>(SIZE).fill(0);
  for (let i = 0; i < CELLS; i++) {
    const d = grid[i]!;
    if (d === 0) continue;
    const bit = 1 << d;
    if (rows[rowOf(i)]! & bit) return 0; // malformed input
    rows[rowOf(i)]! |= bit;
    cols[colOf(i)]! |= bit;
    boxes[boxOf(i)]! |= bit;
  }
  const board = grid.slice();
  let count = 0;

  function search(): void {
    if (count >= cap) return;
    // Most-constrained empty cell.
    let best = -1;
    let bestMask = 0;
    let bestSize = 10;
    for (let i = 0; i < CELLS; i++) {
      if (board[i]! !== 0) continue;
      const used = rows[rowOf(i)]! | cols[colOf(i)]! | boxes[boxOf(i)]!;
      let mask = 0;
      let size = 0;
      for (let d = 1; d <= 9; d++) {
        if (!(used & (1 << d))) {
          mask |= 1 << d;
          size++;
        }
      }
      if (size === 0) return; // dead branch
      if (size < bestSize) {
        best = i;
        bestMask = mask;
        bestSize = size;
        if (size === 1) break;
      }
    }
    if (best === -1) {
      count++;
      return;
    }
    for (let d = 1; d <= 9 && count < cap; d++) {
      const bit = 1 << d;
      if (!(bestMask & bit)) continue;
      board[best] = d;
      rows[rowOf(best)]! |= bit;
      cols[colOf(best)]! |= bit;
      boxes[boxOf(best)]! |= bit;
      search();
      board[best] = 0;
      rows[rowOf(best)]! &= ~bit;
      cols[colOf(best)]! &= ~bit;
      boxes[boxOf(best)]! &= ~bit;
    }
  }

  search();
  return count;
}

function generate(seed: number, settings?: SudokuSettings): SudokuState {
  const rng = mulberry32(seed);
  const solution = new Array<number>(CELLS).fill(0);
  fillGrid(solution, 0, rng);

  const removeTarget = settings?.removeTarget ?? REMOVE_TARGET;
  const givens = solution.slice();
  const order = shuffled(Array.from({ length: CELLS }, (_, i) => i), rng);
  let removed = 0;
  for (const cell of order) {
    if (removed >= removeTarget) break;
    const saved = givens[cell]!;
    givens[cell] = 0;
    if (countSolutions(givens, 2) === 1) removed++;
    else givens[cell] = saved;
  }

  return {
    givens,
    solution,
    entries: givens.slice(),
    mistakes: 0,
    firstMoveAt: null,
    lastMoveAt: null,
  };
}

function isWon(state: SudokuState): boolean {
  for (let i = 0; i < CELLS; i++) {
    if (state.entries[i] !== state.solution[i]) return false;
  }
  return true;
}

function applyMove(state: SudokuState, move: SudokuMove): SudokuState | null {
  if (isWon(state)) return null;
  const cell = move.cell;
  if (!Number.isInteger(cell) || cell < 0 || cell >= CELLS) return null;
  if (state.givens[cell]! !== 0) return null;
  const current = state.entries[cell]!;
  // Auto-check is always on: a cell that already matches the solution has
  // locked in as correct — no overwriting, no clearing.
  if (current !== 0 && current === state.solution[cell]) return null;

  if (move.type === 'clear') {
    if (current === 0) return null;
    const entries = state.entries.slice();
    entries[cell] = 0;
    return { ...state, entries, firstMoveAt: state.firstMoveAt ?? move.at, lastMoveAt: move.at };
  }

  const value = move.value;
  if (!Number.isInteger(value) || value < 1 || value > 9) return null;
  if (value === current) return null;
  const entries = state.entries.slice();
  entries[cell] = value;
  const mistakes = state.mistakes + (value === state.solution[cell] ? 0 : 1);
  return { ...state, entries, mistakes, firstMoveAt: state.firstMoveAt ?? move.at, lastMoveAt: move.at };
}

function status(state: SudokuState): SoloStatus {
  return isWon(state) ? 'won' : 'playing';
}

function result(state: SudokuState): SoloResult | null {
  if (!isWon(state)) return null;
  const elapsedMs =
    state.firstMoveAt !== null && state.lastMoveAt !== null ? state.lastMoveAt - state.firstMoveAt : 0;
  return {
    status: 'won',
    score: elapsedMs,
    stats: { time: Math.round(elapsedMs / 100) / 10, mistakes: state.mistakes },
  };
}

function replay(seed: number, settings: SudokuSettings | undefined, moveLog: SudokuMove[]): SudokuState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: SudokuState): string {
  const r = result(state);
  if (!r) return '';
  return `Sudoku ✅ — solved in ${r.stats?.time}s with ${state.mistakes} mistake${state.mistakes === 1 ? '' : 's'}`;
}

export const sudokuModule: SoloGameModule<SudokuState, SudokuMove, SudokuSettings | undefined> = {
  id: 'sudoku',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

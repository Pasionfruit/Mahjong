import { mulberry32 } from '@shared/rng';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

/**
 * Fixed board size for MVP — no difficulty picker, so daily scores stay
 * comparable across every player (see the design doc's Phase 1 settings
 * simplification). Classic "beginner" Minesweeper dimensions.
 */
export const ROWS = 9;
export const COLS = 9;
export const MINE_COUNT = 10;

/** A loss can never accidentally rank as a "fastest time" — see the design
 *  doc: no won/lost column on game_results, so a sentinel keeps losses at
 *  the bottom of an ascending (fastest-first) leaderboard. */
const LOSS_SENTINEL = 999_999_999;

export interface Cell {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  /** Neighboring mine count — meaningless until minesPlaced. */
  adjacent: number;
}

export interface MinesweeperState {
  seed: number;
  cells: Cell[];
  rows: number;
  cols: number;
  mineCount: number;
  minesPlaced: boolean;
  /** Index of the mine that ended the game, else null. */
  exploded: number | null;
  firstMoveAt: number | null;
  lastMoveAt: number | null;
}

export interface MinesweeperMove {
  type: 'reveal' | 'flag';
  index: number;
  /** Client timestamp (Date.now()), carried on the move itself so the pure
   *  engine never reads the wall clock — see the design doc on why timing
   *  has to be move-log data, not a side effect, to stay replay-safe. */
  at: number;
}

function neighborsOf(index: number, rows: number, cols: number): number[] {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push(nr * cols + nc);
    }
  }
  return result;
}

function placeMines(seed: number, excludeIndex: number, rows: number, cols: number, mineCount: number): Set<number> {
  const rng = mulberry32(seed);
  const excluded = new Set([excludeIndex, ...neighborsOf(excludeIndex, rows, cols)]);
  const pool: number[] = [];
  for (let i = 0; i < rows * cols; i++) if (!excluded.has(i)) pool.push(i);
  const mines = new Set<number>();
  while (mines.size < mineCount && pool.length > 0) {
    const j = Math.floor(rng() * pool.length);
    mines.add(pool[j]!);
    pool.splice(j, 1);
  }
  return mines;
}

function floodFrom(start: number, cells: Cell[], rows: number, cols: number): number[] {
  const seen = new Set<number>();
  const queue = [start];
  const toReveal: number[] = [];
  while (queue.length > 0) {
    const i = queue.shift()!;
    if (seen.has(i)) continue;
    seen.add(i);
    const cell = cells[i]!;
    if (cell.revealed || cell.flagged || cell.mine) continue;
    toReveal.push(i);
    if (cell.adjacent === 0) {
      for (const n of neighborsOf(i, rows, cols)) {
        const nc = cells[n]!;
        if (!seen.has(n) && !nc.revealed && !nc.flagged && !nc.mine) queue.push(n);
      }
    }
  }
  return toReveal;
}

function isWon(state: MinesweeperState): boolean {
  if (!state.minesPlaced) return false;
  return state.cells.every((c) => c.mine || c.revealed);
}

function generate(seed: number, _settings: void): MinesweeperState {
  const cells: Cell[] = Array.from({ length: ROWS * COLS }, () => ({
    mine: false,
    revealed: false,
    flagged: false,
    adjacent: 0,
  }));
  return {
    seed,
    cells,
    rows: ROWS,
    cols: COLS,
    mineCount: MINE_COUNT,
    minesPlaced: false,
    exploded: null,
    firstMoveAt: null,
    lastMoveAt: null,
  };
}

function applyMove(state: MinesweeperState, move: MinesweeperMove): MinesweeperState | null {
  if (state.exploded !== null || isWon(state)) return null;
  const existing = state.cells[move.index];
  if (!existing) return null;

  if (move.type === 'flag') {
    if (existing.revealed) return null;
    const cells = state.cells.slice();
    cells[move.index] = { ...existing, flagged: !existing.flagged };
    return { ...state, cells, lastMoveAt: move.at };
  }

  if (existing.flagged || existing.revealed) return null;

  let cells = state.cells;
  let minesPlaced = state.minesPlaced;
  let firstMoveAt = state.firstMoveAt;

  if (!minesPlaced) {
    const mineSet = placeMines(state.seed, move.index, state.rows, state.cols, state.mineCount);
    const withMines = state.cells.map((c, i) => ({ ...c, mine: mineSet.has(i) }));
    cells = withMines.map((c, i) => ({
      ...c,
      adjacent: neighborsOf(i, state.rows, state.cols).filter((n) => withMines[n]!.mine).length,
    }));
    minesPlaced = true;
    firstMoveAt = move.at;
  } else {
    cells = cells.slice();
  }

  const target = cells[move.index]!;
  if (target.mine) {
    cells[move.index] = { ...target, revealed: true };
    return { ...state, cells, minesPlaced, firstMoveAt, lastMoveAt: move.at, exploded: move.index };
  }

  const toReveal = floodFrom(move.index, cells, state.rows, state.cols);
  for (const i of toReveal) cells[i] = { ...cells[i]!, revealed: true };

  return { ...state, cells, minesPlaced, firstMoveAt, lastMoveAt: move.at };
}

function status(state: MinesweeperState): SoloStatus {
  if (state.exploded !== null) return 'lost';
  if (isWon(state)) return 'won';
  return 'playing';
}

function result(state: MinesweeperState): SoloResult | null {
  const s = status(state);
  if (s === 'playing') return null;
  const won = s === 'won';
  const elapsedMs =
    state.firstMoveAt !== null && state.lastMoveAt !== null ? state.lastMoveAt - state.firstMoveAt : 0;
  const flags = state.cells.filter((c) => c.flagged).length;
  return {
    status: s,
    score: won ? elapsedMs : LOSS_SENTINEL,
    stats: { time: Math.round(elapsedMs / 100) / 10, flags },
  };
}

function replay(seed: number, settings: void, moveLog: MinesweeperMove[]): MinesweeperState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: MinesweeperState): string {
  const s = status(state);
  if (s === 'playing') return '';
  const r = result(state);
  if (s === 'lost') return `Minesweeper 💥 — hit a mine after ${r?.stats?.time}s`;
  return `Minesweeper ✅ — cleared in ${r?.stats?.time}s`;
}

export const minesweeperModule: SoloGameModule<MinesweeperState, MinesweeperMove, void> = {
  id: 'minesweeper',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

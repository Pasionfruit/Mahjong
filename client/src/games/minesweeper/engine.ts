import { mulberry32 } from '@shared/rng';
import { isNoGuessSolvable } from '@shared/minesweeperSolver';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

/**
 * Fixed board size for MVP — no difficulty picker, so daily scores stay
 * comparable across every player (see the design doc's Phase 1 settings
 * simplification). Classic "beginner" Minesweeper dimensions.
 */
export const ROWS = 9;
export const COLS = 9;
export const MINE_COUNT = 10;

export interface MinesweeperSettings {
  /** Endless only: regenerate until the board needs no coin-flip guesses.
   *  The daily stays classic so everyone races the same board. */
  noGuess: boolean;
}

export const DEFAULT_MINESWEEPER_SETTINGS: MinesweeperSettings = { noGuess: false };

/** How many layouts to try before falling back to the last candidate. */
const MAX_NOGUESS_ATTEMPTS = 300;

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
  /** Whether this board was generated guess-free (endless opt-in). */
  noGuess: boolean;
  /** Second chances taken this run. Any run with continues > 0 is a
   *  practice run — see result(), which withholds it from the leaderboard. */
  continues: number;
}

export interface MinesweeperMove {
  /** 'continue' takes a second chance after an explosion: the mine that
   *  got you is un-revealed and auto-flagged, and play resumes. */
  type: 'reveal' | 'flag' | 'continue';
  /** Ignored for 'continue'. */
  index: number;
  /** Client timestamp (Date.now()), carried on the move itself so the pure
   *  engine never reads the wall clock — see the design doc on why timing
   *  has to be move-log data, not a side effect, to stay replay-safe. */
  at: number;
}

export function neighborsOf(index: number, rows: number, cols: number): number[] {
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

/** Reveals every cell in `targets`, flood-filling from each. Stops at the
 *  first mine encountered (a wrongly-placed flag elsewhere let a mine
 *  through) rather than revealing the rest — matches the fresh-reveal
 *  path's single-mine-ends-the-round behavior. */
function revealTargets(
  cells: Cell[],
  targets: number[],
  rows: number,
  cols: number,
): { cells: Cell[]; hitMine: number | null } {
  const hitMine = targets.find((n) => cells[n]!.mine);
  if (hitMine !== undefined) {
    const next = cells.slice();
    next[hitMine] = { ...next[hitMine]!, revealed: true };
    return { cells: next, hitMine };
  }
  const toReveal = new Set<number>();
  for (const t of targets) for (const i of floodFrom(t, cells, rows, cols)) toReveal.add(i);
  const next = cells.slice();
  for (const i of toReveal) next[i] = { ...next[i]!, revealed: true };
  return { cells: next, hitMine: null };
}

/** Whether a revealed numbered cell's neighboring flags already match its
 *  count — i.e. clicking it will chord (auto-reveal the rest). Exported so
 *  the UI can hint this affordance before the click happens. */
export function isChordReady(state: MinesweeperState, index: number): boolean {
  const cell = state.cells[index];
  if (!cell || !cell.revealed || cell.adjacent === 0) return false;
  const neighbors = neighborsOf(index, state.rows, state.cols);
  const flagged = neighbors.filter((n) => state.cells[n]!.flagged).length;
  return flagged === cell.adjacent && neighbors.some((n) => !state.cells[n]!.flagged && !state.cells[n]!.revealed);
}

function isWon(state: MinesweeperState): boolean {
  if (!state.minesPlaced) return false;
  return state.cells.every((c) => c.mine || c.revealed);
}

function generate(seed: number, settings: MinesweeperSettings | undefined): MinesweeperState {
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
    noGuess: settings?.noGuess ?? false,
    continues: 0,
  };
}

/** Build the adjacency-annotated board for one mine placement. */
function cellsFor(mineSet: Set<number>, base: Cell[], rows: number, cols: number): Cell[] {
  const withMines = base.map((c, i) => ({ ...c, mine: mineSet.has(i) }));
  return withMines.map((c, i) => ({
    ...c,
    adjacent: neighborsOf(i, rows, cols).filter((n) => withMines[n]!.mine).length,
  }));
}

/**
 * Lay the mines for a first click at `safeIndex`. With noGuess on, keep
 * re-rolling the layout (varying the seed deterministically, so a replay of
 * the same move log lands on the same board) until one is solvable by pure
 * logic from that opening reveal — falling back to the last candidate
 * rather than looping forever if none qualifies.
 */
function layMines(state: MinesweeperState, safeIndex: number): Cell[] {
  const { rows, cols, mineCount } = state;
  const attempts = state.noGuess ? MAX_NOGUESS_ATTEMPTS : 1;
  let candidate: Cell[] | null = null;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const mineSet = placeMines((state.seed + attempt * 0x9e3779b9) >>> 0, safeIndex, rows, cols, mineCount);
    candidate = cellsFor(mineSet, state.cells, rows, cols);
    if (!state.noGuess) break;
    const opening = floodFrom(safeIndex, candidate, rows, cols);
    if (isNoGuessSolvable(candidate, rows, cols, mineCount, opening)) break;
  }
  return candidate!;
}

function applyMove(state: MinesweeperState, move: MinesweeperMove): MinesweeperState | null {
  // A continue is the one move that's legal *because* the run is over: it
  // un-reveals the mine that got you, flags it as a marker, and resumes.
  if (move.type === 'continue') {
    if (state.exploded === null) return null; // nothing to recover from
    const cells = state.cells.slice();
    cells[state.exploded] = { ...cells[state.exploded]!, revealed: false, flagged: true };
    return { ...state, cells, exploded: null, continues: state.continues + 1, lastMoveAt: move.at };
  }

  if (state.exploded !== null || isWon(state)) return null;
  const existing = state.cells[move.index];
  if (!existing) return null;

  if (move.type === 'flag') {
    if (existing.revealed) return null;
    const cells = state.cells.slice();
    cells[move.index] = { ...existing, flagged: !existing.flagged };
    return { ...state, cells, lastMoveAt: move.at };
  }

  if (existing.revealed) {
    // Chording: clicking an already-revealed number whose adjacent flags
    // already match its count reveals the rest of its neighbors. A wrong
    // flag elsewhere can still expose a mine and end the round, same as
    // any other reveal.
    if (!isChordReady(state, move.index)) return null;
    const neighbors = neighborsOf(move.index, state.rows, state.cols);
    const targets = neighbors.filter((n) => !state.cells[n]!.flagged && !state.cells[n]!.revealed);
    const { cells, hitMine } = revealTargets(state.cells, targets, state.rows, state.cols);
    if (hitMine !== null) return { ...state, cells, lastMoveAt: move.at, exploded: hitMine };
    return { ...state, cells, lastMoveAt: move.at };
  }

  if (existing.flagged) return null;

  let cells = state.cells;
  let minesPlaced = state.minesPlaced;
  let firstMoveAt = state.firstMoveAt;

  if (!minesPlaced) {
    cells = layMines(state, move.index);
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
  // A run that took a second chance would otherwise have been a loss, so
  // ranking its time against clean runs would be comparing different games.
  // It still records (XP, play history, "continue and finish the board"),
  // it just carries the loss sentinel so it can't top a real time.
  const practice = state.continues > 0;
  return {
    status: s,
    score: won && !practice ? elapsedMs : LOSS_SENTINEL,
    stats: {
      time: Math.round(elapsedMs / 100) / 10,
      flags,
      continues: state.continues,
      noGuess: state.noGuess ? 1 : 0,
    },
  };
}

function replay(
  seed: number,
  settings: MinesweeperSettings | undefined,
  moveLog: MinesweeperMove[],
): MinesweeperState {
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

export const minesweeperModule: SoloGameModule<
  MinesweeperState,
  MinesweeperMove,
  MinesweeperSettings | undefined
> = {
  id: 'minesweeper',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

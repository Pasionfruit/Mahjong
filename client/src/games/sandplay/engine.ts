import { mulberry32 } from '@shared/rng';

/**
 * A falling-sand cellular automaton, now the physics for a color-sort
 * puzzle: a level starts full of mixed colored sand; the player opens one
 * "bucket" color at a time at the bottom, draining only that color while
 * everything else piles up — clear all the sand to win.
 *
 * Deliberately NOT built on SoloGameModule/useSoloGame: that abstraction
 * assumes discrete, replayable player moves, but this game is a
 * continuous physics simulation ticking on its own every 40ms independent
 * of player input — trying to log every tick as a "move" would bloat the
 * synced move_log for no real benefit (there's nothing here that needs
 * exact-replay, unlike e.g. Minesweeper's board-verification path). It
 * still gets the full pipeline (sign-in, sync, leaderboard, XP) — just
 * wired directly via recordResult()/flushOutbox() in the component,
 * the same lower-level primitives useSoloGame itself calls.
 */

export const SAND_COLS = 48;
export const SAND_ROWS = 72;

/** null = empty; otherwise a CSS color string for that grain. */
export type SandGrid = (string | null)[];

/** Widely-spaced hues (gold/red/blue/purple/green/pink — one green only,
 *  no teal) so neighboring grains never read as shades of each other. */
export const PALETTE = ['#f5c542', '#e8543f', '#3f8fe8', '#9b59f0', '#3ecf74', '#ee5fb0'];

/** How many rows (from the top) a fresh level starts packed with sand.
 *  Tuned so a level clears in roughly 30-45s of active play — draining
 *  only happens one bottom-row's worth of grains per tick, so total
 *  volume directly drives level length. */
const FILL_ROWS = 14;

export function emptyGrid(): SandGrid {
  return new Array(SAND_COLS * SAND_ROWS).fill(null);
}

function idx(col: number, row: number): number {
  return row * SAND_COLS + col;
}

/**
 * One physics tick: every grain falls straight down if it can, else to a
 * free diagonal (randomly chosen if both are free), else — if it's perched
 * on a ledge (side open with a drop under it) — rolls one cell sideways,
 * else rests. Rows are processed bottom-to-top so a grain that just moved
 * down isn't moved again in the same pass (it's only revisited on the
 * *next* call).
 *
 * The sideways roll caps the pile's angle of repose at ~27° instead of the
 * diagonal-only 45°. Without it the end of a level drags: draining from
 * the narrow center mouth digs a crater whose 45° walls are stable, so the
 * last grains sit high along the container edges creeping inward one
 * diagonal per tick. Rolling keeps the heap flowing toward the middle.
 */
export function simulateStep(grid: SandGrid, rand: () => number = Math.random): SandGrid {
  const next = grid.slice();
  // Grains that already moved sideways within the current row this tick —
  // without this, a right-roll during a left-to-right scan would be
  // re-processed at its landing column and skate across the whole shelf.
  const rolled = new Set<number>();
  for (let row = SAND_ROWS - 2; row >= 0; row--) {
    // Alternate the horizontal scan direction per row. With a fixed
    // left-to-right scan, a grain that slides diagonally right lands in the
    // cell under the NEXT column, blocking that grain's straight-down path
    // and pushing it right too — the bias compounds and shears the whole
    // heap sideways instead of letting it settle symmetrically into the
    // funnel. Flipping direction cancels the bias out.
    const leftToRight = rand() < 0.5;
    for (let n = 0; n < SAND_COLS; n++) {
      const col = leftToRight ? n : SAND_COLS - 1 - n;
      const i = idx(col, row);
      const color = next[i];
      if (!color || rolled.has(i)) continue;
      if (isOpen(next, col, row + 1)) {
        next[idx(col, row + 1)] = color;
        next[i] = null;
        continue;
      }
      // Diagonals let the heap slump inward along the funnel's slope.
      const leftOpen = isOpen(next, col - 1, row + 1);
      const rightOpen = isOpen(next, col + 1, row + 1);
      if (leftOpen && rightOpen) {
        const target = rand() < 0.5 ? idx(col - 1, row + 1) : idx(col + 1, row + 1);
        next[target] = color;
        next[i] = null;
        continue;
      } else if (leftOpen) {
        next[idx(col - 1, row + 1)] = color;
        next[i] = null;
        continue;
      } else if (rightOpen) {
        next[idx(col + 1, row + 1)] = color;
        next[i] = null;
        continue;
      }
      // Perched on a 45° shoulder: the side cell is open and there's a
      // drop one column further out (the near diagonal is blocked, else
      // we'd have taken it). Rolling there un-blocks a diagonal descent
      // on the next tick; on slopes of 1/2 or shallower neither side
      // qualifies, so flat layers and gentle heaps still come to rest.
      const leftRoll = isOpen(next, col - 1, row) && isOpen(next, col - 2, row + 1);
      const rightRoll = isOpen(next, col + 1, row) && isOpen(next, col + 2, row + 1);
      if (leftRoll || rightRoll) {
        const goLeft = leftRoll && (!rightRoll || rand() < 0.5);
        const target = idx(goLeft ? col - 1 : col + 1, row);
        next[target] = color;
        next[i] = null;
        rolled.add(target);
      }
      // else: boxed in, stays put this tick
    }
  }
  return next;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export interface Level {
  grid: SandGrid;
  /** This level's color set, in a fixed order — also the bucket order. */
  colors: string[];
}

/**
 * A fresh, deterministic level: 3–5 colors (picked via the seed), the top
 * FILL_ROWS rows packed with a random per-cell mix of them. Same seed
 * always yields the same level — daily mode shares one seed across every
 * player that day; endless mode draws a fresh random seed per round, same
 * "click play again for a new round" pattern as the other Brain Arcade
 * games (not a single auto-chaining session — keeps this consistent with
 * how Word Guess/Minesweeper/2048 already do "endless").
 */
export function generateLevel(seed: number): Level {
  const rand = mulberry32(seed);
  const colorCount = 3 + Math.floor(rand() * 3); // 3, 4, or 5
  const colors = shuffle(PALETTE, rand).slice(0, colorCount);
  const grid = emptyGrid();
  for (let row = 0; row < FILL_ROWS; row++) {
    for (let col = 0; col < SAND_COLS; col++) {
      grid[idx(col, row)] = colors[Math.floor(rand() * colors.length)]!;
    }
  }
  return { grid, colors };
}

/** Width of the drain mouth at the bottom centre, in columns. Narrow on
 *  purpose: sand has to funnel down to a point to leave, so the pile forms
 *  the classic hourglass slope instead of a whole layer vanishing at once. */
export const FUNNEL_WIDTH = 6;

/** Row where the container stops being a straight-sided box and starts
 *  tapering inward. Everything above this is full width. Placed so the
 *  taper spans exactly maxInset rows — a clean 45°, one column per row. */
export const FUNNEL_TOP_ROW = 50;

/**
 * How many columns are solid wall on EACH side at `row` — 0 above the
 * taper, growing linearly to (SAND_COLS - FUNNEL_WIDTH)/2 at the floor, so
 * the container is a hopper: straight sides down to FUNNEL_TOP_ROW, then a
 * V narrowing to exactly the drain mouth.
 */
export function funnelInset(row: number): number {
  if (row < FUNNEL_TOP_ROW) return 0;
  const span = SAND_ROWS - 1 - FUNNEL_TOP_ROW;
  const maxInset = (SAND_COLS - FUNNEL_WIDTH) / 2;
  if (span <= 0) return Math.floor(maxInset);
  return Math.round(((row - FUNNEL_TOP_ROW) / span) * maxInset);
}

/** Solid funnel wall — sand can never occupy or pass through these. */
export function isWall(col: number, row: number): boolean {
  const inset = funnelInset(row);
  return col < inset || col >= SAND_COLS - inset;
}

/** The half-open [start, end) open column range at the very bottom — i.e.
 *  the drain mouth, derived from the wall geometry so the two can't drift. */
export function funnelMouth(): { start: number; end: number } {
  const inset = funnelInset(SAND_ROWS - 1);
  return { start: inset, end: SAND_COLS - inset };
}

export function isFunnelCol(col: number): boolean {
  const { start, end } = funnelMouth();
  return col >= start && col < end;
}

/** A cell a grain may move into: inside the grid and not wall. */
function isOpen(grid: SandGrid, col: number, row: number): boolean {
  if (col < 0 || col >= SAND_COLS || row < 0 || row >= SAND_ROWS) return false;
  if (isWall(col, row)) return false;
  return grid[row * SAND_COLS + col] === null;
}

/** How many rows deep the neck sifts. Draining ONLY the single bottom row
 *  deadlocks: a settled heap can leave all ~6 mouth cells holding inactive
 *  colors, and since nothing can dislodge a settled grain the level becomes
 *  unwinnable. Sifting the neck means the open color always has a way out,
 *  while inactive colors still accumulate there and choke throughput —
 *  which is the intended tension, without the dead end. */
export const NECK_DEPTH = 4;

/**
 * Drains grains of `activeColor` sitting in the funnel neck — the narrow
 * column range at the bottom centre, over the last NECK_DEPTH rows. Sand
 * elsewhere has to slide down the funnel into the neck before it can
 * leave, which is what makes the heap taper to a point rather than
 * disappearing a layer at a time. Inactive colors settling in the neck
 * crowd out the space the open color needs, so neglecting a color still
 * costs you throughput.
 */
export function drainBottomRow(grid: SandGrid, activeColor: string | null): { grid: SandGrid; drained: number } {
  if (!activeColor) return { grid, drained: 0 };
  const next = grid.slice();
  let drained = 0;
  const { start, end } = funnelMouth();
  for (let row = SAND_ROWS - 1; row > SAND_ROWS - 1 - NECK_DEPTH; row--) {
    for (let col = start; col < end; col++) {
      const i = idx(col, row);
      if (next[i] === activeColor) {
        next[i] = null;
        drained++;
      }
    }
  }
  return { grid: next, drained };
}

/**
 * True once every grain has come to rest — i.e. no grain has anywhere to
 * fall. Checked directly rather than by diffing a simulated step, so it's
 * cheap and doesn't depend on simulateStep's random diagonal tie-break.
 * Used to gate input at level start so play can't begin mid-avalanche.
 */
export function isSettled(grid: SandGrid): boolean {
  for (let row = SAND_ROWS - 2; row >= 0; row--) {
    for (let col = 0; col < SAND_COLS; col++) {
      if (!grid[idx(col, row)]) continue;
      // Mirrors simulateStep's move test exactly — a wall is not somewhere
      // a grain can fall, so a heap resting against the funnel counts as
      // settled rather than looping forever.
      if (isOpen(grid, col, row + 1)) return false;
      if (isOpen(grid, col - 1, row + 1)) return false;
      if (isOpen(grid, col + 1, row + 1)) return false;
      // ...including the sideways roll off a 45° shoulder.
      if (isOpen(grid, col - 1, row) && isOpen(grid, col - 2, row + 1)) return false;
      if (isOpen(grid, col + 1, row) && isOpen(grid, col + 2, row + 1)) return false;
    }
  }
  return true;
}

export function isCleared(grid: SandGrid): boolean {
  return grid.every((c) => c === null);
}

export function countByColor(grid: SandGrid, colors: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const c of colors) counts[c] = 0;
  for (const cell of grid) if (cell && cell in counts) counts[cell] = (counts[cell] ?? 0) + 1;
  return counts;
}

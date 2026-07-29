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

export const SAND_COLS = 64;
export const SAND_ROWS = 96;

/** null = empty; otherwise a CSS color string for that grain. */
export type SandGrid = (string | null)[];

export const PALETTE = ['#e8c15a', '#e08a8a', '#7fb8e8', '#6bd68a', '#b389e0', '#4fd0d0'];

/** How many rows (from the top) a fresh level starts packed with sand.
 *  Tuned so a level clears in roughly 30-45s of active play — draining
 *  only happens one bottom-row's worth of grains per tick, so total
 *  volume directly drives level length. */
const FILL_ROWS = 11;

export function emptyGrid(): SandGrid {
  return new Array(SAND_COLS * SAND_ROWS).fill(null);
}

function idx(col: number, row: number): number {
  return row * SAND_COLS + col;
}

/**
 * One physics tick: every grain falls straight down if it can, else to a
 * free diagonal (randomly chosen if both are free), else rests. Rows are
 * processed bottom-to-top so a grain that just moved down isn't moved
 * again in the same pass (it's only revisited on the *next* call).
 */
export function simulateStep(grid: SandGrid, rand: () => number = Math.random): SandGrid {
  const next = grid.slice();
  for (let row = SAND_ROWS - 2; row >= 0; row--) {
    for (let col = 0; col < SAND_COLS; col++) {
      const i = idx(col, row);
      const color = next[i];
      if (!color) continue;
      const below = idx(col, row + 1);
      if (next[below] === null) {
        next[below] = color;
        next[i] = null;
        continue;
      }
      const leftOpen = col > 0 && next[idx(col - 1, row + 1)] === null;
      const rightOpen = col < SAND_COLS - 1 && next[idx(col + 1, row + 1)] === null;
      if (leftOpen && rightOpen) {
        const target = rand() < 0.5 ? idx(col - 1, row + 1) : idx(col + 1, row + 1);
        next[target] = color;
        next[i] = null;
      } else if (leftOpen) {
        next[idx(col - 1, row + 1)] = color;
        next[i] = null;
      } else if (rightOpen) {
        next[idx(col + 1, row + 1)] = color;
        next[i] = null;
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

/**
 * Drains any grain of `activeColor` sitting in the bottom row — the one
 * open bucket. Everything else resting there blocks that column instead
 * of exiting, which is the whole strategic tension: neglect a color too
 * long and it (and whatever piles on top of it) just sits there.
 */
export function drainBottomRow(grid: SandGrid, activeColor: string | null): { grid: SandGrid; drained: number } {
  if (!activeColor) return { grid, drained: 0 };
  const next = grid.slice();
  let drained = 0;
  const row = SAND_ROWS - 1;
  for (let col = 0; col < SAND_COLS; col++) {
    const i = idx(col, row);
    if (next[i] === activeColor) {
      next[i] = null;
      drained++;
    }
  }
  return { grid: next, drained };
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

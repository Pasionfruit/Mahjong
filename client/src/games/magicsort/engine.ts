import { mulberry32 } from '@shared/rng';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

/** Units per tube — and per color, since a solved tube is one full color. */
export const CAPACITY = 4;
/** Spare tubes the player maneuvers through. */
export const EMPTY_TUBES = 2;

/** Segment colors, index-aligned with the color ids stored in tubes.
 *  Borrowed from sandplay's palette so the flasks sit comfortably on the
 *  dark-jade felt. */
export const PALETTE = ['#e8c15a', '#e08a8a', '#7fb8e8', '#6bd68a', '#b389e0', '#4fd0d0'];

export interface MagicSortState {
  /** tubes[i] = color ids bottom-to-top; length ≤ CAPACITY. */
  tubes: number[][];
  /** How many distinct colors this puzzle uses (4–6, seed-derived). */
  colors: number;
  /** Accepted pours so far — the (ascending) score. */
  moves: number;
}

export interface MagicSortMove {
  from: number;
  to: number;
}

/** Length of the same-color run at the top of a tube (0 for empty). */
export function topRun(tube: number[]): number {
  const top = tube[tube.length - 1];
  if (top === undefined) return 0;
  let n = 1;
  for (let i = tube.length - 2; i >= 0 && tube[i] === top; i--) n++;
  return n;
}

/** A tube is "done" when it is empty or uniform-full. */
export function isTubeDone(tube: number[]): boolean {
  return tube.length === 0 || (tube.length === CAPACITY && topRun(tube) === CAPACITY);
}

export function isSolved(tubes: number[][]): boolean {
  return tubes.every(isTubeDone);
}

/**
 * Scramble-from-solved. Every scramble step lifts `count` top units of one
 * color off a source tube and drops them on a destination whose top is a
 * DIFFERENT color (or an empty tube), and always either leaves the same
 * color exposed on the source or empties the source entirely. Each such
 * step's exact inverse is a legal forward pour (target top matches — or is
 * empty — and the poured run is exactly `count`), so replaying the steps
 * backwards is a valid solution: the generated puzzle is solvable by
 * construction. Two extra guards from the spec: never re-form a uniform-full
 * tube mid-scramble, and never immediately undo the previous transfer.
 */
function generate(seed: number, _settings: void): MagicSortState {
  const rand = mulberry32(seed);
  const colors = 4 + Math.floor(rand() * 3); // 4..6 by seed
  const tubes: number[][] = [];
  for (let c = 0; c < colors; c++) tubes.push(new Array<number>(CAPACITY).fill(c));
  for (let e = 0; e < EMPTY_TUBES; e++) tubes.push([]);

  const target = 60 + Math.floor(rand() * 61); // ~60..120 reverse pours
  const maxSteps = target + 60; // budget to scramble onward if we land solved
  let prev: { from: number; to: number } | null = null;

  for (let step = 0; step < maxSteps; step++) {
    if (step >= target && !isSolved(tubes)) break;

    const candidates: { from: number; to: number; count: number }[] = [];
    for (let from = 0; from < tubes.length; from++) {
      const src = tubes[from]!;
      if (src.length === 0) continue;
      const run = topRun(src);
      const color = src[src.length - 1]!;
      for (let to = 0; to < tubes.length; to++) {
        if (to === from) continue;
        if (prev && prev.from === to && prev.to === from) continue; // no immediate undo
        const dst = tubes[to]!;
        const space = CAPACITY - dst.length;
        if (space === 0) continue;
        if (dst.length > 0 && dst[dst.length - 1] === color) continue; // keep inverse pour exact
        const maxCount = Math.min(space, run);
        for (let count = 1; count <= maxCount; count++) {
          const leavesTopColor = count < run;
          const emptiesSource = count === src.length;
          if (!leavesTopColor && !emptiesSource) continue; // inverse target must match or be empty
          if (dst.length + count === CAPACITY && dst.every((u) => u === color)) continue; // no uniform-full
          candidates.push({ from, to, count });
        }
      }
    }
    if (candidates.length === 0) break; // practically unreachable; state stays solvable

    const pick = candidates[Math.floor(rand() * candidates.length)]!;
    const src = tubes[pick.from]!;
    const dst = tubes[pick.to]!;
    for (let i = 0; i < pick.count; i++) dst.push(src.pop()!);
    prev = { from: pick.from, to: pick.to };
  }

  return { tubes, colors, moves: 0 };
}

/**
 * A pour moves the maximal contiguous run of the source's top color onto
 * `to`, capped by the destination's free space — legal only when `to` is
 * empty or its top color matches. Illegal (or post-win) pours return null.
 */
function applyMove(state: MagicSortState, move: MagicSortMove): MagicSortState | null {
  const { from, to } = move;
  if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return null;
  const src = state.tubes[from];
  const dst = state.tubes[to];
  if (!src || !dst) return null;
  if (src.length === 0 || dst.length >= CAPACITY) return null;
  if (isSolved(state.tubes)) return null;
  const color = src[src.length - 1]!;
  if (dst.length > 0 && dst[dst.length - 1] !== color) return null;

  const count = Math.min(topRun(src), CAPACITY - dst.length);
  const tubes = state.tubes.map((t) => t.slice());
  const s = tubes[from]!;
  const d = tubes[to]!;
  for (let i = 0; i < count; i++) d.push(s.pop()!);
  return { tubes, colors: state.colors, moves: state.moves + 1 };
}

function status(state: MagicSortState): SoloStatus {
  return isSolved(state.tubes) ? 'won' : 'playing';
}

function result(state: MagicSortState): SoloResult | null {
  if (status(state) === 'playing') return null;
  return { status: 'won', score: state.moves, stats: { colors: state.colors, moves: state.moves } };
}

function replay(seed: number, settings: void, moveLog: MagicSortMove[]): MagicSortState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: MagicSortState): string {
  if (status(state) === 'playing') return '';
  return `🧪 Magic Sort — ${state.colors} colors sorted in ${state.moves} moves`;
}

export const magicSortModule: SoloGameModule<MagicSortState, MagicSortMove, void> = {
  id: 'magicsort',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

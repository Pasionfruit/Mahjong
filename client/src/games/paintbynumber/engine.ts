import { mulberry32 } from '@shared/rng';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

/**
 * Paint by Number — a 16×16 pixel-art coloring page. The picture is a
 * procedurally-grown, vertically-mirrored creature ("invader" style): a
 * seeded random blob on the left half is smoothed by a few cellular steps,
 * mirrored to the right, partitioned into horizontal color bands with
 * seeded dithering at the borders, and rimmed with a darker outline color.
 * Background cells are not paintable. Deterministic per seed.
 *
 * Scoring mirrors Minesweeper's: timestamps ride on the moves themselves
 * (never read from the wall clock inside the engine), so the elapsed-time
 * score falls out of a pure replay of the move log.
 */

export const SIZE = 16;
const HALF = SIZE / 2;
const CELLS = SIZE * SIZE;

/** Figure-size window that reads as a deliberate picture, not a speck or a
 *  full-bleed blob. Attempts outside it re-roll with the next sub-seed. */
const MIN_FIGURE_CELLS = 48;
const MAX_FIGURE_CELLS = 190;
const MAX_ATTEMPTS = 40;

/** Pleasant hues that read well on the dark-jade app background. */
const HUES = [350, 25, 45, 90, 150, 185, 210, 260, 315];

export interface PaintByNumberState {
  seed: number;
  /** Palette index per cell (row-major), or null for background (unpaintable). */
  target: (number | null)[];
  /** Correct fills only — a wrong color never lands, it just counts a mistake. */
  painted: (number | null)[];
  /** CSS color per palette index; the last index is the darker outline ink. */
  palette: string[];
  mistakes: number;
  firstMoveAt: number | null;
  lastMoveAt: number | null;
}

export interface PaintByNumberMove {
  cell: number;
  /** Palette index the player tried to paint with. */
  color: number;
  /** Client timestamp (Date.now()) — timing is move-log data so replay stays pure. */
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

/** Left-half lookup that mirrors reads past the seam, so the smoothing
 *  step "sees" the mirrored right half without materializing it. */
function halfAt(half: number[], r: number, c: number): number {
  if (r < 0 || r >= SIZE) return 0;
  if (c >= HALF) c = SIZE - 1 - c;
  if (c < 0 || c >= HALF) return 0;
  return half[r * HALF + c]!;
}

/** Grow a symmetric figure; null if this attempt's blob is a bad size. */
function growFigure(rand: () => number): boolean[] | null {
  // Random left half, biased toward the vertical middle and the mirror seam
  // so the blob tends to sit centered and connect across the seam.
  let half: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < HALF; c++) {
      const rowBias = 1 - Math.abs(r - (SIZE - 1) / 2) / ((SIZE - 1) / 2);
      const colBias = (c + 1) / HALF;
      const p = 0.16 + 0.5 * (0.55 * rowBias + 0.45 * colBias);
      half.push(rand() < p ? 1 : 0);
    }
  }

  // Cellular smoothing: survive with ≥3 of 8 neighbors, be born with ≥5.
  for (let step = 0; step < 3; step++) {
    const next: number[] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < HALF; c++) {
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr !== 0 || dc !== 0) n += halfAt(half, r + dr, c + dc);
          }
        }
        const alive = half[r * HALF + c]! === 1 ? n >= 3 : n >= 5;
        next.push(alive ? 1 : 0);
      }
    }
    half = next;
  }

  // Mirror to the full grid.
  const fig: boolean[] = new Array(CELLS).fill(false);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < HALF; c++) {
      const v = half[r * HALF + c]! === 1;
      fig[r * SIZE + c] = v;
      fig[r * SIZE + (SIZE - 1 - c)] = v;
    }
  }

  // Keep the largest 4-connected component — unioned with its own mirror
  // image, so the kept figure stays symmetric even when the largest
  // component is one of an off-seam mirror pair.
  const comp: number[] = new Array(CELLS).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < CELLS; i++) {
    if (!fig[i] || comp[i] !== -1) continue;
    const id = sizes.length;
    let size = 0;
    const stack = [i];
    comp[i] = id;
    while (stack.length > 0) {
      const j = stack.pop()!;
      size++;
      const r = Math.floor(j / SIZE);
      const c = j % SIZE;
      const around = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ] as const;
      for (const [nr, nc] of around) {
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const k = nr * SIZE + nc;
        if (fig[k] && comp[k] === -1) {
          comp[k] = id;
          stack.push(k);
        }
      }
    }
    sizes.push(size);
  }
  if (sizes.length === 0) return null;
  let best = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i]! > sizes[best]!) best = i;

  const kept: boolean[] = new Array(CELLS).fill(false);
  let count = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      const m = r * SIZE + (SIZE - 1 - c);
      if (fig[i] && (comp[i] === best || comp[m] === best)) {
        kept[i] = true;
        count++;
      }
    }
  }
  if (count < MIN_FIGURE_CELLS || count > MAX_FIGURE_CELLS) return null;
  return kept;
}

/** Deterministic last-resort figure (a diamond) — only reachable if every
 *  seeded attempt lands outside the size window, which is astronomically
 *  unlikely; it guarantees generate() always yields a playable page. */
function fallbackFigure(): boolean[] {
  const kept: boolean[] = new Array(CELLS).fill(false);
  const mid = (SIZE - 1) / 2;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (Math.abs(r - mid) + Math.abs(c - mid) <= 6.5) kept[r * SIZE + c] = true;
    }
  }
  return kept;
}

function isEdgeCell(kept: boolean[], r: number, c: number): boolean {
  const around = [
    [r - 1, c],
    [r + 1, c],
    [r, c - 1],
    [r, c + 1],
  ] as const;
  return around.some(
    ([nr, nc]) => nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE || !kept[nr * SIZE + nc],
  );
}

/** Assign band colors (left half then mirrored) + the outline rim. */
function colorize(
  kept: boolean[],
  colorCount: number,
  rand: () => number,
): { target: (number | null)[]; palette: string[] } {
  let minRow = SIZE;
  let maxRow = -1;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!kept[r * SIZE + c]) continue;
      if (r < minRow) minRow = r;
      if (r > maxRow) maxRow = r;
    }
  }
  const bandCount = colorCount - 1;
  const rows = Math.max(1, maxRow - minRow + 1);

  const target: (number | null)[] = new Array(CELLS).fill(null);
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < HALF; c++) {
      const i = r * SIZE + c;
      if (!kept[i]) continue;
      const pos = ((r - minRow + 0.5) / rows) * bandCount;
      let band = Math.min(bandCount - 1, Math.floor(pos));
      const frac = pos - band;
      // Seeded dithering at band borders — soft, hand-shaded transitions.
      if (frac < 0.3 && band > 0) {
        if (rand() < 0.45) band -= 1;
      } else if (frac > 0.7 && band < bandCount - 1) {
        if (rand() < 0.45) band += 1;
      }
      target[i] = band;
      target[r * SIZE + (SIZE - 1 - c)] = band;
    }
  }

  // Darker outline ink on the figure's rim (symmetric because kept is).
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = r * SIZE + c;
      if (kept[i] && isEdgeCell(kept, r, c)) target[i] = colorCount - 1;
    }
  }

  const hues = shuffle(HUES, rand).slice(0, bandCount);
  const palette = hues.map((h, k) => `hsl(${h} ${58 + (k % 2) * 8}% ${58 + (k % 3) * 5}%)`);
  palette.push(`hsl(${hues[0] ?? 150} 42% 27%)`); // outline ink

  return { target, palette };
}

function generate(seed: number, _settings: void): PaintByNumberState {
  for (let attempt = 0; attempt <= MAX_ATTEMPTS; attempt++) {
    const attemptSeed = (seed + attempt * 0x9e3779b9) >>> 0;
    const rand = mulberry32(attemptSeed);
    const colorCount = 4 + Math.floor(rand() * 3); // 4–6, seeded
    const kept = attempt < MAX_ATTEMPTS ? growFigure(rand) : fallbackFigure();
    if (!kept) continue;
    const { target, palette } = colorize(kept, colorCount, rand);
    return {
      seed,
      target,
      painted: new Array(CELLS).fill(null),
      palette,
      mistakes: 0,
      firstMoveAt: null,
      lastMoveAt: null,
    };
  }
  // Unreachable: the final attempt uses the fallback figure.
  throw new Error('paintbynumber: generation failed');
}

function isWon(state: PaintByNumberState): boolean {
  for (let i = 0; i < state.target.length; i++) {
    if (state.target[i] !== null && state.painted[i] === null) return false;
  }
  return true;
}

function applyMove(state: PaintByNumberState, move: PaintByNumberMove): PaintByNumberState | null {
  if (move.cell < 0 || move.cell >= state.target.length) return null;
  const want = state.target[move.cell];
  if (want === null || want === undefined) return null; // background — not paintable
  if (state.painted[move.cell] !== null) return null; // already correctly painted

  const firstMoveAt = state.firstMoveAt ?? move.at;
  if (move.color !== want) {
    // Wrong color: nothing fills, but the slip is real state (and real
    // move-log data — replay must reproduce the mistake count).
    return { ...state, mistakes: state.mistakes + 1, firstMoveAt, lastMoveAt: move.at };
  }
  const painted = state.painted.slice();
  painted[move.cell] = move.color;
  return { ...state, painted, firstMoveAt, lastMoveAt: move.at };
}

function status(state: PaintByNumberState): SoloStatus {
  return isWon(state) ? 'won' : 'playing';
}

function result(state: PaintByNumberState): SoloResult | null {
  if (!isWon(state)) return null;
  const elapsedMs =
    state.firstMoveAt !== null && state.lastMoveAt !== null ? state.lastMoveAt - state.firstMoveAt : 0;
  return {
    status: 'won',
    score: elapsedMs,
    stats: { mistakes: state.mistakes, colors: state.palette.length },
  };
}

function replay(seed: number, settings: void, moveLog: PaintByNumberMove[]): PaintByNumberState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: PaintByNumberState): string {
  if (!isWon(state)) return '';
  const r = result(state);
  const secs = r ? Math.round((r.score / 1000) * 10) / 10 : 0;
  return `Paint by Number 🎨 — finished in ${secs}s with ${state.mistakes} mistake${state.mistakes === 1 ? '' : 's'}`;
}

export const paintByNumberModule: SoloGameModule<PaintByNumberState, PaintByNumberMove, void> = {
  id: 'paintbynumber',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

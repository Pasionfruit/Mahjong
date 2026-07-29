import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

export const SIZE = 4;

export type Direction = 'up' | 'down' | 'left' | 'right';

export interface TwentyFortyEightState {
  /** 16 cells, row-major (index = row * SIZE + col). null = empty. */
  grid: (number | null)[];
  score: number;
  /** The mulberry32 internal "a" value — plain-data RNG cursor so state
   *  stays JSON-serializable (no closures) and replay() is a pure fold.
   *  See stepRng below: same formula as shared/src/rng.ts's mulberry32,
   *  factored to take/return state instead of closing over it. */
  rngState: number;
}

export interface TwentyFortyEightMove {
  dir: Direction;
}

function stepRng(a: number): [number, number] {
  const nextA = (a + 0x6d2b79f5) >>> 0;
  let t = nextA;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return [value, nextA];
}

function spawnTile(grid: (number | null)[], rngState: number): [(number | null)[], number] {
  const empties = grid.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  if (empties.length === 0) return [grid, rngState];
  const [r1, a1] = stepRng(rngState);
  const index = empties[Math.floor(r1 * empties.length)]!;
  const [r2, a2] = stepRng(a1);
  const next = grid.slice();
  next[index] = r2 < 0.9 ? 2 : 4;
  return [next, a2];
}

export function slideLine(line: (number | null)[]): { line: (number | null)[]; gained: number } {
  const nums = line.filter((v): v is number => v !== null);
  const result: (number | null)[] = [];
  let gained = 0;
  let i = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i + 1]) {
      const merged = nums[i]! * 2;
      result.push(merged);
      gained += merged;
      i += 2;
    } else {
      result.push(nums[i]!);
      i += 1;
    }
  }
  while (result.length < line.length) result.push(null);
  return { line: result, gained };
}

function lineIndices(dir: Direction, i: number): number[] {
  return dir === 'left' || dir === 'right'
    ? [0, 1, 2, 3].map((c) => i * SIZE + c)
    : [0, 1, 2, 3].map((r) => r * SIZE + i);
}

export function applyDirection(
  grid: (number | null)[],
  dir: Direction,
): { grid: (number | null)[]; gained: number; changed: boolean } {
  const next = grid.slice();
  let gained = 0;
  let changed = false;
  const reversed = dir === 'right' || dir === 'down';

  for (let i = 0; i < SIZE; i++) {
    const indices = lineIndices(dir, i);
    let line = indices.map((idx) => grid[idx] ?? null);
    if (reversed) line = line.slice().reverse();
    const slid = slideLine(line);
    gained += slid.gained;
    const finalLine = reversed ? slid.line.slice().reverse() : slid.line;
    indices.forEach((idx, j) => {
      const value = finalLine[j] ?? null;
      if (next[idx] !== value) changed = true;
      next[idx] = value;
    });
  }
  return { grid: next, gained, changed };
}

function hasMovesLeft(grid: (number | null)[]): boolean {
  if (grid.some((v) => v === null)) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const idx = r * SIZE + c;
      const val = grid[idx];
      if (c < SIZE - 1 && grid[idx + 1] === val) return true;
      if (r < SIZE - 1 && grid[idx + SIZE] === val) return true;
    }
  }
  return false;
}

function generate(seed: number, _settings: void): TwentyFortyEightState {
  let grid: (number | null)[] = new Array(SIZE * SIZE).fill(null);
  let rngState = seed;
  [grid, rngState] = spawnTile(grid, rngState);
  [grid, rngState] = spawnTile(grid, rngState);
  return { grid, score: 0, rngState };
}

function applyMove(state: TwentyFortyEightState, move: TwentyFortyEightMove): TwentyFortyEightState | null {
  if (!hasMovesLeft(state.grid)) return null;
  const { grid, gained, changed } = applyDirection(state.grid, move.dir);
  if (!changed) return null;
  const [spawned, rngState] = spawnTile(grid, state.rngState);
  return { grid: spawned, score: state.score + gained, rngState };
}

function status(state: TwentyFortyEightState): SoloStatus {
  return hasMovesLeft(state.grid) ? 'playing' : 'lost';
}

/**
 * Always resolves to 'lost' on completion — 2048 has no schema-level "won"
 * state here by design: like real 2048 clones, play continues past the
 * 2048 tile for a higher score (see the design doc's arcade/high-score-
 * chase framing). The round only ends when no legal move remains.
 */
function result(state: TwentyFortyEightState): SoloResult | null {
  if (status(state) === 'playing') return null;
  const highestTile = state.grid.reduce((max: number, v) => (v !== null && v > max ? v : max), 0);
  return { status: 'lost', score: state.score, stats: { highestTile } };
}

function replay(seed: number, settings: void, moveLog: TwentyFortyEightMove[]): TwentyFortyEightState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: TwentyFortyEightState): string {
  if (status(state) === 'playing') return '';
  const highest = state.grid.reduce((max: number, v) => (v !== null && v > max ? v : max), 0);
  return `2048 — Score: ${state.score}, Highest tile: ${highest}`;
}

export const twenty48Module: SoloGameModule<TwentyFortyEightState, TwentyFortyEightMove, void> = {
  id: 'twenty48',
  scoreDirection: 'desc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

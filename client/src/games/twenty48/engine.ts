import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

export const SIZE = 4;

export type Direction = 'up' | 'down' | 'left' | 'right';

/** A tile carries a stable id across slides so the UI can key elements by
 *  id and let CSS transitions animate position changes — see engine.ts's
 *  header comment in MinesweeperGame for the same "timestamps as move
 *  data" philosophy: identity here is plain data too, not a rendering
 *  side-channel, so replay() stays a pure fold with zero special-casing. */
export interface Tile {
  id: number;
  value: number;
}

export interface TwentyFortyEightState {
  /** 16 cells, row-major (index = row * SIZE + col). null = empty. */
  grid: (Tile | null)[];
  score: number;
  /** The mulberry32 internal "a" value — plain-data RNG cursor so state
   *  stays JSON-serializable (no closures) and replay() is a pure fold.
   *  See stepRng below: same formula as shared/src/rng.ts's mulberry32,
   *  factored to take/return state instead of closing over it. */
  rngState: number;
  /** Next tile id to assign on spawn — plain-data counter, same reasoning
   *  as rngState. */
  nextId: number;
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

function spawnTile(
  grid: (Tile | null)[],
  rngState: number,
  nextId: number,
): [(Tile | null)[], number, number] {
  const empties = grid.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0);
  if (empties.length === 0) return [grid, rngState, nextId];
  const [r1, a1] = stepRng(rngState);
  const index = empties[Math.floor(r1 * empties.length)]!;
  const [r2, a2] = stepRng(a1);
  const next = grid.slice();
  next[index] = { id: nextId, value: r2 < 0.9 ? 2 : 4 };
  return [next, a2, nextId + 1];
}

/**
 * Slides tiles together and merges adjacent equal pairs, exactly once per
 * tile per move (classic 2048 rule — a freshly-merged tile never merges
 * again in the same slide). The surviving tile of a merge keeps the
 * leading (in slide-direction) tile's id; the trailing one simply drops
 * out of the line — the UI reads that disappearance as "this tile got
 * absorbed" when diffing consecutive states by id.
 */
export function slideLine(line: (Tile | null)[]): { line: (Tile | null)[]; gained: number } {
  const tiles = line.filter((v): v is Tile => v !== null);
  const result: (Tile | null)[] = [];
  let gained = 0;
  let i = 0;
  while (i < tiles.length) {
    if (i + 1 < tiles.length && tiles[i]!.value === tiles[i + 1]!.value) {
      const value = tiles[i]!.value * 2;
      result.push({ id: tiles[i]!.id, value });
      gained += value;
      i += 2;
    } else {
      result.push(tiles[i]!);
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
  grid: (Tile | null)[],
  dir: Direction,
): { grid: (Tile | null)[]; gained: number; changed: boolean } {
  const next = grid.slice();
  let gained = 0;
  const reversed = dir === 'right' || dir === 'down';

  for (let i = 0; i < SIZE; i++) {
    const indices = lineIndices(dir, i);
    let line = indices.map((idx) => grid[idx] ?? null);
    if (reversed) line = line.slice().reverse();
    const slid = slideLine(line);
    gained += slid.gained;
    const finalLine = reversed ? slid.line.slice().reverse() : slid.line;
    indices.forEach((idx, j) => {
      next[idx] = finalLine[j] ?? null;
    });
  }
  // Compare id arrangement, not values — a merge always changes which ids
  // occupy which slots (the absorbed id disappears), so this alone is
  // enough to detect any real change, slide or merge.
  const changed = grid.map((t) => t?.id ?? null).join(',') !== next.map((t) => t?.id ?? null).join(',');
  return { grid: next, gained, changed };
}

function hasMovesLeft(grid: (Tile | null)[]): boolean {
  if (grid.some((v) => v === null)) return true;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const idx = r * SIZE + c;
      const val = grid[idx]!.value; // grid is full here (checked above)
      if (c < SIZE - 1 && grid[idx + 1]!.value === val) return true;
      if (r < SIZE - 1 && grid[idx + SIZE]!.value === val) return true;
    }
  }
  return false;
}

function generate(seed: number, _settings: void): TwentyFortyEightState {
  let grid: (Tile | null)[] = new Array(SIZE * SIZE).fill(null);
  let rngState = seed;
  let nextId = 1;
  [grid, rngState, nextId] = spawnTile(grid, rngState, nextId);
  [grid, rngState, nextId] = spawnTile(grid, rngState, nextId);
  return { grid, score: 0, rngState, nextId };
}

function applyMove(state: TwentyFortyEightState, move: TwentyFortyEightMove): TwentyFortyEightState | null {
  if (!hasMovesLeft(state.grid)) return null;
  const { grid, gained, changed } = applyDirection(state.grid, move.dir);
  if (!changed) return null;
  const [spawned, rngState, nextId] = spawnTile(grid, state.rngState, state.nextId);
  return { grid: spawned, score: state.score + gained, rngState, nextId };
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
  const highestTile = state.grid.reduce((max: number, t) => (t !== null && t.value > max ? t.value : max), 0);
  return { status: 'lost', score: state.score, stats: { highestTile } };
}

function replay(seed: number, settings: void, moveLog: TwentyFortyEightMove[]): TwentyFortyEightState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: TwentyFortyEightState): string {
  if (status(state) === 'playing') return '';
  const highest = state.grid.reduce((max: number, t) => (t !== null && t.value > max ? t.value : max), 0);
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

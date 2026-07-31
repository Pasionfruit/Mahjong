import { mulberry32 } from '@shared/rng';
import type { SoloGameModule, SoloResult, SoloStatus } from '../../arcade/types';

export const GRID = 6;
/** The red car parks on this row; the exit notch sits on its right edge. */
export const EXIT_ROW = 2;
export const RED_ID = 0;

export interface Vehicle {
  id: number;
  /** Top-left cell of the vehicle. */
  row: number;
  col: number;
  len: number;
  horizontal: boolean;
}

export interface ParkingJamState {
  vehicles: Vehicle[];
  /** Accepted slides so far — the (ascending) score. */
  moves: number;
  /** BFS-optimal solution length for this board, shown as a hint/benchmark. */
  optimalMoves: number;
}

export interface ParkingJamMove {
  vehicleId: number;
  /** Signed cells along the vehicle's axis (right/down positive). */
  delta: number;
}

export function vehicleCells(v: Vehicle): [number, number][] {
  const cells: [number, number][] = [];
  for (let k = 0; k < v.len; k++) {
    cells.push(v.horizontal ? [v.row, v.col + k] : [v.row + k, v.col]);
  }
  return cells;
}

function isWonVehicles(vehicles: Vehicle[]): boolean {
  const red = vehicles.find((v) => v.id === RED_ID);
  return !!red && red.col + red.len - 1 >= GRID - 1;
}

/**
 * Breadth-first search over vehicle positions; one "move" is one slide of
 * any length, matching applyMove. Returns the optimal move count, or -1 if
 * the board is unsolvable (or the node cap is exceeded, which generation
 * treats the same way: reject the board).
 */
export function solveBoard(vehicles: Vehicle[], nodeCap = 120000): number {
  const n = vehicles.length;
  const redIdx = vehicles.findIndex((v) => v.id === RED_ID);
  if (redIdx < 0) return -1;
  const red = vehicles[redIdx]!;
  const startPos = vehicles.map((v) => (v.horizontal ? v.col : v.row));
  const key = (pos: number[]) => pos.join(',');
  const atGoal = (p: number) => p + red.len - 1 >= GRID - 1;

  if (atGoal(startPos[redIdx]!)) return 0;
  const visited = new Set<string>([key(startPos)]);
  let frontier: number[][] = [startPos];

  for (let depth = 1; frontier.length > 0; depth++) {
    const next: number[][] = [];
    for (const pos of frontier) {
      const occ = new Array<boolean>(GRID * GRID).fill(false);
      for (let i = 0; i < n; i++) {
        const v = vehicles[i]!;
        const p = pos[i]!;
        for (let k = 0; k < v.len; k++) {
          const r = v.horizontal ? v.row : p + k;
          const c = v.horizontal ? p + k : v.col;
          occ[r * GRID + c] = true;
        }
      }
      for (let i = 0; i < n; i++) {
        const v = vehicles[i]!;
        const p = pos[i]!;
        for (const dir of [-1, 1]) {
          for (let step = 1; ; step++) {
            const np = p + dir * step;
            const lead = dir > 0 ? np + v.len - 1 : np;
            if (np < 0 || lead >= GRID) break;
            const r = v.horizontal ? v.row : lead;
            const c = v.horizontal ? lead : v.col;
            if (occ[r * GRID + c]) break; // leading edge never overlaps the vehicle itself
            const npos = pos.slice();
            npos[i] = np;
            const k2 = key(npos);
            if (!visited.has(k2)) {
              visited.add(k2);
              if (visited.size > nodeCap) return -1;
              if (i === redIdx && atGoal(np)) return depth;
              next.push(npos);
            }
          }
        }
      }
    }
    frontier = next;
  }
  return -1;
}

function fits(v: Vehicle, occ: boolean[]): boolean {
  return vehicleCells(v).every(
    ([r, c]) => r >= 0 && r < GRID && c >= 0 && c < GRID && !occ[r * GRID + c],
  );
}

function mark(v: Vehicle, occ: boolean[]): void {
  for (const [r, c] of vehicleCells(v)) occ[r * GRID + c] = true;
}

/**
 * One seeded placement attempt: red car on the exit row, 1–2 vertical
 * blockers across the exit lane to its right (so trivially-open boards are
 * rare), then random fill up to 9–13 non-red vehicles. Horizontal vehicles
 * never spawn on the exit row — a horizontal car there could wall the exit
 * permanently. Returns null if the board came out too sparse.
 */
function tryBuildBoard(rand: () => number): Vehicle[] | null {
  const occ = new Array<boolean>(GRID * GRID).fill(false);
  const redCol = Math.floor(rand() * 3); // 0..2 — never spawns already at the exit
  const red: Vehicle = { id: RED_ID, row: EXIT_ROW, col: redCol, len: 2, horizontal: true };
  mark(red, occ);
  const vehicles: Vehicle[] = [red];
  let nextId = 1;

  const blockerCols: number[] = [];
  for (let c = redCol + 2; c < GRID; c++) blockerCols.push(c);
  const blockerCount = Math.min(blockerCols.length, 1 + Math.floor(rand() * 2));
  for (let b = 0; b < blockerCount; b++) {
    const ci = Math.floor(rand() * blockerCols.length);
    const col = blockerCols.splice(ci, 1)[0]!;
    const len = rand() < 0.5 ? 2 : 3;
    const minRow = Math.max(0, EXIT_ROW - len + 1);
    const row = minRow + Math.floor(rand() * (EXIT_ROW - minRow + 1));
    const v: Vehicle = { id: nextId, row, col, len, horizontal: false };
    if (!fits(v, occ)) continue;
    mark(v, occ);
    vehicles.push(v);
    nextId++;
  }

  const targetOthers = 9 + Math.floor(rand() * 5); // 9..13
  const HROWS = [0, 1, 3, 4, 5]; // never horizontal on the exit row
  for (let tries = 0; vehicles.length - 1 < targetOthers && tries < 250; tries++) {
    const horizontal = rand() < 0.5;
    const len = rand() < 0.62 ? 2 : 3;
    const v: Vehicle = horizontal
      ? {
          id: nextId,
          row: HROWS[Math.floor(rand() * HROWS.length)]!,
          col: Math.floor(rand() * (GRID - len + 1)),
          len,
          horizontal: true,
        }
      : {
          id: nextId,
          row: Math.floor(rand() * (GRID - len + 1)),
          col: Math.floor(rand() * GRID),
          len,
          horizontal: false,
        };
    if (!fits(v, occ)) continue;
    mark(v, occ);
    vehicles.push(v);
    nextId++;
  }
  return vehicles.length - 1 >= 9 ? vehicles : null;
}

/**
 * Hand-authored, verified-solvable boards so generate() can NEVER fail even
 * if every seeded attempt is rejected. Optimal counts are still computed by
 * the solver at pick time.
 */
const FALLBACK_BOARDS: Vehicle[][] = [
  [
    { id: 0, row: 2, col: 0, len: 2, horizontal: true },
    { id: 1, row: 0, col: 2, len: 3, horizontal: false },
    { id: 2, row: 0, col: 3, len: 2, horizontal: true },
    { id: 3, row: 0, col: 5, len: 2, horizontal: false },
    { id: 4, row: 3, col: 3, len: 2, horizontal: false },
    { id: 5, row: 5, col: 3, len: 2, horizontal: true },
    { id: 6, row: 3, col: 0, len: 3, horizontal: false },
    { id: 7, row: 1, col: 3, len: 2, horizontal: true },
  ],
  [
    { id: 0, row: 2, col: 1, len: 2, horizontal: true },
    { id: 1, row: 1, col: 3, len: 2, horizontal: false },
    { id: 2, row: 2, col: 4, len: 3, horizontal: false },
    { id: 3, row: 0, col: 2, len: 3, horizontal: true },
    { id: 4, row: 0, col: 0, len: 3, horizontal: false },
    { id: 5, row: 5, col: 1, len: 3, horizontal: true },
    { id: 6, row: 3, col: 5, len: 2, horizontal: false },
  ],
];

/**
 * Deterministic per seed: walk sub-seeds (seed + i) until a placement passes
 * the BFS filter (optimal in 6..24 moves). Falls back to the authored bank
 * after 200 attempts so this never throws and never returns an unsolvable
 * board.
 */
function generate(seed: number, _settings: void): ParkingJamState {
  for (let attempt = 0; attempt < 200; attempt++) {
    const rand = mulberry32((seed + attempt) >>> 0);
    const vehicles = tryBuildBoard(rand);
    if (!vehicles) continue;
    const optimal = solveBoard(vehicles);
    if (optimal >= 6 && optimal <= 24) {
      return { vehicles, moves: 0, optimalMoves: optimal };
    }
  }
  const bank = FALLBACK_BOARDS[(seed >>> 0) % FALLBACK_BOARDS.length]!;
  const vehicles = bank.map((v) => ({ ...v }));
  return { vehicles, moves: 0, optimalMoves: solveBoard(vehicles) };
}

/**
 * One move = one slide of |delta| ≥ 1 cells along the vehicle's axis; every
 * swept cell must be free and in bounds. Returns null once the red car has
 * already escaped.
 */
function applyMove(state: ParkingJamState, move: ParkingJamMove): ParkingJamState | null {
  if (isWonVehicles(state.vehicles)) return null;
  const { vehicleId, delta } = move;
  if (!Number.isInteger(delta) || delta === 0) return null;
  const idx = state.vehicles.findIndex((v) => v.id === vehicleId);
  if (idx < 0) return null;
  const v = state.vehicles[idx]!;

  const occ = new Array<boolean>(GRID * GRID).fill(false);
  for (let i = 0; i < state.vehicles.length; i++) {
    if (i !== idx) mark(state.vehicles[i]!, occ);
  }

  const dir = Math.sign(delta);
  let pos = v.horizontal ? v.col : v.row;
  for (let step = 0; step < Math.abs(delta); step++) {
    const np = pos + dir;
    const lead = dir > 0 ? np + v.len - 1 : np;
    if (np < 0 || lead >= GRID) return null;
    const r = v.horizontal ? v.row : lead;
    const c = v.horizontal ? lead : v.col;
    if (occ[r * GRID + c]) return null;
    pos = np;
  }

  const vehicles = state.vehicles.map((veh, i) =>
    i === idx ? { ...veh, row: v.horizontal ? veh.row : pos, col: v.horizontal ? pos : veh.col } : veh,
  );
  return { vehicles, moves: state.moves + 1, optimalMoves: state.optimalMoves };
}

function status(state: ParkingJamState): SoloStatus {
  return isWonVehicles(state.vehicles) ? 'won' : 'playing';
}

function result(state: ParkingJamState): SoloResult | null {
  if (status(state) === 'playing') return null;
  return {
    status: 'won',
    score: state.moves,
    stats: { optimal: state.optimalMoves, moves: state.moves },
  };
}

function replay(seed: number, settings: void, moveLog: ParkingJamMove[]): ParkingJamState {
  let state = generate(seed, settings);
  for (const move of moveLog) state = applyMove(state, move) ?? state;
  return state;
}

function shareText(state: ParkingJamState): string {
  if (status(state) === 'playing') return '';
  return `🚗 Parking Jam — escaped in ${state.moves} moves (optimal ${state.optimalMoves})`;
}

export const parkingJamModule: SoloGameModule<ParkingJamState, ParkingJamMove, void> = {
  id: 'parkingjam',
  scoreDirection: 'asc',
  generate,
  applyMove,
  status,
  result,
  replay,
  shareText,
};

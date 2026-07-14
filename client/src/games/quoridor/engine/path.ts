import { DIRS, SIZE, canStep, cellIndex, goalRow } from './board';
import type { PlayerIndex, Pos, QuoridorState } from './types';

/**
 * BFS over cells. Pawns do not block paths — official Quoridor's "a wall may
 * not cut off the last path" rule considers walls only, and distance metrics
 * conventionally ignore the opponent's (movable) pawn.
 */

const CELLS = SIZE * SIZE;

// Scratch buffers reused across calls (single-threaded engine).
const dist = new Int16Array(CELLS);
const queue = new Int16Array(CELLS);
const parent = new Int16Array(CELLS);

/**
 * Shortest number of pawn steps from `from` to the player's goal row, or -1
 * if every route is walled off.
 */
export function distanceToGoal(s: QuoridorState, player: PlayerIndex, from?: Pos): number {
  const start = from ?? s.pawns[player];
  const goal = goalRow(player);
  if (start.r === goal) return 0;
  dist.fill(-1);
  let head = 0;
  let tail = 0;
  const si = cellIndex(start.r, start.c);
  dist[si] = 0;
  queue[tail++] = si;
  while (head < tail) {
    const cur = queue[head++]!;
    const r = (cur / SIZE) | 0;
    const c = cur % SIZE;
    const d = dist[cur]!;
    for (const [dr, dc] of DIRS) {
      if (!canStep(s, r, c, dr, dc)) continue;
      const ni = cellIndex(r + dr, c + dc);
      if (dist[ni] !== -1) continue;
      if (r + dr === goal) return d + 1;
      dist[ni] = d + 1;
      queue[tail++] = ni;
    }
  }
  return -1;
}

export function hasPathToGoal(s: QuoridorState, player: PlayerIndex): boolean {
  return distanceToGoal(s, player) >= 0;
}

/**
 * Distance-to-goal for EVERY cell (multi-source BFS from the whole goal row),
 * -1 where unreachable. One call gives the AI both its evaluation distance
 * (field[pawn]) and pawn-move ordering (field[target]).
 */
export function goalDistanceField(s: QuoridorState, player: PlayerIndex): Int16Array {
  const goal = goalRow(player);
  const field = new Int16Array(CELLS).fill(-1);
  let head = 0;
  let tail = 0;
  for (let c = 0; c < SIZE; c++) {
    const i = cellIndex(goal, c);
    field[i] = 0;
    queue[tail++] = i;
  }
  while (head < tail) {
    const cur = queue[head++]!;
    const r = (cur / SIZE) | 0;
    const c = cur % SIZE;
    const d = field[cur]!;
    for (const [dr, dc] of DIRS) {
      if (!canStep(s, r, c, dr, dc)) continue;
      const ni = cellIndex(r + dr, c + dc);
      if (field[ni] !== -1) continue;
      field[ni] = d + 1;
      queue[tail++] = ni;
    }
  }
  return field;
}

/**
 * One shortest path from the player's pawn to their goal row (inclusive of
 * both endpoints), or null if walled off. Used by hints and the easy AI.
 */
export function shortestPath(s: QuoridorState, player: PlayerIndex): Pos[] | null {
  const start = s.pawns[player];
  const goal = goalRow(player);
  if (start.r === goal) return [start];
  dist.fill(-1);
  parent.fill(-1);
  let head = 0;
  let tail = 0;
  const si = cellIndex(start.r, start.c);
  dist[si] = 0;
  queue[tail++] = si;
  let goalIdx = -1;
  while (head < tail && goalIdx === -1) {
    const cur = queue[head++]!;
    const r = (cur / SIZE) | 0;
    const c = cur % SIZE;
    for (const [dr, dc] of DIRS) {
      if (!canStep(s, r, c, dr, dc)) continue;
      const ni = cellIndex(r + dr, c + dc);
      if (dist[ni] !== -1) continue;
      dist[ni] = dist[cur]! + 1;
      parent[ni] = cur;
      if (r + dr === goal) {
        goalIdx = ni;
        break;
      }
      queue[tail++] = ni;
    }
  }
  if (goalIdx === -1) return null;
  const path: Pos[] = [];
  for (let i = goalIdx; i !== -1; i = parent[i]!) {
    path.push({ r: (i / SIZE) | 0, c: i % SIZE });
  }
  path.reverse();
  return path;
}

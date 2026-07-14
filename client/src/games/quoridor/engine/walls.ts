import { WGRID, inWallGrid, wallIndex } from './board';
import type { Orientation, QuoridorState, WallCheck } from './types';

/**
 * Geometric wall legality: bounds, overlap (sharing any segment with a wall of
 * the same orientation), and crossing (an H and a V wall through the same
 * intersection). Path blocking is checked separately in rules.ts, since it
 * needs pathfinding.
 */
export function wallGeometryCheck(
  s: QuoridorState,
  r: number,
  c: number,
  o: Orientation,
): WallCheck {
  if (!inWallGrid(r, c)) return { ok: false, reason: 'bounds' };
  if (o === 'h') {
    if (
      s.hWalls[wallIndex(r, c)] === 1 ||
      (inWallGrid(r, c - 1) && s.hWalls[wallIndex(r, c - 1)] === 1) ||
      (inWallGrid(r, c + 1) && s.hWalls[wallIndex(r, c + 1)] === 1)
    ) {
      return { ok: false, reason: 'overlap' };
    }
    if (s.vWalls[wallIndex(r, c)] === 1) return { ok: false, reason: 'cross' };
  } else {
    if (
      s.vWalls[wallIndex(r, c)] === 1 ||
      (inWallGrid(r - 1, c) && s.vWalls[wallIndex(r - 1, c)] === 1) ||
      (inWallGrid(r + 1, c) && s.vWalls[wallIndex(r + 1, c)] === 1)
    ) {
      return { ok: false, reason: 'overlap' };
    }
    if (s.hWalls[wallIndex(r, c)] === 1) return { ok: false, reason: 'cross' };
  }
  return { ok: true };
}

/** Low-level mutation — callers are responsible for legality and wall counts. */
export function setWall(s: QuoridorState, r: number, c: number, o: Orientation, on: boolean): void {
  const grid = o === 'h' ? s.hWalls : s.vWalls;
  grid[wallIndex(r, c)] = on ? 1 : 0;
}

// ── path-block prefilter ─────────────────────────────────────────────────────

/**
 * Is any placed wall's endpoint or midpoint at lattice intersection (i,j)?
 * Intersections index cell corners: (i,j) is the top-left corner of cell
 * (i,j), 0..9 on both axes. An H wall at slot (r,c) is the segment
 * (r+1,c)—(r+1,c+2); a V wall at (r,c) is (r,c+1)—(r+2,c+1).
 */
function wallTouchesPoint(s: QuoridorState, i: number, j: number): boolean {
  // H walls at row i span columns {c, c+1, c+2} ∋ j  →  c ∈ {j-2, j-1, j}.
  for (let c = j - 2; c <= j; c++) {
    if (inWallGrid(i - 1, c) && s.hWalls[wallIndex(i - 1, c)] === 1) return true;
  }
  // V walls at column j span rows {r, r+1, r+2} ∋ i  →  r ∈ {i-2, i-1, i}.
  for (let r = i - 2; r <= i; r++) {
    if (inWallGrid(r, j - 1) && s.vWalls[wallIndex(r, j - 1)] === 1) return true;
  }
  return false;
}

const onBorder = (i: number, j: number): boolean => i === 0 || i === 9 || j === 0 || j === 9;

/**
 * Fast necessary condition for a wall to cut anyone off: a new wall segment
 * can only complete a separating barrier if the barrier enters and leaves it,
 * i.e. at least TWO of its three lattice points (both endpoints and the
 * midpoint) touch the board border or an existing wall. When this returns
 * false the placement provably cannot block any path and the connectivity
 * BFS can be skipped.
 */
export function wallCouldBlockPath(
  s: QuoridorState,
  r: number,
  c: number,
  o: Orientation,
): boolean {
  let points: [number, number][];
  if (o === 'h') {
    points = [
      [r + 1, c],
      [r + 1, c + 1],
      [r + 1, c + 2],
    ];
  } else {
    points = [
      [r, c + 1],
      [r + 1, c + 1],
      [r + 2, c + 1],
    ];
  }
  let anchored = 0;
  for (const [i, j] of points) {
    if (onBorder(i, j) || wallTouchesPoint(s, i, j)) anchored++;
    if (anchored >= 2) return true;
  }
  return false;
}

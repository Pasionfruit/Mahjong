import { mulberry32 } from '@shared/rng';

/**
 * Rope Untangle — a planarity puzzle. A level is a graph whose edge set was
 * built greedily at random "layout" positions so that no two edges cross
 * there; the vertices are then scrambled to fresh random spots. Because the
 * edges were crossing-free at the layout positions, a crossing-free
 * arrangement is guaranteed to exist — every level is solvable by
 * construction. Pure geometry/graph code only; no DOM.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Edge {
  a: number;
  b: number;
}

export interface UntangleLevel {
  /** Scrambled start positions, unit square — guaranteed ≥1 crossing. */
  nodes: Point[];
  edges: Edge[];
  /** The planar generation layout — proof a crossing-free arrangement exists. */
  layout: Point[];
}

export const MAX_DEGREE = 4;

function orient(p: Point, q: Point, r: Point): number {
  return (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
}

/**
 * Proper intersection of segments ab and cd: they cross at a point interior
 * to both. Merely touching at a shared endpoint, or collinear overlap,
 * doesn't count — pins tied to the same rope end always "touch" and must
 * never read as a crossing.
 */
export function segmentsCross(a: Point, b: Point, c: Point, d: Point): boolean {
  const d1 = orient(a, b, c);
  const d2 = orient(a, b, d);
  const d3 = orient(c, d, a);
  const d4 = orient(c, d, b);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Whether two ropes cross at the given pin positions (shared pins never count). */
export function edgesCross(nodes: Point[], e: Edge, f: Edge): boolean {
  if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) return false;
  return segmentsCross(nodes[e.a]!, nodes[e.b]!, nodes[f.a]!, nodes[f.b]!);
}

export function countCrossings(nodes: Point[], edges: Edge[]): number {
  let n = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edgesCross(nodes, edges[i]!, edges[j]!)) n++;
    }
  }
  return n;
}

export function isConnected(nodeCount: number, edges: Edge[]): boolean {
  if (nodeCount === 0) return true;
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  for (const e of edges) {
    adj[e.a]!.push(e.b);
    adj[e.b]!.push(e.a);
  }
  const seen = new Set<number>([0]);
  const stack = [0];
  while (stack.length > 0) {
    const v = stack.pop()!;
    for (const w of adj[v]!) {
      if (!seen.has(w)) {
        seen.add(w);
        stack.push(w);
      }
    }
  }
  return seen.size === nodeCount;
}

function shuffle<T>(arr: T[], rand: () => number): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Scatter `count` points in the unit square (with a margin) keeping a
 * minimum pairwise distance via seeded rejection sampling. If a spot can't
 * be found in a bounded number of tries the distance relaxes slightly and
 * sampling continues — still fully deterministic.
 */
function scatter(rand: () => number, count: number): Point[] {
  const pts: Point[] = [];
  let minDist = 0.5 / Math.sqrt(count);
  while (pts.length < count) {
    let placed = false;
    for (let tries = 0; tries < 60 && !placed; tries++) {
      const p: Point = { x: 0.06 + rand() * 0.88, y: 0.06 + rand() * 0.88 };
      const ok = pts.every((q) => (q.x - p.x) ** 2 + (q.y - p.y) ** 2 >= minDist * minDist);
      if (ok) {
        pts.push(p);
        placed = true;
      }
    }
    if (!placed) minDist *= 0.85;
  }
  return pts;
}

function dist2(pts: Point[], e: Edge): number {
  const p = pts[e.a]!;
  const q = pts[e.b]!;
  return (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
}

/**
 * Build a planar-at-these-positions edge set: first a crossing-free
 * spanning structure (shortest candidate edges first, so connectivity
 * never gets walled off), then extra edges in seeded random order up to
 * ~2·nodes − 3, all under a degree cap. Returns null in the (rare) case
 * the degree cap blocks connectivity — the caller retries with a sub-seed.
 */
function buildPlanarEdges(rand: () => number, pts: Point[]): Edge[] | null {
  const n = pts.length;
  const deg: number[] = new Array(n).fill(0);
  const edges: Edge[] = [];
  const used = new Set<number>();

  const canAdd = (e: Edge): boolean =>
    deg[e.a]! < MAX_DEGREE && deg[e.b]! < MAX_DEGREE && edges.every((f) => !edgesCross(pts, e, f));
  const add = (e: Edge) => {
    edges.push(e);
    deg[e.a]!++;
    deg[e.b]!++;
    used.add(e.a * n + e.b);
  };

  const pairs: Edge[] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push({ a, b });

  // 1) Connectivity, shortest-first (union-find).
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (v: number): number => {
    while (parent[v]! !== v) {
      parent[v] = parent[parent[v]!]!;
      v = parent[v]!;
    }
    return v;
  };
  let components = n;
  const byDist = pairs.slice().sort((e, f) => dist2(pts, e) - dist2(pts, f));
  for (const e of byDist) {
    if (components === 1) break;
    const ra = find(e.a);
    const rb = find(e.b);
    if (ra === rb) continue;
    if (!canAdd(e)) continue;
    parent[ra] = rb;
    components--;
    add(e);
  }
  if (components !== 1) return null;

  // 2) Extra ropes in seeded random order, up to the target count.
  const target = 2 * n - 3;
  for (const e of shuffle(pairs, rand)) {
    if (edges.length >= target) break;
    if (used.has(e.a * n + e.b)) continue;
    if (canAdd(e)) add(e);
  }
  return edges;
}

/**
 * Deterministic level generator. `nodeCount` is clamped to ≥4 (below that a
 * crossing can't even exist). The scramble re-rolls with the next sub-seed
 * until the start position has at least one crossing, so a level can never
 * begin already solved.
 */
export function generateLevel(seed: number, nodeCount: number): UntangleLevel {
  const n = Math.max(4, Math.floor(nodeCount));
  for (let attempt = 0; attempt < 1000; attempt++) {
    const rand = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
    const layout = scatter(rand, n);
    const edges = buildPlanarEdges(rand, layout);
    if (!edges) continue; // degree cap blocked connectivity — next sub-seed
    for (let s = 0; s < 50; s++) {
      const nodes = scatter(rand, n);
      if (countCrossings(nodes, edges) > 0) return { nodes, edges, layout };
    }
    // 50 tangle-free scrambles in a row is practically impossible for any
    // connected graph of ≥4 nodes — but if it happens, rebuild from scratch.
  }
  throw new Error('untangle: level generation failed');
}

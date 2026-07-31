import { describe, expect, it } from 'vitest';
import {
  MAX_DEGREE,
  countCrossings,
  edgesCross,
  generateLevel,
  isConnected,
  segmentsCross,
  type Edge,
  type Point,
} from './engine';

const p = (x: number, y: number): Point => ({ x, y });

describe('segmentsCross', () => {
  it('detects a proper X crossing', () => {
    expect(segmentsCross(p(0, 0), p(1, 1), p(0, 1), p(1, 0))).toBe(true);
  });

  it('rejects parallel non-touching segments', () => {
    expect(segmentsCross(p(0, 0), p(1, 0), p(0, 1), p(1, 1))).toBe(false);
  });

  it('rejects segments that only share an endpoint', () => {
    expect(segmentsCross(p(0, 0), p(1, 1), p(1, 1), p(2, 0))).toBe(false);
    expect(segmentsCross(p(0, 0), p(1, 1), p(0, 0), p(1, 0))).toBe(false);
  });

  it('rejects collinear segments (overlapping or disjoint)', () => {
    expect(segmentsCross(p(0, 0), p(2, 0), p(1, 0), p(3, 0))).toBe(false);
    expect(segmentsCross(p(0, 0), p(1, 0), p(2, 0), p(3, 0))).toBe(false);
  });

  it('rejects a T-touch (endpoint resting on the other segment interior)', () => {
    expect(segmentsCross(p(0, 0), p(2, 0), p(1, 0), p(1, 1))).toBe(false);
  });

  it('rejects clearly separated segments', () => {
    expect(segmentsCross(p(0, 0), p(1, 0), p(5, 5), p(6, 6))).toBe(false);
  });
});

describe('countCrossings', () => {
  it('matches a hand-computed small case', () => {
    // Square corners + center: edge 0 (diag) crosses edge 1 (other diag);
    // edges 2 and 3 share endpoint 4 with nothing crossing them.
    const nodes = [p(0, 0), p(1, 1), p(0, 1), p(1, 0), p(0.5, 0.9)];
    const edges: Edge[] = [
      { a: 0, b: 1 },
      { a: 2, b: 3 },
      { a: 2, b: 4 },
      { a: 4, b: 1 },
    ];
    expect(countCrossings(nodes, edges)).toBe(1); // only the two diagonals
    expect(countCrossings(nodes, [edges[0]!, edges[1]!])).toBe(1);
    expect(countCrossings(nodes, [edges[2]!, edges[3]!])).toBe(0);
  });

  it('agrees with an independent brute force on a generated level', () => {
    const level = generateLevel(7, 10);
    let brute = 0;
    for (let i = 0; i < level.edges.length; i++) {
      for (let j = 0; j < level.edges.length; j++) {
        if (j <= i) continue;
        const e = level.edges[i]!;
        const f = level.edges[j]!;
        const shared = e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b;
        if (shared) continue;
        if (
          segmentsCross(level.nodes[e.a]!, level.nodes[e.b]!, level.nodes[f.a]!, level.nodes[f.b]!)
        ) {
          brute++;
        }
      }
    }
    expect(countCrossings(level.nodes, level.edges)).toBe(brute);
  });
});

describe('generateLevel', () => {
  const sizes = [8, 10, 16, 24];
  const seeds = [1, 42, 1234, 987654321];

  it('is deterministic for the same seed and size', () => {
    expect(generateLevel(42, 12)).toEqual(generateLevel(42, 12));
  });

  it('different seeds give different levels', () => {
    expect(generateLevel(1, 12).nodes).not.toEqual(generateLevel(2, 12).nodes);
  });

  it('generates a connected graph', () => {
    for (const seed of seeds) {
      for (const n of sizes) {
        const level = generateLevel(seed, n);
        expect(level.nodes).toHaveLength(n);
        expect(level.layout).toHaveLength(n);
        expect(isConnected(n, level.edges)).toBe(true);
      }
    }
  });

  it('respects the degree cap', () => {
    for (const seed of seeds) {
      for (const n of sizes) {
        const level = generateLevel(seed, n);
        const deg = new Array<number>(n).fill(0);
        for (const e of level.edges) {
          deg[e.a] = (deg[e.a] ?? 0) + 1;
          deg[e.b] = (deg[e.b] ?? 0) + 1;
        }
        for (const d of deg) expect(d).toBeLessThanOrEqual(MAX_DEGREE);
      }
    }
  });

  it('is planar at the generation layout (solvable by construction)', () => {
    for (const seed of seeds) {
      for (const n of sizes) {
        const level = generateLevel(seed, n);
        expect(countCrossings(level.layout, level.edges)).toBe(0);
      }
    }
  });

  it('the scrambled start always has at least one crossing', () => {
    for (const seed of seeds) {
      for (const n of sizes) {
        const level = generateLevel(seed, n);
        expect(countCrossings(level.nodes, level.edges)).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it('never duplicates a rope between the same two pins', () => {
    const level = generateLevel(5, 16);
    const keys = level.edges.map((e) => `${Math.min(e.a, e.b)}-${Math.max(e.a, e.b)}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('edgesCross', () => {
  it('never reports ropes sharing a pin as crossing', () => {
    const nodes = [p(0, 0), p(1, 1), p(2, 0)];
    expect(edgesCross(nodes, { a: 0, b: 1 }, { a: 1, b: 2 })).toBe(false);
  });
});

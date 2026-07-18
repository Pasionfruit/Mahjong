import { describe, expect, it } from 'vitest';
import {
  applyMove,
  checkWall,
  cloneState,
  distanceToGoal,
  deserialize,
  goalDistanceField,
  hasPathToGoal,
  isMoveLegal,
  legalMoves,
  moveNotation,
  newGame,
  pawnMoves,
  posNotation,
  serialize,
  setWall,
  shortestPath,
  undoMove,
  wallGeometryCheck,
  wallCouldBlockPath,
  type Orientation,
  type PlayerIndex,
  type QuoridorState,
  cellIndex,
  forceWall,
} from './index';

/** Deterministic PRNG for fuzz tests. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Setup {
  a: [number, number];
  b: [number, number];
  walls?: [number, number, Orientation][];
  turn?: PlayerIndex;
}

/** Player 0 = "A" (goal row 8), player 1 = "B" (goal row 0), per the rules matrix. */
function setup({ a, b, walls = [], turn = 0 }: Setup): QuoridorState {
  const s = newGame();
  s.pawns[0] = { r: a[0], c: a[1] };
  s.pawns[1] = { r: b[0], c: b[1] };
  for (const [r, c, o] of walls) forceWall(s, r, c, o);
  s.turn = turn;
  return s;
}

function moveSet(s: QuoridorState, player: PlayerIndex): Set<string> {
  return new Set(pawnMoves(s, player).map((p) => `${p.r},${p.c}`));
}

function expectMoves(s: QuoridorState, player: PlayerIndex, expected: [number, number][]): void {
  const got = [...moveSet(s, player)].sort();
  const want = expected.map(([r, c]) => `${r},${c}`).sort();
  expect(got).toEqual(want);
}

// ── official rules matrix: pawn movement ────────────────────────────────────

describe('pawn movement (official rules matrix)', () => {
  it('case 1: open center — the four orthogonal neighbors', () => {
    const s = setup({ a: [4, 4], b: [0, 4] });
    expectMoves(s, 0, [
      [3, 4],
      [5, 4],
      [4, 3],
      [4, 5],
    ]);
  });

  it('case 2: corner', () => {
    const s = setup({ a: [0, 0], b: [8, 4] });
    expectMoves(s, 0, [
      [0, 1],
      [1, 0],
    ]);
  });

  it('case 3: edge (non-corner)', () => {
    const s = setup({ a: [0, 4], b: [8, 4] });
    expectMoves(s, 0, [
      [0, 3],
      [0, 5],
      [1, 4],
    ]);
  });

  it('cases 4-7: a wall blocks each side (both covering slots)', () => {
    // north — H(3,4) and equally H(3,3) cover the (3,4)-(4,4) edge
    for (const wc of [4, 3]) {
      const s = setup({ a: [4, 4], b: [0, 0], walls: [[3, wc, 'h']] });
      expectMoves(s, 0, [
        [5, 4],
        [4, 3],
        [4, 5],
      ]);
    }
    // south
    expectMoves(setup({ a: [4, 4], b: [0, 0], walls: [[4, 4, 'h']] }), 0, [
      [3, 4],
      [4, 3],
      [4, 5],
    ]);
    // west — V(4,3) and V(3,3) both cover the (4,3)-(4,4) edge
    for (const wr of [4, 3]) {
      const s = setup({ a: [4, 4], b: [0, 0], walls: [[wr, 3, 'v']] });
      expectMoves(s, 0, [
        [3, 4],
        [5, 4],
        [4, 5],
      ]);
    }
    // east
    expectMoves(setup({ a: [4, 4], b: [0, 0], walls: [[4, 4, 'v']] }), 0, [
      [3, 4],
      [5, 4],
      [4, 3],
    ]);
  });

  it('case 8: three sides walled leaves a single exit', () => {
    const s = setup({
      a: [4, 4],
      b: [0, 4],
      walls: [
        [3, 4, 'h'],
        [4, 4, 'h'],
        [4, 3, 'v'],
      ],
    });
    expectMoves(s, 0, [[4, 5]]);
  });

  it('cases 9-12: straight jumps in all four directions; diagonals NOT offered', () => {
    // north (and the case-21 negative: no diagonal while the jump is open)
    expectMoves(setup({ a: [4, 4], b: [3, 4] }), 0, [
      [2, 4],
      [5, 4],
      [4, 3],
      [4, 5],
    ]);
    // south
    expectMoves(setup({ a: [4, 4], b: [5, 4] }), 0, [
      [6, 4],
      [3, 4],
      [4, 3],
      [4, 5],
    ]);
    // east
    expectMoves(setup({ a: [4, 4], b: [4, 5] }), 0, [
      [4, 6],
      [3, 4],
      [5, 4],
      [4, 3],
    ]);
    // west
    expectMoves(setup({ a: [4, 4], b: [4, 3] }), 0, [
      [4, 2],
      [3, 4],
      [5, 4],
      [4, 5],
    ]);
  });

  it('case 13: wall behind the opponent opens both diagonals', () => {
    const s = setup({ a: [4, 4], b: [3, 4], walls: [[2, 4, 'h']] });
    expectMoves(s, 0, [
      [3, 3],
      [3, 5],
      [5, 4],
      [4, 3],
      [4, 5],
    ]);
  });

  it('case 14: one diagonal wall-blocked leaves only the other', () => {
    const s = setup({
      a: [4, 4],
      b: [3, 4],
      walls: [
        [2, 4, 'h'],
        [2, 3, 'v'], // blocks (3,3)<->(3,4)
      ],
    });
    expectMoves(s, 0, [
      [3, 5],
      [5, 4],
      [4, 3],
      [4, 5],
    ]);
  });

  it('case 15: jump and both diagonals blocked — no move toward the opponent', () => {
    const s = setup({
      a: [4, 4],
      b: [3, 4],
      walls: [
        [2, 4, 'h'],
        [2, 3, 'v'],
        [3, 4, 'v'], // blocks (3,4)<->(3,5) and (4,4)<->(4,5)
      ],
    });
    expectMoves(s, 0, [
      [5, 4],
      [4, 3],
    ]);
  });

  it('case 16: board edge behind the opponent behaves like a wall (diagonals)', () => {
    const s = setup({ a: [4, 7], b: [4, 8] });
    expectMoves(s, 0, [
      [3, 8],
      [5, 8],
      [3, 7],
      [5, 7],
      [4, 6],
    ]);
  });

  it('case 17: edge behind + wall kills one diagonal (and a normal move)', () => {
    const s = setup({ a: [4, 7], b: [4, 8], walls: [[3, 7, 'h']] });
    expectMoves(s, 0, [
      [5, 8],
      [5, 7],
      [4, 6],
    ]);
  });

  it('case 18: opponent in a corner — only one diagonal exists', () => {
    const s = setup({ a: [0, 7], b: [0, 8] });
    expectMoves(s, 0, [
      [1, 8],
      [0, 6],
      [1, 7],
    ]);
    // H(0,7) spans columns 7 AND 8: it blocks A's own south move (0,7)-(1,7)
    // and the corner diagonal (0,8)-(1,8) simultaneously — only west remains.
    const s2 = setup({ a: [0, 7], b: [0, 8], walls: [[0, 7, 'h']] });
    expectMoves(s2, 0, [[0, 6]]);
  });

  it('case 19: a wall between the pawns disables all jump interactions', () => {
    const s = setup({ a: [4, 4], b: [3, 4], walls: [[3, 4, 'h']] });
    expectMoves(s, 0, [
      [5, 4],
      [4, 3],
      [4, 5],
    ]);
  });

  it('case 20: jump blocked with one diagonal off-board (edge column)', () => {
    const s = setup({ a: [3, 0], b: [4, 0], walls: [[4, 0, 'h']] });
    expectMoves(s, 0, [
      [4, 1],
      [2, 0],
      [3, 1],
    ]);
  });
});

// ── official rules matrix: wall placement ───────────────────────────────────

describe('wall placement', () => {
  it('cases 22-23: exact slot and shared-segment overlaps; abutting is legal', () => {
    const s = setup({ a: [0, 4], b: [8, 4], walls: [[3, 3, 'h']] });
    expect(wallGeometryCheck(s, 3, 3, 'h')).toEqual({ ok: false, reason: 'overlap' });
    expect(wallGeometryCheck(s, 3, 2, 'h')).toEqual({ ok: false, reason: 'overlap' });
    expect(wallGeometryCheck(s, 3, 4, 'h')).toEqual({ ok: false, reason: 'overlap' });
    expect(wallGeometryCheck(s, 3, 1, 'h').ok).toBe(true); // end-to-end
    expect(wallGeometryCheck(s, 3, 5, 'h').ok).toBe(true);
    expect(wallGeometryCheck(s, 2, 3, 'v').ok).toBe(true);
    expect(wallGeometryCheck(s, 4, 3, 'v').ok).toBe(true);
    expect(wallGeometryCheck(s, 3, 2, 'v').ok).toBe(true);
    expect(wallGeometryCheck(s, 3, 4, 'v').ok).toBe(true);
  });

  it('case 24: crossing at the same intersection is illegal (the only H/V conflict)', () => {
    const s = setup({ a: [0, 4], b: [8, 4], walls: [[3, 3, 'h']] });
    expect(wallGeometryCheck(s, 3, 3, 'v')).toEqual({ ok: false, reason: 'cross' });
    const s2 = setup({ a: [0, 4], b: [8, 4], walls: [[3, 3, 'v']] });
    expect(wallGeometryCheck(s2, 3, 3, 'h')).toEqual({ ok: false, reason: 'cross' });
  });

  it('case 25: bounds', () => {
    const s = newGame();
    for (const [r, c] of [
      [8, 0],
      [0, 8],
      [-1, 4],
      [4, -1],
      [8, 8],
    ] as const) {
      expect(wallGeometryCheck(s, r, c, 'h')).toEqual({ ok: false, reason: 'bounds' });
      expect(wallGeometryCheck(s, r, c, 'v')).toEqual({ ok: false, reason: 'bounds' });
    }
  });

  it('case 26/28: sealing any pawn from its goal row is rejected', () => {
    // Pawn 0 (goal row 8) cornered at (0,0) behind V(0,0); H(1,0) would seal it.
    const s = setup({ a: [0, 0], b: [8, 4], walls: [[0, 0, 'v']], turn: 1 });
    expect(checkWall(s, 1, 1, 0, 'h')).toEqual({ ok: false, reason: 'blocks-path' });
    // …even when the placer would seal their own pawn (turn 0 placing it).
    s.turn = 0;
    expect(checkWall(s, 0, 1, 0, 'h')).toEqual({ ok: false, reason: 'blocks-path' });
  });

  it('case 27: a single remaining gap to ANY goal-row square satisfies the rule', () => {
    const s = setup({
      a: [0, 4],
      b: [8, 4],
      walls: [
        [4, 0, 'h'],
        [4, 2, 'h'],
        [4, 4, 'h'],
        [4, 6, 'h'],
      ],
    });
    expect(checkWall(s, 0, 0, 0, 'v').ok).toBe(true);
    expect(wallGeometryCheck(s, 4, 7, 'h')).toEqual({ ok: false, reason: 'overlap' });
  });

  it('case 29: the path check ignores pawns (walls only)', () => {
    const s = setup({
      a: [0, 4],
      b: [4, 8], // standing ON the only gap
      walls: [
        [4, 0, 'h'],
        [4, 2, 'h'],
        [4, 4, 'h'],
        [4, 6, 'h'],
      ],
    });
    expect(checkWall(s, 0, 0, 0, 'v').ok).toBe(true);
    expect(hasPathToGoal(s, 0)).toBe(true);
  });

  it('case 30: with no walls left, only pawn moves are generated', () => {
    const s = newGame();
    s.wallsLeft = [0, 0];
    const moves = legalMoves(s);
    expect(moves.every((m) => m.t === 'pawn')).toBe(true);
    expect(moves).toHaveLength(3);
    expect(checkWall(s, 0, 4, 4, 'h')).toEqual({ ok: false, reason: 'no-walls-left' });
  });

  it('a fresh board allows all 128 wall slots', () => {
    const s = newGame();
    const walls = legalMoves(s).filter((m) => m.t === 'wall');
    expect(walls).toHaveLength(128);
  });
});

// ── pathfinding ─────────────────────────────────────────────────────────────

describe('pathfinding', () => {
  it('fresh game: both pawns are 8 steps out', () => {
    const s = newGame();
    expect(distanceToGoal(s, 0)).toBe(8);
    expect(distanceToGoal(s, 1)).toBe(8);
    expect(shortestPath(s, 0)).toHaveLength(9);
  });

  it('walls lengthen the path', () => {
    const s = newGame();
    forceWall(s, 0, 3, 'h');
    forceWall(s, 0, 5, 'h'); // pawn 0 at (0,4) must route around columns 3..6
    expect(distanceToGoal(s, 0)).toBeGreaterThan(8);
  });

  it('goalDistanceField agrees with distanceToGoal everywhere reachable', () => {
    const rng = mulberry32(42);
    const s = randomWallState(rng, 8);
    for (const player of [0, 1] as const) {
      const field = goalDistanceField(s, player);
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          expect(field[cellIndex(r, c)]).toBe(distanceToGoal(s, player, { r, c }));
        }
      }
    }
  });
});

// ── state, undo, serialization, notation ────────────────────────────────────

describe('game state', () => {
  it('applies pawn and wall moves, alternating turns', () => {
    const s = newGame();
    expect(applyMove(s, { t: 'pawn', to: { r: 1, c: 4 } })).toBe(true);
    expect(s.turn).toBe(1);
    expect(applyMove(s, { t: 'wall', r: 4, c: 4, o: 'h' })).toBe(true);
    expect(s.wallsLeft).toEqual([10, 9]);
    expect(s.turn).toBe(0);
    expect(s.history).toHaveLength(2);
  });

  it('rejects illegal moves without changing anything', () => {
    const s = newGame();
    const snap = serialize(s);
    expect(applyMove(s, { t: 'pawn', to: { r: 4, c: 4 } })).toBe(false); // too far
    expect(applyMove(s, { t: 'wall', r: 9, c: 0, o: 'h' })).toBe(false);
    expect(serialize(s)).toBe(snap);
  });

  it('detects victory on reaching the goal row and freezes the game', () => {
    const s = setup({ a: [7, 0], b: [4, 8] });
    expect(applyMove(s, { t: 'pawn', to: { r: 8, c: 0 } })).toBe(true);
    expect(s.winner).toBe(0);
    expect(legalMoves(s)).toHaveLength(0);
    expect(applyMove(s, { t: 'pawn', to: { r: 3, c: 8 } })).toBe(false);
  });

  it('undo restores the exact prior state, move by move', () => {
    const rng = mulberry32(7);
    const s = newGame();
    const snaps = [serialize(s)];
    for (let i = 0; i < 40 && s.winner === null; i++) {
      const moves = legalMoves(s);
      applyMove(s, moves[(rng() * moves.length) | 0]!);
      snaps.push(serialize(s));
    }
    while (s.history.length > 0) {
      snaps.pop();
      expect(undoMove(s)).toBe(true);
      expect(serialize(s)).toBe(snaps[snaps.length - 1]);
    }
    expect(undoMove(s)).toBe(false);
  });

  it('undo revives a finished game', () => {
    const s = setup({ a: [7, 0], b: [4, 8] });
    applyMove(s, { t: 'pawn', to: { r: 8, c: 0 } });
    expect(s.winner).toBe(0);
    undoMove(s);
    expect(s.winner).toBeNull();
    expect(s.turn).toBe(0);
    expect(s.pawns[0]).toEqual({ r: 7, c: 0 });
  });

  it('serialization round-trips and rejects junk', () => {
    const rng = mulberry32(99);
    const s = newGame();
    for (let i = 0; i < 25 && s.winner === null; i++) {
      const moves = legalMoves(s);
      applyMove(s, moves[(rng() * moves.length) | 0]!);
    }
    const restored = deserialize(serialize(s))!;
    expect(restored).not.toBeNull();
    expect(serialize(restored)).toBe(serialize(s));
    expect(deserialize('nonsense')).toBeNull();
    expect(deserialize('{"v":2}')).toBeNull();
    expect(deserialize('{"v":1,"pawns":[{"r":99,"c":0},{"r":0,"c":0}]}')).toBeNull();
  });

  it('cloneState is deep', () => {
    const s = newGame();
    const clone = cloneState(s);
    applyMove(clone, { t: 'wall', r: 4, c: 4, o: 'h' });
    expect(s.hWalls[4 * 8 + 4]).toBe(0);
    expect(s.wallsLeft[0]).toBe(10);
  });

  it('notation', () => {
    expect(posNotation({ r: 0, c: 4 })).toBe('e1');
    expect(moveNotation({ t: 'pawn', to: { r: 8, c: 8 } })).toBe('i9');
    expect(moveNotation({ t: 'wall', r: 2, c: 4, o: 'h' })).toBe('e3h');
    expect(moveNotation({ t: 'wall', r: 0, c: 0, o: 'v' })).toBe('a1v');
  });
});

// ── fuzzing ─────────────────────────────────────────────────────────────────

/** A state with `n` random legal walls placed (path rule respected). */
function randomWallState(rng: () => number, n: number): QuoridorState {
  const s = newGame();
  s.pawns[0] = { r: (rng() * 9) | 0, c: (rng() * 9) | 0 };
  do {
    s.pawns[1] = { r: (rng() * 9) | 0, c: (rng() * 9) | 0 };
  } while (s.pawns[1].r === s.pawns[0].r && s.pawns[1].c === s.pawns[0].c);
  for (let placed = 0, tries = 0; placed < n && tries < 300; tries++) {
    const r = (rng() * 8) | 0;
    const c = (rng() * 8) | 0;
    const o: Orientation = rng() < 0.5 ? 'h' : 'v';
    if (checkWall(s, 0, r, c, o).ok) {
      setWall(s, r, c, o, true);
      placed++;
    }
  }
  return s;
}

describe('fuzz', () => {
  it('the anchor prefilter never disagrees with the brute-force path check', () => {
    const rng = mulberry32(1234);
    for (let round = 0; round < 60; round++) {
      const s = randomWallState(rng, (rng() * 12) | 0);
      for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 8; c++) {
          for (const o of ['h', 'v'] as const) {
            if (!wallGeometryCheck(s, r, c, o).ok) continue;
            // Oracle: place, BFS both players, revert.
            setWall(s, r, c, o, true);
            const blocked = !hasPathToGoal(s, 0) || !hasPathToGoal(s, 1);
            setWall(s, r, c, o, false);
            if (blocked) {
              // The prefilter must never certify a blocking wall as safe…
              expect(wallCouldBlockPath(s, r, c, o)).toBe(true);
            }
            // …and checkWall must exactly match the oracle.
            expect(checkWall(s, 0, r, c, o).ok).toBe(!blocked);
          }
        }
      }
    }
  });

  it('random playouts preserve every invariant and always end', () => {
    const rng = mulberry32(2025);
    for (let game = 0; game < 60; game++) {
      const s = newGame();
      let plies = 0;
      while (s.winner === null && plies < 400) {
        const moves = legalMoves(s);
        expect(moves.length).toBeGreaterThan(0); // never stuck (case 31)
        // Bias playouts toward goal-ward pawn moves so games actually finish,
        // while still exercising walls and wandering.
        const pawnOnly = moves.filter((m) => m.t === 'pawn');
        const roll = rng();
        let pick: (typeof moves)[number];
        if (roll < 0.5 && pawnOnly.length > 0) {
          pick = pawnOnly.reduce((best, m) =>
            m.t === 'pawn' &&
            best.t === 'pawn' &&
            distanceToGoal(s, s.turn, m.to) < distanceToGoal(s, s.turn, best.to)
              ? m
              : best,
          );
        } else if (roll < 0.8 && pawnOnly.length > 0) {
          pick = pawnOnly[(rng() * pawnOnly.length) | 0]!;
        } else {
          pick = moves[(rng() * moves.length) | 0]!;
        }
        expect(isMoveLegal(s, pick)).toBe(true);
        expect(applyMove(s, pick)).toBe(true);
        // Invariants after every ply:
        expect(hasPathToGoal(s, 0)).toBe(true);
        expect(hasPathToGoal(s, 1)).toBe(true);
        expect(s.wallsLeft[0]).toBeGreaterThanOrEqual(0);
        expect(s.wallsLeft[1]).toBeGreaterThanOrEqual(0);
        const placed = [...s.hWalls, ...s.vWalls].filter((x) => x === 1).length;
        expect(placed).toBe(20 - s.wallsLeft[0] - s.wallsLeft[1]);
        // Pawns never share a square.
        expect(
          s.pawns[0].r === s.pawns[1].r && s.pawns[0].c === s.pawns[1].c,
        ).toBe(false);
        plies++;
      }
      expect(s.winner).not.toBeNull(); // biased playouts must terminate
      // The recorded win is genuine.
      expect(s.pawns[s.winner!]!.r).toBe(s.winner === 0 ? 8 : 0);
    }
  });

  it('legal pawn moves are always within board bounds and never onto the opponent', () => {
    const rng = mulberry32(555);
    for (let round = 0; round < 300; round++) {
      const s = randomWallState(rng, (rng() * 10) | 0);
      for (const player of [0, 1] as const) {
        for (const p of pawnMoves(s, player)) {
          expect(p.r).toBeGreaterThanOrEqual(0);
          expect(p.r).toBeLessThan(9);
          expect(p.c).toBeGreaterThanOrEqual(0);
          expect(p.c).toBeLessThan(9);
          const opp = s.pawns[1 - player]!;
          expect(p.r === opp.r && p.c === opp.c).toBe(false);
        }
      }
    }
  });
});

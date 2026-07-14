import { describe, expect, it } from 'vitest';
import {
  SIZE,
  WGRID,
  canStep,
  cellIndex,
  checkWall,
  distanceToGoal,
  goalDistanceField,
  hasPathToGoal,
  newGame,
  pawnMoves,
  setWall,
  shortestPath,
  wallCouldBlockPath,
  wallGeometryCheck,
  wallIndex,
  applyMove,
  undoMove,
  serialize,
  deserialize,
  legalMoves,
  type Orientation,
  type PlayerIndex,
  type QuoridorState,
} from './engine';

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

// ── independent reference implementation (from the rules spec) ──────────────

/** Reference: is the edge between adjacent cells (r,c)->(nr,nc) open? */
function refOpen(s: QuoridorState, r: number, c: number, nr: number, nc: number): boolean {
  if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) return false;
  if (r === nr) {
    // horizontal move across vertical boundary between min(c,nc) and +1
    const bc = Math.min(c, nc);
    // V wall at (wr, bc) blocks rows wr and wr+1
    for (let wr = 0; wr < WGRID; wr++) {
      if (s.vWalls[wallIndex(wr, bc)] === 1 && (wr === r || wr + 1 === r)) return false;
    }
    return true;
  }
  const br = Math.min(r, nr);
  for (let wc = 0; wc < WGRID; wc++) {
    if (s.hWalls[wallIndex(br, wc)] === 1 && (wc === c || wc + 1 === c)) return false;
  }
  return true;
}

/** Reference BFS distance from (r,c) to goal row. */
function refDist(s: QuoridorState, player: PlayerIndex, r0: number, c0: number): number {
  const goal = player === 0 ? 8 : 0;
  const seen = new Set<number>([r0 * SIZE + c0]);
  let frontier: [number, number][] = [[r0, c0]];
  let d = 0;
  while (frontier.length > 0) {
    for (const [r] of frontier) if (r === goal) return d;
    const next: [number, number][] = [];
    for (const [r, c] of frontier) {
      for (const [dr, dc] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const nr = r + dr;
        const nc = c + dc;
        if (!refOpen(s, r, c, nr, nc)) continue;
        const k = nr * SIZE + nc;
        if (seen.has(k)) continue;
        seen.add(k);
        next.push([nr, nc]);
      }
    }
    frontier = next;
    d++;
  }
  return -1;
}

/** Reference pawn moves per official rules. */
function refPawnMoves(s: QuoridorState, player: PlayerIndex): Set<string> {
  const me = s.pawns[player];
  const opp = s.pawns[1 - player]!;
  const out = new Set<string>();
  for (const [dr, dc] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const tr = me.r + dr;
    const tc = me.c + dc;
    if (!refOpen(s, me.r, me.c, tr, tc)) continue;
    if (tr !== opp.r || tc !== opp.c) {
      out.add(`${tr},${tc}`);
      continue;
    }
    const jr = tr + dr;
    const jc = tc + dc;
    if (refOpen(s, tr, tc, jr, jc)) {
      out.add(`${jr},${jc}`);
      continue;
    }
    // diagonals
    const perp: [number, number][] = dr !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
    for (const [pr, pc] of perp) {
      const sr = tr + pr;
      const sc = tc + pc;
      if (refOpen(s, tr, tc, sr, sc)) out.add(`${sr},${sc}`);
    }
  }
  return out;
}

function randomWallState(rng: () => number, n: number): QuoridorState {
  const s = newGame();
  s.pawns[0] = { r: (rng() * 9) | 0, c: (rng() * 9) | 0 };
  do {
    s.pawns[1] = { r: (rng() * 9) | 0, c: (rng() * 9) | 0 };
  } while (s.pawns[1].r === s.pawns[0].r && s.pawns[1].c === s.pawns[0].c);
  for (let placed = 0, tries = 0; placed < n && tries < 400; tries++) {
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

describe('differential vs reference', () => {
  it('canStep matches reference edge-openness for many wall states', () => {
    const rng = mulberry32(777);
    for (let round = 0; round < 200; round++) {
      const s = randomWallState(rng, (rng() * 16) | 0);
      for (let r = 0; r < SIZE; r++) {
        for (let c = 0; c < SIZE; c++) {
          for (const [dr, dc] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const got = canStep(s, r, c, dr, dc);
            const want = refOpen(s, r, c, r + dr, c + dc);
            if (got !== want) {
              throw new Error(
                `canStep mismatch round=${round} (${r},${c}) d=(${dr},${dc}) got=${got} want=${want} h=[${[...s.hWalls.keys()].filter((i) => s.hWalls[i] === 1)}] v=[${[...s.vWalls.keys()].filter((i) => s.vWalls[i] === 1)}]`,
              );
            }
          }
        }
      }
    }
  });

  it('distanceToGoal + field + shortestPath match reference BFS', () => {
    const rng = mulberry32(31337);
    for (let round = 0; round < 150; round++) {
      const s = randomWallState(rng, (rng() * 16) | 0);
      for (const player of [0, 1] as const) {
        const field = goalDistanceField(s, player);
        for (let r = 0; r < SIZE; r++) {
          for (let c = 0; c < SIZE; c++) {
            const want = refDist(s, player, r, c);
            const gotD = distanceToGoal(s, player, { r, c });
            if (gotD !== want)
              throw new Error(`distanceToGoal mismatch round=${round} p=${player} (${r},${c}) got=${gotD} want=${want}`);
            if (field[cellIndex(r, c)] !== want)
              throw new Error(`field mismatch round=${round} p=${player} (${r},${c}) got=${field[cellIndex(r, c)]} want=${want}`);
          }
        }
        const sp = shortestPath(s, player);
        const wantD = refDist(s, player, s.pawns[player].r, s.pawns[player].c);
        if (wantD === -1) {
          expect(sp).toBeNull();
        } else {
          expect(sp).not.toBeNull();
          expect(sp!.length).toBe(wantD + 1);
          expect(sp![0]).toEqual(s.pawns[player]);
          expect(sp![sp!.length - 1]!.r).toBe(player === 0 ? 8 : 0);
          for (let i = 1; i < sp!.length; i++) {
            const a = sp![i - 1]!;
            const b = sp![i]!;
            expect(Math.abs(a.r - b.r) + Math.abs(a.c - b.c)).toBe(1);
            expect(refOpen(s, a.r, a.c, b.r, b.c)).toBe(true);
          }
        }
      }
    }
  });

  it('pawnMoves matches reference and has no duplicates', () => {
    const rng = mulberry32(90210);
    for (let round = 0; round < 400; round++) {
      const s = randomWallState(rng, (rng() * 14) | 0);
      // Also force adjacent-pawn configurations half the time.
      if (round % 2 === 0) {
        const r = (rng() * 9) | 0;
        const c = (rng() * 9) | 0;
        s.pawns[0] = { r, c };
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const;
        const [dr, dc] = dirs[(rng() * 4) | 0]!;
        const or = r + dr;
        const oc = c + dc;
        if (or >= 0 && or < 9 && oc >= 0 && oc < 9) s.pawns[1] = { r: or, c: oc };
        else s.pawns[1] = { r: 8 - r, c: 8 - c };
        if (s.pawns[0].r === s.pawns[1].r && s.pawns[0].c === s.pawns[1].c) continue;
      }
      for (const player of [0, 1] as const) {
        const got = pawnMoves(s, player).map((p) => `${p.r},${p.c}`);
        expect(new Set(got).size).toBe(got.length); // no duplicates
        const want = refPawnMoves(s, player);
        expect(new Set(got)).toEqual(want);
      }
    }
  });

  it('checkWall matches place-BFS-revert oracle everywhere (dense states too)', () => {
    const rng = mulberry32(4242);
    for (let round = 0; round < 40; round++) {
      const s = randomWallState(rng, 4 + ((rng() * 14) | 0));
      for (let r = 0; r < WGRID; r++) {
        for (let c = 0; c < WGRID; c++) {
          for (const o of ['h', 'v'] as const) {
            if (!wallGeometryCheck(s, r, c, o).ok) continue;
            setWall(s, r, c, o, true);
            const blocked =
              refDist(s, 0, s.pawns[0].r, s.pawns[0].c) === -1 ||
              refDist(s, 1, s.pawns[1].r, s.pawns[1].c) === -1;
            setWall(s, r, c, o, false);
            const verdict = checkWall(s, 0, r, c, o).ok;
            if (verdict !== !blocked) {
              throw new Error(
                `checkWall mismatch round=${round} (${r},${c},${o}) prefilter=${wallCouldBlockPath(s, r, c, o)} blocked=${blocked} pawns=${JSON.stringify(s.pawns)} h=[${[...s.hWalls.keys()].filter((i) => s.hWalls[i] === 1)}] v=[${[...s.vWalls.keys()].filter((i) => s.vWalls[i] === 1)}]`,
              );
            }
          }
        }
      }
    }
  });

  it('undo/redo fuzz with serialize checkpoints including win states', () => {
    const rng = mulberry32(60622);
    for (let g = 0; g < 30; g++) {
      const s = newGame();
      const snaps = [serialize(s)];
      while (s.winner === null && s.history.length < 200) {
        const moves = legalMoves(s);
        // bias to finish
        const pawns = moves.filter((m) => m.t === 'pawn');
        const pick =
          rng() < 0.6 && pawns.length > 0 ? pawns[(rng() * pawns.length) | 0]! : moves[(rng() * moves.length) | 0]!;
        expect(applyMove(s, pick)).toBe(true);
        snaps.push(serialize(s));
        // occasionally undo a random amount and verify
        if (rng() < 0.15) {
          const back = 1 + ((rng() * Math.min(3, s.history.length - 1 > 0 ? 3 : 1)) | 0);
          for (let k = 0; k < back && s.history.length > 0; k++) {
            expect(undoMove(s)).toBe(true);
            snaps.pop();
            expect(serialize(s)).toBe(snaps[snaps.length - 1]);
          }
        }
      }
      // deserialize round trip mid-state
      const round = deserialize(serialize(s))!;
      expect(serialize(round)).toBe(serialize(s));
    }
  });
});

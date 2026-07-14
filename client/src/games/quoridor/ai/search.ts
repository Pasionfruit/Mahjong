import {
  SIZE,
  WGRID,
  canStep,
  cellIndex,
  goalDistanceField,
  goalRow,
  legalMoves,
  setWall,
  pawnMoves,
  wallGeometryCheck,
  wallIndex,
  type Move,
  type Orientation,
  type PlayerIndex,
  type Pos,
  type QuoridorState,
} from '../engine';

/**
 * Negamax + alpha-beta + iterative deepening + transposition table + killer
 * moves, shared by the Medium and Hard difficulties (different knobs). Runs on
 * a private clone of the state with make/unmake — no per-node cloning.
 *
 * Perf model (per the design notes): goal-side distance fields are computed
 * only when walls change (pawn moves reuse the parent's fields), so most
 * nodes evaluate with two array lookups; wall nodes pay the two BFS that
 * double as their path-legality check.
 */

export interface SearchOptions {
  maxDepth: number;
  timeBudgetMs: number;
  /**
   * Wall gating (Medium): walls are only searched when the mover is not
   * clearly ahead, or the opponent is nearly home. undefined = always.
   */
  gateWalls?: boolean;
  /** Uniform eval noise amplitude in centi-steps (Medium imperfection). */
  noise?: number;
  rng?: () => number;
  /** Position keys from recent game history — root moves recreating one are nudged down. */
  recentKeys?: number[];
  /** Cap on wall candidates per node (default 24). */
  wallCap?: number;
}

export interface SearchResult {
  move: Move;
  /** Centi-steps from the mover's perspective; ±WIN range = forced win/loss. */
  score: number;
  depth: number;
  nodes: number;
}

const WIN = 100_000;
const WIN_THRESHOLD = WIN - 1_000;
const MAX_PLY = 32;

// ── Zobrist hashing (two independent 32-bit tables → 53-bit TT key) ─────────

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

function zobristTable(seed: number, n: number): Uint32Array {
  const rng = mulberry32(seed);
  const t = new Uint32Array(n);
  for (let i = 0; i < n; i++) t[i] = (rng() * 0x100000000) >>> 0;
  return t;
}

const CELLS = SIZE * SIZE;
const WSLOTS = WGRID * WGRID;
// Layout: [pawn0 | pawn1 | h walls | v walls | wallsLeft0 (0..10) | wallsLeft1 | turn]
const ZN = CELLS * 2 + WSLOTS * 2 + 22 + 1;
const Z_LO = zobristTable(0xbeefcafe, ZN);
const Z_HI = zobristTable(0x1234fedc, ZN);
const zPawn = (player: PlayerIndex, i: number) => player * CELLS + i;
const zWall = (o: Orientation, i: number) => CELLS * 2 + (o === 'h' ? 0 : WSLOTS) + i;
const zLeft = (player: PlayerIndex, n: number) => CELLS * 2 + WSLOTS * 2 + player * 11 + n;
const Z_TURN = ZN - 1;

function hashState(s: QuoridorState, table: Uint32Array): number {
  let h = 0;
  h ^= table[zPawn(0, cellIndex(s.pawns[0].r, s.pawns[0].c))]!;
  h ^= table[zPawn(1, cellIndex(s.pawns[1].r, s.pawns[1].c))]!;
  for (let i = 0; i < WSLOTS; i++) {
    if (s.hWalls[i] === 1) h ^= table[zWall('h', i)]!;
    if (s.vWalls[i] === 1) h ^= table[zWall('v', i)]!;
  }
  h ^= table[zLeft(0, s.wallsLeft[0])]!;
  h ^= table[zLeft(1, s.wallsLeft[1])]!;
  if (s.turn === 1) h ^= table[Z_TURN]!;
  return h >>> 0;
}

/** Stable 53-bit key for a position (pawns, walls, stocks, side to move). */
export function positionKey(s: QuoridorState): number {
  return hashState(s, Z_LO) * 0x200000 + (hashState(s, Z_HI) & 0x1fffff);
}

interface TTEntry {
  depth: number;
  /** 0 = exact, 1 = lower bound, 2 = upper bound. */
  flag: 0 | 1 | 2;
  score: number;
  /** Encoded best move (see encodeMove), or -1. */
  best: number;
}

/** pawn → target cell (0..80); wall → 81 + orientation block + slot. */
export function encodeMove(m: Move): number {
  if (m.t === 'pawn') return cellIndex(m.to.r, m.to.c);
  return CELLS + (m.o === 'h' ? 0 : WSLOTS) + wallIndex(m.r, m.c);
}

// ── candidate wall generation ───────────────────────────────────────────────

/**
 * Wall slots (as encoded ids: h → 0..63, v → 64..127) that would sever the
 * edge between two adjacent cells.
 */
function markEdgeBlockers(a: Pos, b: Pos, out: Map<number, number>, prio: number): void {
  const bump = (id: number) => {
    const cur = out.get(id);
    if (cur === undefined || cur > prio) out.set(id, prio);
  };
  if (a.c === b.c) {
    const r = Math.min(a.r, b.r);
    if (a.c > 0) bump(wallIndex(r, a.c - 1));
    if (a.c < WGRID) bump(wallIndex(r, a.c));
  } else {
    const c = Math.min(a.c, b.c);
    if (a.r > 0) bump(WSLOTS + wallIndex(a.r - 1, c));
    if (a.r < WGRID) bump(WSLOTS + wallIndex(a.r, c));
  }
}

/** Greedy walk down a distance field from `from` — one shortest path. */
export function fieldPath(s: QuoridorState, field: Int16Array, from: Pos): Pos[] {
  const path: Pos[] = [{ ...from }];
  let { r, c } = from;
  let guard = CELLS;
  while (field[cellIndex(r, c)]! > 0 && guard-- > 0) {
    const d = field[cellIndex(r, c)]!;
    let advanced = false;
    for (const [dr, dc] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      if (!canStep(s, r, c, dr, dc)) continue;
      if (field[cellIndex(r + dr, c + dc)] === d - 1) {
        r += dr;
        c += dc;
        path.push({ r, c });
        advanced = true;
        break;
      }
    }
    if (!advanced) break;
  }
  return path;
}

/**
 * Geometrically legal walls worth searching, priority-ordered: blockers of
 * the opponent's shortest path first, then own-path blockers (defense),
 * pawn-adjacent slots, then extensions of existing walls — capped.
 */
export function candidateWalls(
  s: QuoridorState,
  field0: Int16Array,
  field1: Int16Array,
  cap: number,
): Move[] {
  const me = s.turn;
  const marks = new Map<number, number>();
  const fields: [Int16Array, Int16Array] = [field0, field1];
  const pOpp = fieldPath(s, fields[1 - me]!, s.pawns[1 - me]!);
  const pMe = fieldPath(s, fields[me]!, s.pawns[me]!);
  for (let i = 1; i < pOpp.length; i++) markEdgeBlockers(pOpp[i - 1]!, pOpp[i]!, marks, 0);
  for (let i = 1; i < pMe.length; i++) markEdgeBlockers(pMe[i - 1]!, pMe[i]!, marks, 1);

  const bump = (id: number, prio: number) => {
    const cur = marks.get(id);
    if (cur === undefined || cur > prio) marks.set(id, prio);
  };
  for (const pawn of s.pawns) {
    for (let r = pawn.r - 2; r <= pawn.r + 1; r++) {
      for (let c = pawn.c - 2; c <= pawn.c + 1; c++) {
        if (r < 0 || r >= WGRID || c < 0 || c >= WGRID) continue;
        bump(wallIndex(r, c), 2);
        bump(WSLOTS + wallIndex(r, c), 2);
      }
    }
  }
  // Extensions: slots adjacent to an existing wall's slot (maze-arm growth).
  for (let i = 0; i < WSLOTS; i++) {
    if (s.hWalls[i] !== 1 && s.vWalls[i] !== 1) continue;
    const r = (i / WGRID) | 0;
    const c = i % WGRID;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= WGRID || nc < 0 || nc >= WGRID) continue;
        bump(wallIndex(nr, nc), 3);
        bump(WSLOTS + wallIndex(nr, nc), 3);
      }
    }
  }

  const sorted = [...marks.entries()].sort((a, b) => a[1] - b[1]);
  const out: Move[] = [];
  for (const [id] of sorted) {
    const o: Orientation = id < WSLOTS ? 'h' : 'v';
    const slot = id % WSLOTS;
    const r = (slot / WGRID) | 0;
    const c = slot % WGRID;
    if (!wallGeometryCheck(s, r, c, o).ok) continue;
    out.push({ t: 'wall', r, c, o });
    if (out.length >= cap) break;
  }
  return out;
}

// ── evaluation ──────────────────────────────────────────────────────────────

/**
 * Static evaluation, centi-steps, from the mover's perspective. Path-length
 * difference dominates; spare walls matter a little; a small tempo term damps
 * odd/even-depth oscillation; with all walls spent the game is an exact race
 * (mover wins distance ties).
 */
export function evaluate(
  s: QuoridorState,
  field0: Int16Array,
  field1: Int16Array,
  noise = 0,
  rng?: () => number,
): number {
  const me = s.turn;
  const fields: [Int16Array, Int16Array] = [field0, field1];
  const myDist = fields[me]![cellIndex(s.pawns[me]!.r, s.pawns[me]!.c)]!;
  const oppDist = fields[1 - me]![cellIndex(s.pawns[1 - me]!.r, s.pawns[1 - me]!.c)]!;
  let score =
    100 * (oppDist - myDist) + 25 * (s.wallsLeft[me]! - s.wallsLeft[1 - me]!) + 40;
  if (s.wallsLeft[0] === 0 && s.wallsLeft[1] === 0) {
    // Pure race: mover needs 2·my−1 plies, opponent 2·opp — mover wins ties.
    score += myDist <= oppDist ? 3000 - 20 * myDist : -3000 + 20 * oppDist;
  }
  if (noise > 0 && rng) score += (rng() * 2 - 1) * noise;
  return score;
}

// ── search ──────────────────────────────────────────────────────────────────

class Searcher {
  private readonly s: QuoridorState;
  private readonly opts: SearchOptions;
  private readonly tt = new Map<number, TTEntry>();
  private readonly killers: number[][] = Array.from({ length: MAX_PLY }, () => [-1, -1]);
  private readonly deadline: number;
  private readonly wallCap: number;
  private hashLo = 0;
  private hashHi = 0;
  private stopped = false;
  nodes = 0;

  constructor(state: QuoridorState, opts: SearchOptions) {
    this.s = state;
    this.opts = opts;
    this.wallCap = opts.wallCap ?? 24;
    this.deadline = performance.now() + opts.timeBudgetMs;
    this.hashLo = hashState(state, Z_LO);
    this.hashHi = hashState(state, Z_HI);
  }

  private xor(i: number): void {
    this.hashLo = (this.hashLo ^ Z_LO[i]!) >>> 0;
    this.hashHi = (this.hashHi ^ Z_HI[i]!) >>> 0;
  }

  private key(): number {
    return this.hashLo * 0x200000 + (this.hashHi & 0x1fffff);
  }

  private timeUp(): boolean {
    if (this.stopped) return true;
    if ((this.nodes & 511) === 0 && performance.now() > this.deadline) this.stopped = true;
    return this.stopped;
  }

  private wallsAllowed(field0: Int16Array, field1: Int16Array): boolean {
    if (!this.opts.gateWalls) return true;
    const s = this.s;
    const me = s.turn;
    const fields: [Int16Array, Int16Array] = [field0, field1];
    const myDist = fields[me]![cellIndex(s.pawns[me]!.r, s.pawns[me]!.c)]!;
    const oppDist = fields[1 - me]![cellIndex(s.pawns[1 - me]!.r, s.pawns[1 - me]!.c)]!;
    // Medium is wall-shy: builds only when not ahead or under imminent threat.
    return myDist >= oppDist || oppDist <= 3;
  }

  /** This node's moves, ordered: TT move, killers, pawn steps by progress, walls. */
  private genMoves(field0: Int16Array, field1: Int16Array, ttBest: number, ply: number): Move[] {
    const s = this.s;
    const fieldMe = (s.turn === 0 ? field0 : field1)!;
    const pawns = pawnMoves(s, s.turn)
      .map((to): [Move, number] => {
        const d = fieldMe[cellIndex(to.r, to.c)]!;
        return [{ t: 'pawn', to }, d === -1 ? 99 : d];
      })
      .sort((a, b) => a[1] - b[1])
      .map(([m]) => m);
    let walls: Move[] = [];
    if (s.wallsLeft[s.turn]! > 0 && this.wallsAllowed(field0, field1)) {
      walls = candidateWalls(s, field0, field1, this.wallCap);
    }
    const moves = [...pawns, ...walls];
    // Hoist killers (stable), then the TT move to the very front.
    const hoist = (code: number, toFront: boolean) => {
      if (code < 0) return;
      const i = moves.findIndex((m) => encodeMove(m) === code);
      if (i > 0) {
        const [m] = moves.splice(i, 1);
        if (toFront) moves.unshift(m!);
        else moves.splice(Math.min(1, moves.length), 0, m!);
      }
    };
    hoist(this.killers[ply]![1]!, false);
    hoist(this.killers[ply]![0]!, false);
    hoist(ttBest, true);
    return moves;
  }

  private noteKiller(ply: number, code: number): void {
    const k = this.killers[ply]!;
    if (k[0] !== code) {
      k[1] = k[0]!;
      k[0] = code;
    }
  }

  private makePawn(to: Pos): Pos {
    const s = this.s;
    const from = s.pawns[s.turn]!;
    this.xor(zPawn(s.turn, cellIndex(from.r, from.c)));
    this.xor(zPawn(s.turn, cellIndex(to.r, to.c)));
    s.pawns[s.turn] = { r: to.r, c: to.c };
    this.flipTurn();
    return from;
  }

  private unmakePawn(from: Pos): void {
    const s = this.s;
    this.flipTurn();
    const cur = s.pawns[s.turn]!;
    this.xor(zPawn(s.turn, cellIndex(cur.r, cur.c)));
    this.xor(zPawn(s.turn, cellIndex(from.r, from.c)));
    s.pawns[s.turn] = { r: from.r, c: from.c };
  }

  private makeWall(m: Extract<Move, { t: 'wall' }>): void {
    const s = this.s;
    setWall(s, m.r, m.c, m.o, true);
    this.xor(zWall(m.o, wallIndex(m.r, m.c)));
    this.xor(zLeft(s.turn, s.wallsLeft[s.turn]!));
    s.wallsLeft[s.turn] -= 1;
    this.xor(zLeft(s.turn, s.wallsLeft[s.turn]!));
    this.flipTurn();
  }

  private unmakeWall(m: Extract<Move, { t: 'wall' }>): void {
    const s = this.s;
    this.flipTurn();
    setWall(s, m.r, m.c, m.o, false);
    this.xor(zWall(m.o, wallIndex(m.r, m.c)));
    this.xor(zLeft(s.turn, s.wallsLeft[s.turn]!));
    s.wallsLeft[s.turn] += 1;
    this.xor(zLeft(s.turn, s.wallsLeft[s.turn]!));
  }

  private flipTurn(): void {
    this.s.turn = (1 - this.s.turn) as PlayerIndex;
    this.xor(Z_TURN);
  }

  /**
   * Place a candidate wall if it leaves both players a path. Returns the
   * child's distance fields — they double as the legality check (a sealed-in
   * pawn reads -1), so wall nodes pay exactly the two BFS they need anyway.
   */
  private tryWall(m: Extract<Move, { t: 'wall' }>): [Int16Array, Int16Array] | null {
    const s = this.s;
    setWall(s, m.r, m.c, m.o, true);
    const f0 = goalDistanceField(s, 0);
    if (f0[cellIndex(s.pawns[0].r, s.pawns[0].c)] === -1) {
      setWall(s, m.r, m.c, m.o, false);
      return null;
    }
    const f1 = goalDistanceField(s, 1);
    if (f1[cellIndex(s.pawns[1].r, s.pawns[1].c)] === -1) {
      setWall(s, m.r, m.c, m.o, false);
      return null;
    }
    setWall(s, m.r, m.c, m.o, false);
    this.makeWall(m);
    return [f0, f1];
  }

  private negamax(
    depth: number,
    ply: number,
    alpha: number,
    beta: number,
    field0: Int16Array,
    field1: Int16Array,
  ): number {
    this.nodes++;
    // __SCRATCH_DEBUG__: verify incremental hash never drifts.
    if ((globalThis as { __QUOR_HASH_CHECK__?: boolean }).__QUOR_HASH_CHECK__) {
      if (this.key() !== positionKey(this.s)) {
        throw new Error('zobrist drift at node ' + this.nodes);
      }
    }
    if (this.timeUp()) return alpha;
    const s = this.s;

    const key = this.key();
    let ttBest = -1;
    const entry = this.tt.get(key);
    if (entry) {
      ttBest = entry.best;
      if (entry.depth >= depth) {
        if (entry.flag === 0) return entry.score;
        if (entry.flag === 1 && entry.score >= beta) return entry.score;
        if (entry.flag === 2 && entry.score <= alpha) return entry.score;
      }
    }

    if (depth <= 0) {
      return evaluate(s, field0, field1, this.opts.noise ?? 0, this.opts.rng);
    }

    const moves = this.genMoves(field0, field1, ttBest, ply);
    let best = -Infinity;
    let bestMove = -1;
    const alphaOrig = alpha;

    for (const move of moves) {
      let score: number;
      if (move.t === 'pawn') {
        if (move.to.r === goalRow(s.turn)) {
          score = WIN - ply; // immediate win — no need to descend
        } else {
          const from = this.makePawn(move.to);
          // Walls unchanged → the distance fields stay valid for the child.
          score = -this.negamax(depth - 1, ply + 1, -beta, -alpha, field0, field1);
          this.unmakePawn(from);
        }
      } else {
        const fields = this.tryWall(move);
        if (!fields) continue; // would seal someone in
        score = -this.negamax(depth - 1, ply + 1, -beta, -alpha, fields[0], fields[1]);
        this.unmakeWall(move);
      }
      if (this.stopped) return alpha;
      if (score > best) {
        best = score;
        bestMove = encodeMove(move);
      }
      if (best > alpha) alpha = best;
      if (alpha >= beta) {
        this.noteKiller(ply, bestMove);
        break;
      }
    }

    if (best === -Infinity) {
      // No legal move at all (unreachable in legal 2-player play) — a loss.
      return -WIN + ply;
    }

    // Near-mate scores are ply-relative; don't let them poison the table.
    if (Math.abs(best) < WIN_THRESHOLD) {
      this.tt.set(key, {
        depth,
        flag: best <= alphaOrig ? 2 : best >= beta ? 1 : 0,
        score: best,
        best: bestMove,
      });
    }
    return best;
  }

  /** One full-width root pass at `depth`; null when the clock cut it short. */
  private rootSearch(
    depth: number,
    rootMoves: Move[],
    field0: Int16Array,
    field1: Int16Array,
    recent: Set<number>,
  ): { move: Move; score: number }[] | null {
    const s = this.s;
    const scored: { move: Move; score: number }[] = [];
    let alpha = -Infinity;
    for (const move of rootMoves) {
      let score: number;
      if (move.t === 'pawn') {
        if (move.to.r === goalRow(s.turn)) {
          score = WIN;
        } else {
          const from = this.makePawn(move.to);
          score = -this.negamax(depth - 1, 1, -Infinity, -alpha, field0, field1);
          // Shuffling back to a recent position is mildly discouraged.
          if (recent.has(this.key())) score -= 15;
          this.unmakePawn(from);
        }
      } else {
        const fields = this.tryWall(move);
        if (!fields) continue;
        score = -this.negamax(depth - 1, 1, -Infinity, -alpha, fields[0], fields[1]);
        this.unmakeWall(move);
      }
      if (this.stopped) return null; // depth not completed — discard
      scored.push({ move, score });
      if (score > alpha) alpha = score;
    }
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }

  /** Iterative deepening under the time budget. */
  run(): SearchResult & { ranked: { move: Move; score: number }[] } {
    const s = this.s;
    const field0 = goalDistanceField(s, 0);
    const field1 = goalDistanceField(s, 1);
    const recent = new Set(this.opts.recentKeys ?? []);

    // Root uses the FULL legal move set (one node can afford it), ordered
    // pawn-first the same way inner nodes are.
    let rootMoves = legalMoves(s);
    const fieldMe = (s.turn === 0 ? field0 : field1)!;
    rootMoves.sort((a, b) => {
      const da = a.t === 'pawn' ? fieldMe[cellIndex(a.to.r, a.to.c)]! : 50;
      const db = b.t === 'pawn' ? fieldMe[cellIndex(b.to.r, b.to.c)]! : 50;
      return da - db;
    });

    // Endgame races have tiny branching — look much further ahead.
    let maxDepth = this.opts.maxDepth;
    if (s.wallsLeft[0] === 0 && s.wallsLeft[1] === 0) maxDepth = Math.max(maxDepth, 9);

    let best: { move: Move; score: number } = { move: rootMoves[0]!, score: 0 };
    let ranked: { move: Move; score: number }[] = rootMoves.map((move) => ({ move, score: 0 }));
    let completedDepth = 0;

    for (let depth = 1; depth <= maxDepth; depth++) {
      const scored = this.rootSearch(depth, rootMoves, field0, field1, recent);
      if (!scored || scored.length === 0) break;
      best = scored[0]!;
      ranked = scored;
      completedDepth = depth;
      rootMoves = scored.map((x) => x.move); // next iteration in this order
      if (best.score > WIN_THRESHOLD) break; // forced win found
      if (performance.now() > this.deadline) break;
    }
    return { move: best.move, score: best.score, depth: completedDepth, nodes: this.nodes, ranked };
  }
}

/** Search a clone of `state`; never mutates the input. */
export function searchBestMove(
  state: QuoridorState,
  opts: SearchOptions,
): SearchResult & { ranked: { move: Move; score: number }[] } {
  const clone: QuoridorState = {
    pawns: [{ ...state.pawns[0] }, { ...state.pawns[1] }],
    hWalls: state.hWalls.slice(),
    vWalls: state.vWalls.slice(),
    wallsLeft: [state.wallsLeft[0], state.wallsLeft[1]],
    turn: state.turn,
    winner: null,
    history: [],
  };
  return new Searcher(clone, opts).run();
}

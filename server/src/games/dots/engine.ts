import type { DotsAction, DotsSettings } from '@shared/dots';
import type { GameEvent } from '@shared/view';
import type { ApplyResult } from '../GameModule';

/** One drawable edge, in the shared addressing scheme. */
export interface Edge {
  o: 'h' | 'v';
  r: number;
  c: number;
}

export interface DotsState {
  settings: DotsSettings;
  size: number;
  playerCount: number;
  round: number;
  /** Edge owners, -1 undrawn: h is (N+1)·N, v is N·(N+1). */
  hEdges: Int8Array;
  vEdges: Int8Array;
  /** Box owners, -1 unclaimed. */
  boxes: Int8Array;
  scores: number[];
  turnSeat: number;
  /** The mover just claimed a box and goes again (UI hint). */
  extraTurn: boolean;
  claimed: number;
  lastEdge: Edge | null;
  over: boolean;
  winnerSeats: number[];
}

export const hIndex = (s: DotsState, r: number, c: number): number => r * s.size + c;
export const vIndex = (s: DotsState, r: number, c: number): number => r * (s.size + 1) + c;
export const boxIndex = (s: DotsState, r: number, c: number): number => r * s.size + c;

export function newDotsGame(
  settings: DotsSettings,
  playerCount: number,
  dealerSeat: number,
  round: number,
): DotsState {
  const n = settings.size;
  return {
    settings: { ...settings },
    size: n,
    playerCount,
    round,
    hEdges: new Int8Array((n + 1) * n).fill(-1),
    vEdges: new Int8Array(n * (n + 1)).fill(-1),
    boxes: new Int8Array(n * n).fill(-1),
    scores: Array(playerCount).fill(0) as number[],
    turnSeat: dealerSeat % playerCount,
    extraTurn: false,
    claimed: 0,
    lastEdge: null,
    over: false,
    winnerSeats: [],
  };
}

export function edgeDrawn(s: DotsState, e: Edge): boolean {
  return e.o === 'h' ? s.hEdges[hIndex(s, e.r, e.c)] !== -1 : s.vEdges[vIndex(s, e.r, e.c)] !== -1;
}

export function edgeInBounds(s: DotsState, e: Edge): boolean {
  const n = s.size;
  if (!Number.isInteger(e.r) || !Number.isInteger(e.c)) return false;
  if (e.o === 'h') return e.r >= 0 && e.r <= n && e.c >= 0 && e.c < n;
  return e.r >= 0 && e.r < n && e.c >= 0 && e.c <= n;
}

/** How many of box(r,c)'s four sides are drawn. */
export function boxSides(s: DotsState, r: number, c: number): number {
  let sides = 0;
  if (s.hEdges[hIndex(s, r, c)] !== -1) sides++;
  if (s.hEdges[hIndex(s, r + 1, c)] !== -1) sides++;
  if (s.vEdges[vIndex(s, r, c)] !== -1) sides++;
  if (s.vEdges[vIndex(s, r, c + 1)] !== -1) sides++;
  return sides;
}

/** The 1–2 boxes an edge borders. */
export function edgeBoxes(s: DotsState, e: Edge): [number, number][] {
  const out: [number, number][] = [];
  if (e.o === 'h') {
    if (e.r > 0) out.push([e.r - 1, e.c]);
    if (e.r < s.size) out.push([e.r, e.c]);
  } else {
    if (e.c > 0) out.push([e.r, e.c - 1]);
    if (e.c < s.size) out.push([e.r, e.c]);
  }
  return out;
}

export function undrawnEdges(s: DotsState): Edge[] {
  const out: Edge[] = [];
  for (let r = 0; r <= s.size; r++) {
    for (let c = 0; c < s.size; c++) {
      if (s.hEdges[hIndex(s, r, c)] === -1) out.push({ o: 'h', r, c });
    }
  }
  for (let r = 0; r < s.size; r++) {
    for (let c = 0; c <= s.size; c++) {
      if (s.vEdges[vIndex(s, r, c)] === -1) out.push({ o: 'v', r, c });
    }
  }
  return out;
}

/** Would drawing `e` complete at least one box? */
export function completesBox(s: DotsState, e: Edge): boolean {
  return edgeBoxes(s, e).some(([r, c]) => boxSides(s, r, c) === 3);
}

/** Would drawing `e` hand the opponent a 3-sided box? */
export function createsThirdSide(s: DotsState, e: Edge): boolean {
  return edgeBoxes(s, e).some(([r, c]) => boxSides(s, r, c) === 2);
}

export function cloneDots(s: DotsState): DotsState {
  return {
    ...s,
    settings: { ...s.settings },
    hEdges: s.hEdges.slice(),
    vEdges: s.vEdges.slice(),
    boxes: s.boxes.slice(),
    scores: [...s.scores],
    winnerSeats: [...s.winnerSeats],
    lastEdge: s.lastEdge && { ...s.lastEdge },
  };
}

/**
 * Draw an edge for the seat on turn. Completing any box claims it, scores it,
 * and keeps the turn; otherwise play passes on. Fills detect the end of the
 * game and the winner set (ties allowed).
 */
export function applyDotsEdge(s: DotsState, seat: number, e: Edge): ApplyResult {
  if (s.over) return { ok: false, error: 'the game is over' };
  if (seat !== s.turnSeat) return { ok: false, error: 'not your turn' };
  if (!edgeInBounds(s, e)) return { ok: false, error: 'edge out of bounds' };
  if (edgeDrawn(s, e)) return { ok: false, error: 'edge already drawn' };

  if (e.o === 'h') s.hEdges[hIndex(s, e.r, e.c)] = seat;
  else s.vEdges[vIndex(s, e.r, e.c)] = seat;
  s.lastEdge = { ...e };

  let completed = 0;
  for (const [r, c] of edgeBoxes(s, e)) {
    if (s.boxes[boxIndex(s, r, c)] === -1 && boxSides(s, r, c) === 4) {
      s.boxes[boxIndex(s, r, c)] = seat;
      completed++;
    }
  }
  const events: GameEvent[] = [{ t: 'edge', seat }];
  if (completed > 0) {
    s.scores[seat]! += completed;
    s.claimed += completed;
    s.extraTurn = true;
    events.push({ t: 'box', seat, count: completed });
  } else {
    s.extraTurn = false;
    s.turnSeat = (s.turnSeat + 1) % s.playerCount;
  }

  if (s.claimed === s.size * s.size) {
    s.over = true;
    const top = Math.max(...s.scores);
    s.winnerSeats = s.scores.flatMap((sc, i) => (sc === top ? [i] : []));
    for (const w of s.winnerSeats) events.push({ t: 'win', seat: w, by: 'lastStanding' });
  }
  return { ok: true, events };
}

export function validateDotsAction(a: unknown): a is DotsAction {
  if (typeof a !== 'object' || a === null) return false;
  const x = a as Record<string, unknown>;
  return (
    x.t === 'edge' &&
    (x.o === 'h' || x.o === 'v') &&
    typeof x.r === 'number' &&
    typeof x.c === 'number'
  );
}

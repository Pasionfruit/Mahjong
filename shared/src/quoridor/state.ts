import { SIZE, WALLS_PER_PLAYER, WGRID, startPos, wallIndex } from './board';
import { isMoveLegal, reachedGoal } from './rules';
import { setWall } from './walls';
import type { Move, PlayerIndex, Pos, QuoridorState } from './types';

export function newGame(wallsPerPlayer: number = WALLS_PER_PLAYER): QuoridorState {
  return {
    pawns: [startPos(0), startPos(1)],
    hWalls: new Uint8Array(WGRID * WGRID),
    vWalls: new Uint8Array(WGRID * WGRID),
    wallsLeft: [wallsPerPlayer, wallsPerPlayer],
    turn: 0,
    winner: null,
    history: [],
  };
}

/** Deep copy (history included) — for AI search roots and undo-free previews. */
export function cloneState(s: QuoridorState): QuoridorState {
  return {
    pawns: [{ ...s.pawns[0] }, { ...s.pawns[1] }],
    hWalls: s.hWalls.slice(),
    vWalls: s.vWalls.slice(),
    wallsLeft: [s.wallsLeft[0], s.wallsLeft[1]],
    turn: s.turn,
    winner: s.winner,
    history: s.history.map((h) => ({ ...h, move: { ...h.move }, from: h.from && { ...h.from } })),
  };
}

/**
 * Validate and apply a move for the player to move; advances the turn and
 * settles the winner. Returns false (untouched state) on an illegal move.
 */
export function applyMove(s: QuoridorState, move: Move): boolean {
  if (!isMoveLegal(s, move)) return false;
  const player = s.turn;
  if (move.t === 'pawn') {
    const from = { ...s.pawns[player] };
    s.pawns[player] = { r: move.to.r, c: move.to.c };
    s.history.push({ player, move: { t: 'pawn', to: { ...move.to } }, from });
    if (reachedGoal(player, move.to.r)) s.winner = player;
  } else {
    setWall(s, move.r, move.c, move.o, true);
    s.wallsLeft[player] -= 1;
    s.history.push({ player, move: { ...move } });
  }
  if (s.winner === null) s.turn = (1 - player) as PlayerIndex;
  return true;
}

/** Revert the last applied move. Returns false when there is none. */
export function undoMove(s: QuoridorState): boolean {
  const entry = s.history.pop();
  if (!entry) return false;
  if (entry.move.t === 'pawn') {
    s.pawns[entry.player] = { ...entry.from! };
  } else {
    setWall(s, entry.move.r, entry.move.c, entry.move.o, false);
    s.wallsLeft[entry.player] += 1;
  }
  s.winner = null;
  s.turn = entry.player;
  return true;
}

// ── notation ─────────────────────────────────────────────────────────────────

const COLS = 'abcdefghi';

/** "e5" for cells (row 1 = top row), "e3h" / "e3v" for walls. */
export function posNotation(p: Pos): string {
  return `${COLS[p.c]}${p.r + 1}`;
}

export function moveNotation(move: Move): string {
  if (move.t === 'pawn') return posNotation(move.to);
  return `${COLS[move.c]}${move.r + 1}${move.o}`;
}

// ── serialization (save/load) ────────────────────────────────────────────────

interface SavedGame {
  v: 1;
  pawns: [Pos, Pos];
  h: number[];
  vw: number[];
  wallsLeft: [number, number];
  turn: PlayerIndex;
  winner: PlayerIndex | null;
  history: QuoridorState['history'];
}

export function serialize(s: QuoridorState): string {
  const packed: SavedGame = {
    v: 1,
    pawns: [{ ...s.pawns[0] }, { ...s.pawns[1] }],
    h: [...s.hWalls.keys()].filter((i) => s.hWalls[i] === 1),
    vw: [...s.vWalls.keys()].filter((i) => s.vWalls[i] === 1),
    wallsLeft: [s.wallsLeft[0], s.wallsLeft[1]],
    turn: s.turn,
    winner: s.winner,
    history: s.history,
  };
  return JSON.stringify(packed);
}

/** Parse a saved game; null on malformed input (never throws). */
export function deserialize(json: string): QuoridorState | null {
  try {
    const d = JSON.parse(json) as SavedGame;
    if (d.v !== 1 || !Array.isArray(d.pawns) || d.pawns.length !== 2) return null;
    const okPos = (p: Pos) =>
      Number.isInteger(p?.r) && Number.isInteger(p?.c) && p.r >= 0 && p.r < SIZE && p.c >= 0 && p.c < SIZE;
    if (!okPos(d.pawns[0]) || !okPos(d.pawns[1])) return null;
    const s = newGame();
    s.pawns = [{ ...d.pawns[0] }, { ...d.pawns[1] }];
    for (const i of d.h) {
      if (Number.isInteger(i) && i >= 0 && i < WGRID * WGRID) s.hWalls[i] = 1;
    }
    for (const i of d.vw) {
      if (Number.isInteger(i) && i >= 0 && i < WGRID * WGRID) s.vWalls[i] = 1;
    }
    s.wallsLeft = [
      Math.min(Math.max(d.wallsLeft?.[0] ?? 0, 0), WALLS_PER_PLAYER),
      Math.min(Math.max(d.wallsLeft?.[1] ?? 0, 0), WALLS_PER_PLAYER),
    ];
    s.turn = d.turn === 1 ? 1 : 0;
    s.winner = d.winner === 0 || d.winner === 1 ? d.winner : null;
    s.history = Array.isArray(d.history) ? d.history : [];
    return s;
  } catch {
    return null;
  }
}

/** Convenience for tests/AI setups: place walls without legality checks. */
export function forceWall(s: QuoridorState, r: number, c: number, o: 'h' | 'v'): void {
  const grid = o === 'h' ? s.hWalls : s.vWalls;
  grid[wallIndex(r, c)] = 1;
}

import {
  MINEFIELD_PRESETS,
  type MinefieldAction,
  type MinefieldSettings,
} from '@shared/minefield';
import type { GameEvent } from '@shared/view';
import { mulberry32 } from '../../engine/rng';

/**
 * Minefield's shared-board reducer. Board generation reuses the solo
 * Minesweeper approach (seeded RNG, safe-start exclusion, BFS flood fill)
 * but mines are placed once at round start rather than deferred to a first
 * click — with several players sharing one board there's no single "first
 * click" moment to defer to, so the server instead auto-reveals a safe
 * starting patch for everyone before anyone has acted.
 */

export interface MfCell {
  mine: boolean;
  revealed: boolean;
  /** Meaningless until minesPlaced/revealed — neighboring mine count. */
  adjacent: number;
  /** Seat that revealed this cell, or null for the free starting patch. */
  owner: number | null;
}

export interface MinefieldState {
  settings: MinefieldSettings;
  playerCount: number;
  round: number;
  rows: number;
  cols: number;
  mineCount: number;
  cells: MfCell[];
  eliminated: boolean[];
  revealedCount: number[];
  over: boolean;
  winnerSeats: number[] | null;
}

export type MfApplyResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

// ── board geometry ──────────────────────────────────────────────────────────

export function neighborsOf(index: number, rows: number, cols: number): number[] {
  const r = Math.floor(index / cols);
  const c = index % cols;
  const result: number[] = [];
  for (let dr = -1; dr <= 1; dr++) {
    for (let dc = -1; dc <= 1; dc++) {
      if (dr === 0 && dc === 0) continue;
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) result.push(nr * cols + nc);
    }
  }
  return result;
}

function placeMines(
  rng: () => number,
  excludeIndex: number,
  rows: number,
  cols: number,
  mineCount: number,
): Set<number> {
  const excluded = new Set([excludeIndex, ...neighborsOf(excludeIndex, rows, cols)]);
  const pool: number[] = [];
  for (let i = 0; i < rows * cols; i++) if (!excluded.has(i)) pool.push(i);
  const mines = new Set<number>();
  while (mines.size < mineCount && pool.length > 0) {
    const j = Math.floor(rng() * pool.length);
    mines.add(pool[j]!);
    pool.splice(j, 1);
  }
  return mines;
}

function buildCells(mines: Set<number>, rows: number, cols: number): MfCell[] {
  const cells: MfCell[] = Array.from({ length: rows * cols }, (_, i) => ({
    mine: mines.has(i),
    revealed: false,
    adjacent: 0,
    owner: null,
  }));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i]!.mine) continue;
    cells[i]!.adjacent = neighborsOf(i, rows, cols).filter((n) => cells[n]!.mine).length;
  }
  return cells;
}

function floodFrom(start: number, cells: MfCell[], rows: number, cols: number): number[] {
  const seen = new Set<number>();
  const queue = [start];
  const toReveal: number[] = [];
  while (queue.length > 0) {
    const i = queue.shift()!;
    if (seen.has(i)) continue;
    seen.add(i);
    const cell = cells[i]!;
    if (cell.revealed || cell.mine) continue;
    toReveal.push(i);
    if (cell.adjacent === 0) {
      for (const n of neighborsOf(i, rows, cols)) {
        const nc = cells[n]!;
        if (!seen.has(n) && !nc.revealed && !nc.mine) queue.push(n);
      }
    }
  }
  return toReveal;
}

// ── no-guess solvability check ──────────────────────────────────────────────

/**
 * Whether the board can be fully cleared from `startRevealed` using pure
 * logical deduction — no 50/50s or worse. Three deduction rules run to a
 * fixpoint: (a) a revealed number whose hidden-neighbor count matches its
 * remaining mine count means all of them are mines (or, if its remaining
 * count is 0, all of them are safe); (b) subset reasoning between two
 * revealed numbers whose hidden-neighbor sets overlap (catches the classic
 * "obvious once you compare two clues" deductions single-point logic
 * misses); (c) once every mine is accounted for, every other hidden cell is
 * safe (and vice versa). This mirrors what a careful human solver — not a
 * guesser — could always deduce; it can't reproduce true SAT-solver-only
 * deductions, but those are rare enough in practice that this is what every
 * real "no-guess" Minesweeper generator actually ships.
 */
function isNoGuessSolvable(
  cells: MfCell[],
  rows: number,
  cols: number,
  mineCount: number,
  startRevealed: readonly number[],
): boolean {
  const n = cells.length;
  const revealed = new Set(startRevealed);
  const deducedMine = new Set<number>();

  const hiddenNeighborsOf = (i: number) =>
    neighborsOf(i, rows, cols).filter((x) => !revealed.has(x) && !deducedMine.has(x));

  let progress = true;
  while (progress) {
    progress = false;

    // Rule A: single-cell deduction on every revealed numbered cell.
    for (const i of revealed) {
      const nbrs = neighborsOf(i, rows, cols);
      const hidden = hiddenNeighborsOf(i);
      if (hidden.length === 0) continue;
      const knownMines = nbrs.filter((x) => deducedMine.has(x)).length;
      const remaining = cells[i]!.adjacent - knownMines;
      if (remaining === 0) {
        for (const h of hidden) revealed.add(h);
        progress = true;
      } else if (remaining === hidden.length) {
        for (const h of hidden) deducedMine.add(h);
        progress = true;
      }
    }

    // Rule B: pairwise subset deduction across the frontier.
    const frontier = [...revealed].filter((i) => hiddenNeighborsOf(i).length > 0);
    for (const a of frontier) {
      const hiddenA = new Set(hiddenNeighborsOf(a));
      if (hiddenA.size === 0) continue;
      const remainA = cells[a]!.adjacent - neighborsOf(a, rows, cols).filter((x) => deducedMine.has(x)).length;
      for (const b of frontier) {
        if (a === b) continue;
        const hiddenB = new Set(hiddenNeighborsOf(b));
        if (hiddenB.size <= hiddenA.size) continue;
        let subset = true;
        for (const h of hiddenA) if (!hiddenB.has(h)) { subset = false; break; }
        if (!subset) continue;
        const remainB = cells[b]!.adjacent - neighborsOf(b, rows, cols).filter((x) => deducedMine.has(x)).length;
        const diff = [...hiddenB].filter((h) => !hiddenA.has(h));
        const diffMines = remainB - remainA;
        if (diffMines === 0) {
          for (const d of diff) revealed.add(d);
          progress = true;
        } else if (diffMines === diff.length) {
          for (const d of diff) deducedMine.add(d);
          progress = true;
        }
      }
    }

    // Rule C: global mine-count deduction.
    const hiddenAll: number[] = [];
    for (let i = 0; i < n; i++) if (!revealed.has(i) && !deducedMine.has(i)) hiddenAll.push(i);
    const remainingMines = mineCount - deducedMine.size;
    if (hiddenAll.length > 0) {
      if (remainingMines === 0) {
        for (const h of hiddenAll) revealed.add(h);
        progress = true;
      } else if (remainingMines === hiddenAll.length) {
        for (const h of hiddenAll) deducedMine.add(h);
        progress = true;
      }
    }
  }

  for (let i = 0; i < n; i++) if (!cells[i]!.mine && !revealed.has(i)) return false;
  return true;
}

const MAX_NOGUESS_ATTEMPTS = 400;

// ── round setup ──────────────────────────────────────────────────────────────

export function newMinefieldGame(
  settings: MinefieldSettings,
  playerCount: number,
  round: number,
  seed: number,
): MinefieldState {
  const spec = MINEFIELD_PRESETS[settings.preset];
  const { rows, cols, mines: mineCount } = spec;
  const start = Math.floor(rows / 2) * cols + Math.floor(cols / 2);

  let cells: MfCell[] | null = null;
  let startReveal: number[] = [];
  const attempts = settings.noGuess ? MAX_NOGUESS_ATTEMPTS : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
    const mines = placeMines(rng, start, rows, cols, mineCount);
    const candidate = buildCells(mines, rows, cols);
    const reveal = floodFrom(start, candidate, rows, cols);
    if (!settings.noGuess || isNoGuessSolvable(candidate, rows, cols, mineCount, reveal)) {
      cells = candidate;
      startReveal = reveal;
      break;
    }
    // Last attempt still wins as a best-effort fallback if none solved cleanly.
    if (attempt === attempts - 1) {
      cells = candidate;
      startReveal = reveal;
    }
  }

  for (const i of startReveal) cells![i]!.revealed = true;

  return {
    settings: { ...settings },
    playerCount,
    round,
    rows,
    cols,
    mineCount,
    cells: cells!,
    eliminated: Array.from({ length: playerCount }, () => false),
    revealedCount: Array.from({ length: playerCount }, () => 0),
    over: false,
    winnerSeats: null,
  };
}

// ── actions ─────────────────────────────────────────────────────────────────

function activeSeats(s: MinefieldState): number[] {
  const active: number[] = [];
  for (let seat = 0; seat < s.playerCount; seat++) if (!s.eliminated[seat]) active.push(seat);
  return active;
}

function boardCleared(s: MinefieldState): boolean {
  return s.cells.every((c) => c.mine || c.revealed);
}

export function applyMinefieldAction(s: MinefieldState, seat: number, a: MinefieldAction): MfApplyResult {
  if (s.over) return { ok: false, error: 'The round is already over.' };
  if (seat < 0 || seat >= s.playerCount) return { ok: false, error: 'You are not playing this round.' };
  if (s.eliminated[seat]) return { ok: false, error: "You're out this round — a mine got you." };
  const { index } = a;
  if (!Number.isInteger(index) || index < 0 || index >= s.cells.length) {
    return { ok: false, error: 'That cell is outside the board.' };
  }
  const cell = s.cells[index]!;
  if (cell.revealed) return { ok: false, error: 'That cell is already revealed.' };

  const events: GameEvent[] = [];

  if (cell.mine) {
    cell.revealed = true;
    cell.owner = seat;
    s.eliminated[seat] = true;
    events.push({ t: 'explode', seat, index });

    // The round can never reach zero active seats through this path: it
    // already ends the instant exactly one remains, so a later elimination
    // attempt is rejected above (s.over guard) before it could zero out.
    const remaining = activeSeats(s);
    if (remaining.length === 1) {
      s.over = true;
      s.winnerSeats = remaining;
      events.push({ t: 'win', seat: remaining[0]!, by: 'lastStanding' });
    }
    return { ok: true, events };
  }

  const toReveal = floodFrom(index, s.cells, s.rows, s.cols);
  for (const i of toReveal) {
    s.cells[i]!.revealed = true;
    s.cells[i]!.owner = seat;
  }
  s.revealedCount[seat]! += toReveal.length;
  events.push({ t: 'reveal', seat, count: toReveal.length });

  if (boardCleared(s)) {
    s.over = true;
    s.winnerSeats = [seat];
    events.push({ t: 'win', seat, by: 'cleared' });
  }

  return { ok: true, events };
}

export { isNoGuessSolvable };

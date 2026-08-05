import {
  MINEFIELD_PRESETS,
  type MinefieldAction,
  type MinefieldSettings,
} from '@shared/minefield';
import { isNoGuessSolvable } from '@shared/minesweeperSolver';
import type { GameEvent } from '@shared/view';
import { mulberry32 } from '../../engine/rng';

/**
 * Minesweeper's independent-boards reducer. One mine layout is generated
 * per round (seeded, reused from the solo Minesweeper approach: safe-start
 * exclusion + BFS flood fill), and every player races their OWN reveal
 * progress against that SAME layout — a fair speedrun, not a shared board.
 * Mines are placed once at round start rather than deferred to a first
 * click — with several independent boards there's no single "first click"
 * moment to defer to, so the server instead auto-reveals a safe starting
 * patch identically for every player before anyone has acted.
 */

/** The mine layout — identical for every player's board this round. */
export interface MfCellLayout {
  mine: boolean;
  /** Meaningless when mine is true — neighboring mine count. */
  adjacent: number;
}

/** One player's independent progress against the shared layout. */
export interface MfPlayerBoard {
  seat: number;
  revealed: boolean[];
  revealedCount: number;
  minesHit: number;
  eliminated: boolean;
}

export interface MinefieldState {
  settings: MinefieldSettings;
  playerCount: number;
  round: number;
  rows: number;
  cols: number;
  mineCount: number;
  layout: MfCellLayout[];
  boards: MfPlayerBoard[];
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

function buildLayout(mines: Set<number>, rows: number, cols: number): MfCellLayout[] {
  const layout: MfCellLayout[] = Array.from({ length: rows * cols }, (_, i) => ({
    mine: mines.has(i),
    adjacent: 0,
  }));
  for (let i = 0; i < layout.length; i++) {
    if (layout[i]!.mine) continue;
    layout[i]!.adjacent = neighborsOf(i, rows, cols).filter((n) => layout[n]!.mine).length;
  }
  return layout;
}

/** BFS flood fill against the shared layout, bounded by one board's own
 *  `revealed` progress — reused both for the initial identical safe-start
 *  patch (an all-false revealed array) and every subsequent per-player
 *  reveal. */
function floodFrom(start: number, layout: MfCellLayout[], revealed: boolean[], rows: number, cols: number): number[] {
  const seen = new Set<number>();
  const queue = [start];
  const toReveal: number[] = [];
  while (queue.length > 0) {
    const i = queue.shift()!;
    if (seen.has(i)) continue;
    seen.add(i);
    if (revealed[i] || layout[i]!.mine) continue;
    toReveal.push(i);
    if (layout[i]!.adjacent === 0) {
      for (const n of neighborsOf(i, rows, cols)) {
        if (!seen.has(n) && !revealed[n] && !layout[n]!.mine) queue.push(n);
      }
    }
  }
  return toReveal;
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

  let layout: MfCellLayout[] | null = null;
  let startReveal: number[] = [];
  const attempts = settings.noGuess ? MAX_NOGUESS_ATTEMPTS : 1;
  for (let attempt = 0; attempt < attempts; attempt++) {
    const rng = mulberry32((seed + attempt * 0x9e3779b9) >>> 0);
    const mines = placeMines(rng, start, rows, cols, mineCount);
    const candidate = buildLayout(mines, rows, cols);
    const reveal = floodFrom(start, candidate, Array.from({ length: rows * cols }, () => false), rows, cols);
    if (!settings.noGuess || isNoGuessSolvable(candidate, rows, cols, mineCount, reveal)) {
      layout = candidate;
      startReveal = reveal;
      break;
    }
    // Last attempt still wins as a best-effort fallback if none solved cleanly.
    if (attempt === attempts - 1) {
      layout = candidate;
      startReveal = reveal;
    }
  }

  const boards: MfPlayerBoard[] = Array.from({ length: playerCount }, (_, seat) => {
    const revealed = Array.from({ length: rows * cols }, () => false);
    for (const i of startReveal) revealed[i] = true;
    return { seat, revealed, revealedCount: 0, minesHit: 0, eliminated: false };
  });

  return {
    settings: { ...settings },
    playerCount,
    round,
    rows,
    cols,
    mineCount,
    layout: layout!,
    boards,
    over: false,
    winnerSeats: null,
  };
}

// ── actions ─────────────────────────────────────────────────────────────────

function activeSeats(s: MinefieldState): number[] {
  const active: number[] = [];
  for (const b of s.boards) if (!b.eliminated) active.push(b.seat);
  return active;
}

function boardCleared(s: MinefieldState, board: MfPlayerBoard): boolean {
  return s.layout.every((c, i) => c.mine || board.revealed[i]);
}

export function applyMinefieldAction(s: MinefieldState, seat: number, a: MinefieldAction): MfApplyResult {
  if (s.over) return { ok: false, error: 'The round is already over.' };
  const board = s.boards[seat];
  if (!board) return { ok: false, error: 'You are not playing this round.' };
  if (board.eliminated) return { ok: false, error: "You're out this round — a mine got you." };
  const { index } = a;
  if (!Number.isInteger(index) || index < 0 || index >= s.layout.length) {
    return { ok: false, error: 'That cell is outside the board.' };
  }
  if (board.revealed[index]) return { ok: false, error: 'That cell is already revealed.' };

  const events: GameEvent[] = [];
  const cell = s.layout[index]!;

  if (cell.mine) {
    board.revealed[index] = true;
    board.minesHit += 1;
    events.push({ t: 'explode', seat, index });

    if (s.settings.eliminateOnMine) {
      board.eliminated = true;
      // The round can never reach zero active seats through this path: it
      // already ends the instant exactly one remains, so a later
      // elimination attempt is rejected above (s.over guard) before it
      // could zero out.
      const remaining = activeSeats(s);
      if (remaining.length === 1) {
        s.over = true;
        s.winnerSeats = remaining;
        events.push({ t: 'win', seat: remaining[0]!, by: 'lastStanding' });
      }
    }
    return { ok: true, events };
  }

  const toReveal = floodFrom(index, s.layout, board.revealed, s.rows, s.cols);
  for (const i of toReveal) board.revealed[i] = true;
  board.revealedCount += toReveal.length;
  events.push({ t: 'reveal', seat, count: toReveal.length });

  if (boardCleared(s, board)) {
    s.over = true;
    s.winnerSeats = [seat];
    events.push({ t: 'win', seat, by: 'cleared' });
  }

  return { ok: true, events };
}

export { isNoGuessSolvable };

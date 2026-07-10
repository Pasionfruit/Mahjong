import type { GameEvent } from '@shared/view';
import {
  LINES,
  type Cell,
  type Mark,
  type SmallResult,
  type UtttResult,
  type UtttSettings,
} from '@shared/uttt';

export interface UtttState {
  /** Nine small boards, each nine cells. */
  boards: Cell[][];
  boardResults: SmallResult[];
  activeBoard: number | null;
  turnSeat: number;
  /** The seat playing X (moves first); the other seat plays O. */
  xSeat: number;
  over: boolean;
  result: UtttResult | null;
  lastMove: { board: number; cell: number } | null;
  settings: UtttSettings;
}

export type ApplyResult = { ok: true; events: GameEvent[] } | { ok: false; error: string };

export function markOf(state: UtttState, seat: number): Mark {
  return seat === state.xSeat ? 'X' : 'O';
}

export function seatOfMark(state: UtttState, mark: Mark): number {
  return mark === 'X' ? state.xSeat : 1 - state.xSeat;
}

/** Winning mark of a nine-cell board, or null. */
function lineWinner(cells: readonly Cell[]): Mark | null {
  for (const [a, b, c] of LINES) {
    const v = cells[a];
    if (v && v === cells[b] && v === cells[c]) return v;
  }
  return null;
}

/** Winning meta-line of three board indices for a mark, or null. */
function metaLine(results: readonly SmallResult[], mark: Mark): [number, number, number] | null {
  for (const line of LINES) {
    if (line.every((i) => results[i] === mark)) return [line[0], line[1], line[2]];
  }
  return null;
}

export function newGame(firstSeat: number, settings: UtttSettings): UtttState {
  return {
    boards: Array.from({ length: 9 }, () => Array<Cell>(9).fill(null)),
    boardResults: Array<SmallResult>(9).fill(null),
    activeBoard: null,
    turnSeat: firstSeat,
    xSeat: firstSeat,
    over: false,
    result: null,
    lastMove: null,
    settings,
  };
}

/** Is placing in (board, cell) legal for the seat on the clock right now? */
export function isLegal(state: UtttState, board: number, cell: number): boolean {
  if (state.over) return false;
  if (board < 0 || board > 8 || cell < 0 || cell > 8) return false;
  if (state.activeBoard !== null && state.activeBoard !== board) return false;
  if (state.boardResults[board] !== null) return false;
  return state.boards[board]![cell] === null;
}

export function legalMoves(state: UtttState): { board: number; cell: number }[] {
  const out: { board: number; cell: number }[] = [];
  if (state.over) return out;
  const boards =
    state.activeBoard !== null && state.boardResults[state.activeBoard] === null
      ? [state.activeBoard]
      : state.boardResults.map((_, i) => i).filter((i) => state.boardResults[i] === null);
  for (const b of boards) {
    const cells = state.boards[b]!;
    for (let c = 0; c < 9; c++) if (cells[c] === null) out.push({ board: b, cell: c });
  }
  return out;
}

/** Apply a placement by `seat`. Mutates state; returns the events produced. */
export function place(state: UtttState, seat: number, board: number, cell: number): ApplyResult {
  if (state.over) return { ok: false, error: 'game is over' };
  if (seat !== state.turnSeat) return { ok: false, error: 'not your turn' };
  if (!isLegal(state, board, cell)) return { ok: false, error: 'illegal move' };

  const mark = markOf(state, seat);
  state.boards[board]![cell] = mark;
  state.lastMove = { board, cell };
  const events: GameEvent[] = [{ t: 'place', seat }];

  // Resolve the small board.
  if (state.boardResults[board] === null) {
    const w = lineWinner(state.boards[board]!);
    if (w) state.boardResults[board] = w;
    else if (state.boards[board]!.every((v) => v !== null)) state.boardResults[board] = 'draw';
  }

  // Resolve the meta-grid.
  const line = metaLine(state.boardResults, mark);
  if (line) {
    state.over = true;
    state.result = { winnerSeat: seat, line };
    events.push({ t: 'win', seat, by: 'discard' });
    return { ok: true, events };
  }
  if (state.boardResults.every((r) => r !== null)) {
    state.over = true;
    state.result = { winnerSeat: null };
    events.push({ t: 'wallExhausted' });
    return { ok: true, events };
  }

  // Send the opponent to the board named by this cell, unless it's decided.
  state.activeBoard = state.boardResults[cell] === null ? cell : null;
  state.turnSeat = 1 - seat;
  return { ok: true, events };
}

/** On a lapsed deadline, play a deterministic legal move for the seat on the clock. */
export function autoMove(state: UtttState): GameEvent[] {
  const moves = legalMoves(state);
  if (moves.length === 0) return [];
  const events: GameEvent[] = [{ t: 'timeout', seat: state.turnSeat }];
  const { board, cell } = moves[0]!;
  const res = place(state, state.turnSeat, board, cell);
  if (res.ok) events.push(...res.events);
  return events;
}

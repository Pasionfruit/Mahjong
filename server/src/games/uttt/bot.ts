import type { BotDifficulty } from '@shared/settings';
import type { UtttAction } from '@shared/protocol';
import { legalMoves, markOf, place, type UtttState } from './engine';

type Move = { board: number; cell: number };

function clone(s: UtttState): UtttState {
  return {
    ...s,
    boards: s.boards.map((b) => b.slice()),
    boardResults: s.boardResults.slice(),
    result: s.result ? { ...s.result } : null,
    lastMove: s.lastMove ? { ...s.lastMove } : null,
  };
}

function pick<T>(xs: T[]): T {
  return xs[Math.floor(Math.random() * xs.length)]!;
}

/** Could the seat now on the clock in `state` win the whole game this move? */
function moverCanWinGame(state: UtttState): boolean {
  const seat = state.turnSeat;
  for (const mv of legalMoves(state)) {
    const c = clone(state);
    place(c, seat, mv.board, mv.cell);
    if (c.over && c.result?.winnerSeat === seat) return true;
  }
  return false;
}

/**
 * Pick a move for a bot:
 *  - easy   plays a random legal move
 *  - medium grabs a game win, else prefers winning a small board and the centre
 *  - hard   also refuses to hand the opponent an immediate game-winning reply
 */
export function chooseUtttMove(
  state: UtttState,
  seat: number,
  difficulty: BotDifficulty,
): UtttAction {
  const moves = legalMoves(state);
  const move: Move = difficulty === 'easy' ? pick(moves) : best(state, seat, difficulty, moves);
  return { t: 'place', board: move.board, cell: move.cell };
}

function best(
  state: UtttState,
  seat: number,
  difficulty: BotDifficulty,
  moves: Move[],
): Move {
  const mark = markOf(state, seat);

  // Take an immediate game win outright.
  for (const mv of moves) {
    const c = clone(state);
    place(c, seat, mv.board, mv.cell);
    if (c.over && c.result?.winnerSeat === seat) return mv;
  }

  let top = -Infinity;
  let bestMoves: Move[] = [];
  for (const mv of moves) {
    const c = clone(state);
    place(c, seat, mv.board, mv.cell);
    let score = 0;
    if (c.boardResults[mv.board] === mark) score += 40; // captured a small board
    if (mv.cell === 4) score += 3; // centre cell
    if (mv.board === 4) score += 2; // centre board
    // Don't send the opponent somewhere they can win the game next.
    if (difficulty === 'hard' && !c.over && moverCanWinGame(c)) score -= 500;
    if (score > top) {
      top = score;
      bestMoves = [mv];
    } else if (score === top) {
      bestMoves.push(mv);
    }
  }
  return pick(bestMoves);
}

const DELAYS: Record<BotDifficulty, [number, number]> = {
  easy: [900, 800],
  medium: [700, 700],
  hard: [600, 600],
};

export function utttBotDelayMs(difficulty: BotDifficulty): number {
  const [base, spread] = DELAYS[difficulty];
  return Math.round(base + Math.random() * spread);
}

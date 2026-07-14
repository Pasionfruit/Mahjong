import { isMoveLegal, legalMoves, type Move, type QuoridorState } from '../engine';
import { easyMove } from './easy';
import { searchBestMove } from './search';

export type AiDifficulty = 'easy' | 'medium' | 'hard';

export const AI_NAMES: Record<AiDifficulty, string> = {
  easy: 'Easy Bot',
  medium: 'Medium Bot',
  hard: 'Hard Bot',
};

/** Think budgets (ms) per difficulty — hard stays comfortably under ~1s. */
export const AI_BUDGET_MS: Record<AiDifficulty, number> = {
  easy: 50,
  medium: 250,
  hard: 850,
};

/**
 * Pick a move for the side to move. Always returns a legal move: whatever a
 * difficulty proposes is re-validated, with the full legal move list as the
 * final safety net.
 */
export function chooseAiMove(
  s: QuoridorState,
  difficulty: AiDifficulty,
  recentKeys: number[] = [],
): Move {
  let move: Move | null = null;
  if (s.winner === null) {
    if (difficulty === 'easy') {
      move = easyMove(s);
    } else if (difficulty === 'medium') {
      // Shallow, wall-shy, noisy — and occasionally settles for second best.
      const res = searchBestMove(s, {
        maxDepth: 2,
        timeBudgetMs: AI_BUDGET_MS.medium,
        gateWalls: true,
        wallCap: 8,
        noise: 75,
        rng: Math.random,
        recentKeys,
      });
      move = res.move;
      const second = res.ranked[1];
      if (second && Math.random() < 0.12 && res.ranked[0]!.score - second.score <= 100) {
        move = second.move;
      }
    } else {
      move = searchBestMove(s, {
        maxDepth: 5,
        timeBudgetMs: AI_BUDGET_MS.hard,
        recentKeys,
      }).move;
    }
  }
  if (move && isMoveLegal(s, move)) return move;
  const all = legalMoves(s);
  if (all.length === 0) throw new Error('no legal moves for AI');
  return all[0]!;
}

/**
 * XP curve and daily-streak state machine — the two pieces of Brain
 * Arcade's meta-loop shared across every game (one XP ledger, one set of
 * per-game streaks). Pure and synchronous by design: the caller decides
 * when/whether to persist the result.
 */

/** Total XP required to REACH level n (n >= 1). Tunable constants, not
 *  an architecture decision — revisit the curve shape once real play data exists. */
export function xpForLevel(level: number): number {
  return Math.round(100 * Math.pow(Math.max(1, level), 1.5));
}

/** The level implied by a total XP amount. */
export function levelForXp(xpTotal: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xpTotal) level++;
  return level;
}

/** Progress toward the next level, for a progress bar. */
export function xpProgress(xpTotal: number): { level: number; into: number; span: number } {
  const level = levelForXp(xpTotal);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  return { level, into: xpTotal - floor, span: ceil - floor };
}

export interface StreakState {
  streak: number;
  /** Whether this streak's one grace day has already been spent. */
  graceUsed: boolean;
  lastPlayedDateKey: string | null;
}

export const EMPTY_STREAK: StreakState = { streak: 0, graceUsed: false, lastPlayedDateKey: null };

const DAY_MS = 86_400_000;

function daysBetween(earlier: string, later: string): number {
  return Math.round((Date.parse(`${later}T00:00:00Z`) - Date.parse(`${earlier}T00:00:00Z`)) / DAY_MS);
}

/**
 * Advance a daily-mode streak after completing today's puzzle. One missed
 * day is forgiven per streak (a "grace day," à la Duolingo's streak
 * freeze) — miss two days in a row, or use the grace twice, and the streak
 * resets to 1. Calling this twice for the same day is a no-op.
 */
export function nextStreakState(prev: StreakState, todayKey: string): StreakState {
  if (prev.lastPlayedDateKey === todayKey) return prev;
  if (prev.lastPlayedDateKey === null) {
    return { streak: 1, graceUsed: false, lastPlayedDateKey: todayKey };
  }
  const gap = daysBetween(prev.lastPlayedDateKey, todayKey);
  if (gap === 1) {
    return { streak: prev.streak + 1, graceUsed: prev.graceUsed, lastPlayedDateKey: todayKey };
  }
  if (gap === 2 && !prev.graceUsed) {
    return { streak: prev.streak + 1, graceUsed: true, lastPlayedDateKey: todayKey };
  }
  return { streak: 1, graceUsed: false, lastPlayedDateKey: todayKey };
}

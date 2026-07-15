import type { BotDifficulty } from '@shared/settings';
import {
  applyDotsEdge,
  cloneDots,
  completesBox,
  createsThirdSide,
  undrawnEdges,
  type DotsState,
  type Edge,
} from './engine';

/**
 * Dots and Boxes bots.
 *  - easy: mostly random; often blind to free boxes and safe play.
 *  - medium: takes every free box, never opens a chain while a safe edge exists.
 *  - hard: medium plus endgame chain craft — sacrifices the smallest chain and
 *    plays the classic double-cross (leaves the last two boxes of a chain to
 *    keep the opponent on the hook).
 */

const pick = <T>(arr: T[], rng: () => number): T => arr[(rng() * arr.length) | 0]!;

function completions(s: DotsState): Edge[] {
  return undrawnEdges(s).filter((e) => completesBox(s, e));
}

function safeEdges(s: DotsState): Edge[] {
  return undrawnEdges(s).filter((e) => !completesBox(s, e) && !createsThirdSide(s, e));
}

/**
 * How many boxes a greedy opponent reaps immediately after we draw `e`
 * (they take every completion, then stop at their first non-taking move).
 */
export function greedyGiveaway(s: DotsState, e: Edge): number {
  const sim = cloneDots(s);
  sim.over = false;
  const mover = sim.turnSeat;
  applyDotsEdge(sim, mover, e);
  if (sim.turnSeat === mover) return 0; // we completed something ourselves
  const opp = sim.turnSeat;
  let gained = 0;
  for (;;) {
    const take = completions(sim).find(() => true);
    if (!take || sim.over) break;
    const before = sim.scores[opp]!;
    applyDotsEdge(sim, opp, take);
    gained += sim.scores[opp]! - before;
    if (sim.turnSeat !== opp) break; // paranoia: greedy always keeps the turn
  }
  return gained;
}

/** The chain run available to the mover right now, eaten greedily. */
function currentRunLength(s: DotsState): number {
  const sim = cloneDots(s);
  const mover = sim.turnSeat;
  let run = 0;
  for (;;) {
    const take = completions(sim).find(() => true);
    if (!take || sim.over) break;
    const before = sim.scores[mover]!;
    applyDotsEdge(sim, mover, take);
    run += sim.scores[mover]! - before;
    if (sim.turnSeat !== mover) break;
  }
  return run;
}

/** After greedily eating the current run, does a safe edge remain? */
function safeAfterRun(s: DotsState): boolean {
  const sim = cloneDots(s);
  const mover = sim.turnSeat;
  for (;;) {
    const take = completions(sim).find(() => true);
    if (!take || sim.over) break;
    applyDotsEdge(sim, mover, take);
    if (sim.turnSeat !== mover) break;
  }
  return !sim.over && safeEdges(sim).length > 0;
}

/**
 * The double-cross move: decline the 2-box run by drawing the edge that leaves
 * both boxes takeable in one stroke for the opponent — who is then forced to
 * open the next chain for us. Returns null when no such edge exists.
 */
function doubleCrossEdge(s: DotsState): Edge | null {
  for (const e of undrawnEdges(s)) {
    if (completesBox(s, e)) continue;
    if (greedyGiveaway(s, e) === 2) return e;
  }
  return null;
}

function sacrifice(s: DotsState, rng: () => number): Edge {
  const candidates = undrawnEdges(s).filter((e) => !completesBox(s, e));
  const pool = candidates.length > 0 ? candidates : undrawnEdges(s);
  let best: Edge[] = [];
  let bestCost = Infinity;
  for (const e of pool) {
    const cost = greedyGiveaway(s, e);
    if (cost < bestCost) {
      bestCost = cost;
      best = [e];
    } else if (cost === bestCost) {
      best.push(e);
    }
  }
  return pick(best, rng);
}

export function chooseDotsMove(
  s: DotsState,
  difficulty: BotDifficulty,
  rng: () => number = Math.random,
): Edge {
  const all = undrawnEdges(s);
  const free = completions(s);
  const safe = safeEdges(s);

  if (difficulty === 'easy') {
    // Careless: usually random, sometimes spots a free box.
    if (free.length > 0 && rng() < 0.4) return pick(free, rng);
    return pick(all, rng);
  }

  if (difficulty === 'medium') {
    if (free.length > 0) return pick(free, rng);
    if (safe.length > 0) return pick(safe, rng);
    return sacrifice(s, rng);
  }

  // hard
  if (free.length > 0) {
    // Take everything while it stays safe to do so.
    if (safeAfterRun(s)) return free[0]!;
    // Endgame: if this run finishes the board, just eat it.
    const run = currentRunLength(s);
    if (s.claimed + run >= s.size * s.size) return free[0]!;
    // All-but-two: hand back a 2-run to keep control of the next chain.
    if (run === 2) {
      const dc = doubleCrossEdge(s);
      if (dc) return dc;
    }
    return free[0]!;
  }
  if (safe.length > 0) return pick(safe, rng);
  return sacrifice(s, rng);
}

export function dotsBotDelayMs(difficulty: BotDifficulty): number {
  return difficulty === 'easy' ? 900 : difficulty === 'medium' ? 700 : 550;
}

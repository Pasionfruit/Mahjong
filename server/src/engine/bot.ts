import type { PlayerAction } from '@shared/protocol';
import { pairsToWin, type BotDifficulty } from '@shared/settings';
import {
  STANDARD_KINDS,
  isSuited,
  rankOf,
  suitOf,
  suitedKind,
  type Tile,
  type TileKind,
} from '@shared/tiles';
import { addedKongOptions, concealedKongOptions, type GameState } from './game';
import { countsOf, isWinningHand, type Counts } from './win';

/**
 * Bot decision-making, one function per phase:
 *  - easy   discards at random and never claims (except a win)
 *  - medium keeps pairs/neighbors, claims pongs/kongs freely, chows with spare tiles
 *  - hard   searches every discard/claim for the best resulting hand potential
 * All difficulties always take a win, self-drawn or claimed.
 */

const DELAYS: Record<BotDifficulty, { turn: [number, number]; claim: [number, number] }> = {
  easy: { turn: [1200, 800], claim: [2400, 800] },
  medium: { turn: [900, 700], claim: [1800, 700] },
  hard: { turn: [700, 600], claim: [1300, 500] },
};

/** Claims are slower than turns so humans get a fair shot at the click race. */
export function botDelayMs(difficulty: BotDifficulty, kind: 'turn' | 'claim'): number {
  const [base, spread] = DELAYS[difficulty][kind];
  return Math.round(base + Math.random() * spread);
}

export function chooseTurnAction(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty,
): PlayerAction {
  const p = state.players[seat]!;
  const kinds = p.hand.map((t) => t.kind);
  if (isWinningHand(kinds, p.melds.length, state.setsToWin)) return { t: 'winSelfDraw' };

  if (difficulty !== 'easy') {
    const kongKind = concealedKongOptions(state, seat).find(
      (kind) => difficulty === 'medium' || kongIsSafe(kinds, kind),
    );
    if (kongKind) return { t: 'concealedKong', kind: kongKind };
    for (const tileId of addedKongOptions(state, seat)) {
      const kind = p.hand.find((t) => t.id === tileId)!.kind;
      if (difficulty === 'medium' || kongIsSafe(kinds, kind)) {
        return { t: 'addedKong', tileId };
      }
    }
  }

  return { t: 'discard', tileId: chooseDiscard(p.hand, p.melds.length, state.setsToWin, difficulty) };
}

export function chooseClaimAction(
  state: GameState,
  seat: number,
  difficulty: BotDifficulty,
): PlayerAction {
  const phase = state.phase;
  if (phase.t !== 'claimWindow') return { t: 'pass' };
  const opts = phase.eligible.get(seat);
  if (!opts) return { t: 'pass' };
  if (opts.win) return { t: 'claim', claim: 'win' };
  if (difficulty === 'easy') return { t: 'pass' };

  const p = state.players[seat]!;
  const kinds = p.hand.map((t) => t.kind);
  const tileKind = phase.tile.kind;

  if (difficulty === 'medium') {
    if (opts.kong && state.wall.length > 0) return { t: 'claim', claim: 'kong' };
    if (opts.pong) return { t: 'claim', claim: 'pong' };
    // Chow only with tiles that are not part of a pair or triplet.
    const spare = opts.chows.find((pair) =>
      pair.every((t) => kinds.filter((k) => k === t.kind).length === 1),
    );
    if (spare) return { t: 'claim', claim: 'chow', tileIds: [spare[0].id, spare[1].id] };
    return { t: 'pass' };
  }

  // hard: claim only when the resulting hand beats keeping the current one
  const current = handPotential(kinds, p.melds.length, state.setsToWin);
  const candidates: { action: PlayerAction; score: number }[] = [];

  if (opts.kong && state.wall.length > 0) {
    const rest = removeKinds(kinds, [tileKind, tileKind, tileKind]);
    // +1: a kong comes with a replacement draw
    candidates.push({
      action: { t: 'claim', claim: 'kong' },
      score: handPotential(rest, p.melds.length + 1, state.setsToWin) + 1,
    });
  }
  if (opts.pong) {
    const rest = removeKinds(kinds, [tileKind, tileKind]);
    candidates.push({
      action: { t: 'claim', claim: 'pong' },
      score: handPotential(rest, p.melds.length + 1, state.setsToWin),
    });
  }
  for (const pair of opts.chows) {
    const rest = removeKinds(kinds, [pair[0].kind, pair[1].kind]);
    candidates.push({
      action: { t: 'claim', claim: 'chow', tileIds: [pair[0].id, pair[1].id] },
      score: handPotential(rest, p.melds.length + 1, state.setsToWin),
    });
  }

  let best: { action: PlayerAction; score: number } | null = null;
  for (const c of candidates) {
    if (!best || c.score > best.score) best = c;
  }
  return best && best.score > current ? best.action : { t: 'pass' };
}

/** A kong is safe to declare when its tiles have no same-suit neighbors to run with. */
function kongIsSafe(kinds: TileKind[], kong: TileKind): boolean {
  if (!isSuited(kong)) return true;
  const suit = suitOf(kong);
  const r = rankOf(kong);
  return !kinds.some(
    (k) => isSuited(k) && k !== kong && suitOf(k) === suit && Math.abs(rankOf(k) - r) <= 2,
  );
}

function chooseDiscard(
  hand: Tile[],
  meldCount: number,
  setsToWin: number,
  difficulty: BotDifficulty,
): number {
  if (difficulty === 'easy') {
    return hand[Math.floor(Math.random() * hand.length)]!.id;
  }
  const kinds = hand.map((t) => t.kind);

  if (difficulty === 'medium') {
    let worst = hand[0]!;
    let worstScore = Infinity;
    for (const t of hand) {
      const s = tileUsefulness(kinds, t.kind);
      if (s < worstScore) {
        worst = t;
        worstScore = s;
      }
    }
    return worst.id;
  }

  // hard: try each distinct discard, keep the hand with the highest potential;
  // ties break toward shedding the least useful tile
  let bestId = hand[0]!.id;
  let bestScore = -Infinity;
  const seen = new Set<TileKind>();
  for (const t of hand) {
    if (seen.has(t.kind)) continue;
    seen.add(t.kind);
    const rest = kinds.slice();
    rest.splice(rest.indexOf(t.kind), 1);
    const s =
      handPotential(rest, meldCount, setsToWin) - tileUsefulness(kinds, t.kind) / 100;
    if (s > bestScore) {
      bestScore = s;
      bestId = t.id;
    }
  }
  return bestId;
}

/** Cheap local heuristic: pairs/triplets and same-suit neighbors make a tile worth keeping. */
function tileUsefulness(kinds: TileKind[], kind: TileKind): number {
  const counts = countsOf(kinds);
  const n = counts.get(kind) ?? 0;
  let score = n >= 3 ? 10 : n === 2 ? 6 : 0;
  if (isSuited(kind)) {
    const suit = suitOf(kind);
    const r = rankOf(kind);
    const has = (rr: number) => rr >= 1 && rr <= 9 && (counts.get(suitedKind(suit, rr)) ?? 0) > 0;
    if (has(r - 1)) score += 3;
    if (has(r + 1)) score += 3;
    if (has(r - 2)) score += 1;
    if (has(r + 2)) score += 1;
    if (r === 1 || r === 9) score -= 1;
  } else if (n === 1) {
    score -= 2; // a lone honor is dead weight
  }
  return score;
}

function removeKinds(kinds: TileKind[], remove: TileKind[]): TileKind[] {
  const rest = kinds.slice();
  for (const k of remove) {
    const i = rest.indexOf(k);
    if (i !== -1) rest.splice(i, 1);
  }
  return rest;
}

/**
 * How close a hand is to winning, roughly: each meld/set is worth 10, partial
 * sets 4, the eye pair 3. Considers both the standard and the pairs-mode goal.
 */
export function handPotential(kinds: TileKind[], meldCount: number, setsToWin: number): number {
  const counts = countsOf(kinds);
  let best = meldCount * 10 + bestStandardScore(counts, Math.max(setsToWin - meldCount, 0));
  if (meldCount <= 1) {
    let pairs = 0;
    for (const n of counts.values()) pairs += Math.floor(n / 2);
    best = Math.max(best, meldCount * 10 + Math.min(pairs, pairsToWin(setsToWin)) * 5);
  }
  return best;
}

/**
 * Best decomposition of concealed tiles into sets, partial sets, and pairs.
 * Walks kinds in canonical order; at each kind enumerates every way its copies
 * can serve (triplet, pair, runs, partial runs) and advances. A node budget
 * caps pathological hands — the search then returns the best found so far.
 */
function bestStandardScore(counts: Counts, maxSets: number): number {
  let best = 0;
  let nodes = 0;

  const leaf = (sets: number, partials: number, pairs: number): void => {
    const fullSets = Math.min(sets, maxSets);
    let score = fullSets * 10;
    const slots = Math.max(maxSets - fullSets, 0);
    score += Math.min(partials + pairs, slots) * 4;
    if (pairs > 0) score += 3; // the eye pair
    if (score > best) best = score;
  };

  const walk = (idx: number, sets: number, partials: number, pairs: number): void => {
    if (++nodes > 20_000) return;
    while (idx < STANDARD_KINDS.length && !(counts.get(STANDARD_KINDS[idx]!) ?? 0)) idx++;
    if (idx >= STANDARD_KINDS.length) return leaf(sets, partials, pairs);

    const kind = STANDARD_KINDS[idx]!;
    const n = counts.get(kind)!;
    let k1: TileKind | null = null;
    let k2: TileKind | null = null;
    if (isSuited(kind)) {
      const suit = suitOf(kind);
      const r = rankOf(kind);
      if (r <= 8) k1 = suitedKind(suit, r + 1);
      if (r <= 7) k2 = suitedKind(suit, r + 2);
    }
    const n1 = k1 ? (counts.get(k1) ?? 0) : 0;
    const n2 = k2 ? (counts.get(k2) ?? 0) : 0;

    // t: triplet, p: pair, r: full runs, a: adjacent partial, g: gap partial
    for (let t = 0; t <= (n >= 3 ? 1 : 0); t++) {
      const afterT = n - 3 * t;
      for (let p = 0; p <= (afterT >= 2 ? 1 : 0); p++) {
        const afterP = afterT - 2 * p;
        const maxR = Math.min(afterP, n1, n2, 2);
        for (let r = 0; r <= maxR; r++) {
          const maxA = Math.min(afterP - r, n1 - r, 1);
          for (let a = 0; a <= maxA; a++) {
            const maxG = Math.min(afterP - r - a, n2 - r, 1);
            for (let g = 0; g <= maxG; g++) {
              counts.set(kind, 0); // leftovers are floaters
              if (k1) counts.set(k1, n1 - r - a);
              if (k2) counts.set(k2, n2 - r - g);
              walk(idx + 1, sets + t + r, partials + a + g, pairs + p);
              counts.set(kind, n);
              if (k1) counts.set(k1, n1);
              if (k2) counts.set(k2, n2);
            }
          }
        }
      }
    }
  };

  walk(0, 0, 0, 0);
  return best;
}

import {
  STANDARD_KINDS,
  isSuited,
  rankOf,
  suitOf,
  suitedKind,
  type TileKind,
} from '@shared/tiles';
import { pairsToWin } from '@shared/settings';

export type Counts = Map<TileKind, number>;

export function countsOf(kinds: TileKind[]): Counts {
  const c = new Map<TileKind, number>();
  for (const k of kinds) c.set(k, (c.get(k) ?? 0) + 1);
  return c;
}

/**
 * Is `handKinds` (concealed tiles including the winning tile) a winning hand?
 * Every exposed meld (pong/chow/kong) counts as exactly one set.
 * Standard win: N sets + 1 pair. Pairs win: (N+2) pairs + 1 set,
 * where at most one of those sets may be an exposed meld.
 */
export function isWinningHand(
  handKinds: TileKind[],
  exposedMelds: number,
  setsToWin: number,
): boolean {
  const counts = countsOf(handKinds);
  return (
    standardWin(counts, handKinds.length, setsToWin - exposedMelds) ||
    pairsWin(counts, handKinds.length, pairsToWin(setsToWin), exposedMelds)
  );
}

/** k concealed sets + 1 pair from exactly 3k+2 tiles. */
function standardWin(counts: Counts, total: number, k: number): boolean {
  if (k < 0 || total !== 3 * k + 2) return false;
  for (const [kind, n] of counts) {
    if (n < 2) continue;
    counts.set(kind, n - 2);
    const ok = decompose(counts, k);
    counts.set(kind, n);
    if (ok) return true;
  }
  return false;
}

/**
 * Can `counts` be fully consumed by exactly k triplets/runs?
 * Always resolves the lowest remaining kind first, so branching is at most
 * two ways per level — effectively instant for hands of ≤ 17 tiles.
 */
function decompose(counts: Counts, k: number): boolean {
  let kind: TileKind | undefined;
  for (const cand of STANDARD_KINDS) {
    if ((counts.get(cand) ?? 0) > 0) {
      kind = cand;
      break;
    }
  }
  if (k === 0) return kind === undefined;
  if (kind === undefined) return false;

  const n = counts.get(kind)!;
  if (n >= 3) {
    counts.set(kind, n - 3);
    const ok = decompose(counts, k - 1);
    counts.set(kind, n);
    if (ok) return true;
  }
  if (isSuited(kind) && rankOf(kind) <= 7) {
    const suit = suitOf(kind);
    const r = rankOf(kind);
    const k2 = suitedKind(suit, r + 1);
    const k3 = suitedKind(suit, r + 2);
    const n2 = counts.get(k2) ?? 0;
    const n3 = counts.get(k3) ?? 0;
    if (n2 > 0 && n3 > 0) {
      counts.set(kind, n - 1);
      counts.set(k2, n2 - 1);
      counts.set(k3, n3 - 1);
      const ok = decompose(counts, k - 1);
      counts.set(kind, n);
      counts.set(k2, n2);
      counts.set(k3, n3);
      if (ok) return true;
    }
  }
  return false;
}

/**
 * M pairs + 1 set. A concealed 4-of-a-kind counts as two pairs.
 * With one exposed meld (the set), the concealed tiles must be exactly M pairs;
 * with none, one concealed set (triplet or run) is removed and the rest must pair up.
 */
function pairsWin(counts: Counts, total: number, m: number, exposedMelds: number): boolean {
  if (exposedMelds >= 2) return false;
  if (exposedMelds === 1) {
    return total === 2 * m && allEven(counts);
  }
  if (total !== 2 * m + 3) return false;
  for (const [kind, n] of [...counts.entries()]) {
    if (n >= 3) {
      counts.set(kind, n - 3);
      const ok = allEven(counts);
      counts.set(kind, n);
      if (ok) return true;
    }
    if (n > 0 && isSuited(kind) && rankOf(kind) <= 7) {
      const suit = suitOf(kind);
      const r = rankOf(kind);
      const k2 = suitedKind(suit, r + 1);
      const k3 = suitedKind(suit, r + 2);
      const n2 = counts.get(k2) ?? 0;
      const n3 = counts.get(k3) ?? 0;
      if (n2 > 0 && n3 > 0) {
        counts.set(kind, n - 1);
        counts.set(k2, n2 - 1);
        counts.set(k3, n3 - 1);
        const ok = allEven(counts);
        counts.set(kind, n);
        counts.set(k2, n2);
        counts.set(k3, n3);
        if (ok) return true;
      }
    }
  }
  return false;
}

function allEven(counts: Counts): boolean {
  for (const n of counts.values()) {
    if (n % 2 !== 0) return false;
  }
  return true;
}

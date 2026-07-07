import {
  isSuited,
  rankOf,
  suitOf,
  suitedKind,
  type Tile,
  type TileKind,
} from '@shared/tiles';
import type { Meld } from '@shared/view';

export function tilesOfKind(tiles: Tile[], kind: TileKind): Tile[] {
  return tiles.filter((t) => t.kind === kind);
}

/** Pong on a discard: needs 2 matching tiles in hand. */
export function canPong(hand: Tile[], kind: TileKind): boolean {
  return tilesOfKind(hand, kind).length >= 2;
}

/** Exposed kong on a discard: needs 3 matching tiles in hand. */
export function canKongFromHand(hand: Tile[], kind: TileKind): boolean {
  return tilesOfKind(hand, kind).length >= 3;
}

/**
 * All distinct runs the discarded `kind` completes with two hand tiles.
 * Each option is the pair of hand tiles to expose alongside the discard.
 */
export function chowOptions(hand: Tile[], kind: TileKind): [Tile, Tile][] {
  if (!isSuited(kind)) return [];
  const suit = suitOf(kind);
  const r = rankOf(kind);
  const options: [Tile, Tile][] = [];
  const patterns: [number, number][] = [
    [r - 2, r - 1],
    [r - 1, r + 1],
    [r + 1, r + 2],
  ];
  for (const [a, b] of patterns) {
    if (a < 1 || b > 9) continue;
    const ta = hand.find((t) => t.kind === suitedKind(suit, a));
    const tb = hand.find((t) => t.kind === suitedKind(suit, b));
    if (ta && tb) options.push([ta, tb]);
  }
  return options;
}

/** Kinds the player holds all 4 of (concealed kong available on their turn). */
export function concealedKongKinds(hand: Tile[]): TileKind[] {
  const counts = new Map<TileKind, number>();
  for (const t of hand) counts.set(t.kind, (counts.get(t.kind) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 4).map(([kind]) => kind);
}

/** Hand tile ids that would upgrade one of the player's exposed pongs to a kong. */
export function addedKongTileIds(hand: Tile[], melds: Meld[]): number[] {
  const pongKinds = new Set(
    melds.filter((m) => m.type === 'pong').map((m) => m.tiles[0]!.kind),
  );
  return hand.filter((t) => pongKinds.has(t.kind)).map((t) => t.id);
}

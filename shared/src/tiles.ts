// Tile kinds: 'd1'-'d9' dots, 'b1'-'b9' bamboo, 'c1'-'c9' characters,
// 'wE','wS','wW','wN' winds, 'gR','gG','gW' dragons, 'f1'-'f8' flowers.

export const SUITS = ['d', 'b', 'c'] as const;
export type Suit = (typeof SUITS)[number];

export type Rank = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
export const RANKS: Rank[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export const WIND_KINDS = ['wE', 'wS', 'wW', 'wN'] as const;
export const DRAGON_KINDS = ['gR', 'gG', 'gW'] as const;
export const FLOWER_KINDS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8'] as const;

export type SuitedKind = `${Suit}${Rank}`;
export type WindKind = (typeof WIND_KINDS)[number];
export type DragonKind = (typeof DRAGON_KINDS)[number];
export type HonorKind = WindKind | DragonKind;
export type FlowerKind = (typeof FLOWER_KINDS)[number];
export type TileKind = SuitedKind | HonorKind | FlowerKind;

/** A physical tile: `kind` is what's printed on it, `id` uniquely identifies it in a game. */
export interface Tile {
  id: number;
  kind: TileKind;
}

export const SUITED_KINDS: SuitedKind[] = SUITS.flatMap((s) =>
  RANKS.map((r) => `${s}${r}` as SuitedKind),
);

/** The 34 non-flower kinds, in canonical sort order. */
export const STANDARD_KINDS: TileKind[] = [...SUITED_KINDS, ...WIND_KINDS, ...DRAGON_KINDS];

export function isFlower(kind: TileKind): kind is FlowerKind {
  return kind[0] === 'f';
}

export function isSuited(kind: TileKind): kind is SuitedKind {
  return kind[0] === 'd' || kind[0] === 'b' || kind[0] === 'c';
}

export function isHonor(kind: TileKind): kind is HonorKind {
  return kind[0] === 'w' || kind[0] === 'g';
}

export function suitOf(kind: SuitedKind): Suit {
  return kind[0] as Suit;
}

export function rankOf(kind: SuitedKind): Rank {
  return Number(kind[1]) as Rank;
}

export function suitedKind(suit: Suit, rank: number): SuitedKind {
  return `${suit}${rank}` as SuitedKind;
}

const KIND_ORDER: Record<string, number> = Object.fromEntries(
  [...STANDARD_KINDS, ...FLOWER_KINDS].map((k, i) => [k, i]),
);

export function sortKey(kind: TileKind): number {
  return KIND_ORDER[kind] ?? 999;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  return [...tiles].sort((a, b) => sortKey(a.kind) - sortKey(b.kind) || a.id - b.id);
}

import { FLOWER_KINDS, STANDARD_KINDS, SUITED_KINDS, type Tile } from '@shared/tiles';
import { mulberry32 } from './rng';

/**
 * 4 of each tile kind. Honors (winds/dragons) are included only when
 * `includeHonors` is set, and the 8 flowers only when `includeFlowers` is.
 */
export function buildTileSet(includeFlowers: boolean, includeHonors = true): Tile[] {
  const tiles: Tile[] = [];
  let id = 0;
  const kinds = includeHonors ? STANDARD_KINDS : SUITED_KINDS;
  for (const kind of kinds) {
    for (let i = 0; i < 4; i++) tiles.push({ id: id++, kind });
  }
  if (includeFlowers) {
    for (const kind of FLOWER_KINDS) tiles.push({ id: id++, kind });
  }
  return tiles;
}

export function shuffledWall(includeFlowers: boolean, seed: number, includeHonors = true): Tile[] {
  const tiles = buildTileSet(includeFlowers, includeHonors);
  const rand = mulberry32(seed);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  return tiles;
}

/** Normal turn draws come from the front of the wall. */
export function drawFront(wall: Tile[]): Tile | null {
  return wall.shift() ?? null;
}

/** Kong and flower replacement draws come from the back of the wall. */
export function drawBack(wall: Tile[]): Tile | null {
  return wall.pop() ?? null;
}

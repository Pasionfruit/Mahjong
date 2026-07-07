import { describe, expect, it } from 'vitest';
import { buildTileSet, drawBack, drawFront, shuffledWall } from './wall';
import { isFlower } from '@shared/tiles';

describe('wall', () => {
  it('builds 136 tiles without flowers, 144 with', () => {
    expect(buildTileSet(false)).toHaveLength(136);
    expect(buildTileSet(true)).toHaveLength(144);
  });

  it('drops winds and dragons when honors are excluded', () => {
    const suitsOnly = buildTileSet(false, false);
    expect(suitsOnly).toHaveLength(108); // 27 suited kinds x 4
    expect(suitsOnly.every((t) => 'dbc'.includes(t.kind[0]!))).toBe(true);
    expect(buildTileSet(true, false)).toHaveLength(116); // + 8 flowers
  });

  it('has exactly 4 of each standard kind and unique ids', () => {
    const tiles = buildTileSet(true);
    const byKind = new Map<string, number>();
    for (const t of tiles) byKind.set(t.kind, (byKind.get(t.kind) ?? 0) + 1);
    for (const [kind, n] of byKind) {
      expect(n, kind).toBe(isFlower(kind as never) ? 1 : 4);
    }
    expect(new Set(tiles.map((t) => t.id)).size).toBe(tiles.length);
  });

  it('shuffles deterministically per seed', () => {
    const a = shuffledWall(false, 42).map((t) => t.id);
    const b = shuffledWall(false, 42).map((t) => t.id);
    const c = shuffledWall(false, 43).map((t) => t.id);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it('draws from front and back independently', () => {
    const wall = shuffledWall(false, 1);
    const first = wall[0]!;
    const last = wall[wall.length - 1]!;
    expect(drawFront(wall)).toEqual(first);
    expect(drawBack(wall)).toEqual(last);
    expect(wall).toHaveLength(134);
  });
});

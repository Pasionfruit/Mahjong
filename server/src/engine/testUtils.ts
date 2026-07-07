import type { Tile, TileKind } from '@shared/tiles';
import type { GameSettings } from '@shared/settings';

/**
 * Compact tile-kind notation for tests:
 *   'd123 b55 c999' — suit letter followed by one digit per tile
 *   'wE wS gRx3'    — honor kinds, with an optional xN repeat suffix
 */
export function k(spec: string): TileKind[] {
  const out: TileKind[] = [];
  for (const token of spec.split(/\s+/).filter(Boolean)) {
    const c = token[0]!;
    if (c === 'd' || c === 'b' || c === 'c' || c === 'f') {
      for (const digit of token.slice(1)) out.push(`${c}${digit}` as TileKind);
    } else {
      const m = token.match(/^([wg][A-Z])(?:x(\d+))?$/);
      if (!m) throw new Error(`bad tile token: ${token}`);
      const count = m[2] ? Number(m[2]) : 1;
      for (let i = 0; i < count; i++) out.push(m[1] as TileKind);
    }
  }
  return out;
}

let nextId = 100_000;

/** Materialize kinds as physical tiles with unique ids. */
export function tiles(spec: string): Tile[] {
  return k(spec).map((kind) => ({ id: nextId++, kind }));
}

export function testSettings(overrides?: Partial<GameSettings>): GameSettings {
  return {
    includeFlowers: false,
    includeHonors: true,
    turnTimerSeconds: 0,
    openHands: false,
    setsToWin: 3,
    theme: 'jade',
    ...overrides,
  };
}

/**
 * Build a wall for startRoundWithWall with known outcomes.
 * Deal is block-wise from the front in seat order starting at the dealer;
 * `fronts` are the turn draws after the deal, `backs` the replacement draws
 * (kong/flower) in the order they will happen.
 */
export function rigWall(opts: {
  playerCount: number;
  dealer?: number;
  hands: string[];
  fronts?: string;
  backs?: string;
  filler?: string;
}): Tile[] {
  const dealer = opts.dealer ?? 0;
  const wall: Tile[] = [];
  for (let i = 0; i < opts.playerCount; i++) {
    const seat = (dealer + i) % opts.playerCount;
    wall.push(...tiles(opts.hands[seat]!));
  }
  wall.push(...tiles(opts.fronts ?? ''));
  wall.push(...tiles(opts.filler ?? ''));
  wall.push(...tiles(opts.backs ?? '').reverse());
  return wall;
}

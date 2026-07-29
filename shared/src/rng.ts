/**
 * Deterministic PRNG (mulberry32). Returns floats in [0, 1). Duplicated from
 * server/src/engine/rng.ts on purpose: this module is imported by both the
 * client and server workspaces, and the server's copy is tested/proven
 * against the mahjong wall shuffle — no reason to couple that to an
 * unrelated feature by refactoring it to live here instead.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * FNV-1a hash of `gameId:dateKeyUTC:salt` into a 32-bit seed — the same
 * puzzle for every player on a given UTC calendar day. `salt` lets a broken
 * daily (unsolvable board, bugged word) be invalidated by bumping it for
 * that date alone, with no data migration.
 */
export function dailySeed(gameId: string, dateKeyUTC: string, salt = 'v1'): number {
  const s = `${gameId}:${dateKeyUTC}:${salt}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** A ready-to-use seeded RNG for a game's daily puzzle. */
export function dailyRng(gameId: string, dateKeyUTC: string, salt = 'v1'): () => number {
  return mulberry32(dailySeed(gameId, dateKeyUTC, salt));
}

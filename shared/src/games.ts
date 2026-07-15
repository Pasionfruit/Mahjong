/**
 * Games the server can actually host. The client's dashboard may advertise more
 * as "coming soon", but only these ids may be created or joined.
 */
export const GAME_IDS = ['mahjong', 'uttt', 'bomberman', 'art', 'tetris', 'dots'] as const;
export type GameId = (typeof GAME_IDS)[number];

export function isGameId(x: unknown): x is GameId {
  return typeof x === 'string' && (GAME_IDS as readonly string[]).includes(x);
}

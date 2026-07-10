import type { GameId } from '@shared/games';
import type { GameModule } from './GameModule';
import { mahjongModule } from './mahjong';

/** Every game the server can host, keyed by its id. Add new games here. */
export const MODULES: Record<GameId, GameModule> = {
  mahjong: mahjongModule,
};

export function getModule(gameId: GameId): GameModule {
  return MODULES[gameId];
}

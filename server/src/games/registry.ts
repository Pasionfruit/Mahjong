import type { GameId } from '@shared/games';
import type { GameModule } from './GameModule';
import { mahjongModule } from './mahjong';
import { utttModule } from './uttt';

/** Every game the server can host, keyed by its id. Add new games here. */
export const MODULES: Record<GameId, GameModule> = {
  mahjong: mahjongModule,
  uttt: utttModule,
};

export function getModule(gameId: GameId): GameModule {
  return MODULES[gameId];
}

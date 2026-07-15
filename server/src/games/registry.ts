import type { GameId } from '@shared/games';
import type { GameModule } from './GameModule';
import { mahjongModule } from './mahjong';
import { utttModule } from './uttt';
import { bombermanModule } from './bomberman';
import { artModule } from './art';
import { tetrisModule } from './tetris';
import { dotsModule } from './dots';
import { sumoModule } from './sumo';

/** Every game the server can host, keyed by its id. Add new games here. */
export const MODULES: Record<GameId, GameModule> = {
  mahjong: mahjongModule,
  uttt: utttModule,
  bomberman: bombermanModule,
  art: artModule,
  tetris: tetrisModule,
  dots: dotsModule,
  sumo: sumoModule,
};

export function getModule(gameId: GameId): GameModule {
  return MODULES[gameId];
}

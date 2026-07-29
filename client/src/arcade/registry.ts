import type { SoloGameModule } from './types';
import { wordGuessModule } from '../games/wordguess/engine';
import { minesweeperModule } from '../games/minesweeper/engine';
import { twenty48Module } from '../games/twenty48/engine';

/**
 * id -> SoloGameModule, the client-only analogue of
 * server/src/games/registry.ts. The pipeline itself (auth, save, sync, RLS,
 * offline queue) was proven end-to-end against a live Supabase project by a
 * throwaway "Coin Call" probe game, since removed.
 */
export const SOLO_MODULES: Record<string, SoloGameModule<unknown, unknown, unknown>> = {
  wordguess: wordGuessModule as unknown as SoloGameModule<unknown, unknown, unknown>,
  minesweeper: minesweeperModule as unknown as SoloGameModule<unknown, unknown, unknown>,
  twenty48: twenty48Module as unknown as SoloGameModule<unknown, unknown, unknown>,
};

export function getSoloModule(id: string): SoloGameModule<unknown, unknown, unknown> | undefined {
  return SOLO_MODULES[id];
}

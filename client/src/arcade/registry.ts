import type { SoloGameModule } from './types';

/**
 * id -> SoloGameModule, the client-only analogue of
 * server/src/games/registry.ts. Real entries land here starting Phase 1 (a
 * Wordle-like, Minesweeper, 2048) — this file exists now so those games have
 * exactly one place to register, matching the room-based games' convention
 * on the server. The pipeline itself (auth, save, sync, RLS, offline queue)
 * was proven end-to-end against a live Supabase project by a throwaway
 * "Coin Call" probe game, since removed.
 */
export const SOLO_MODULES: Record<string, SoloGameModule<unknown, unknown, unknown>> = {};

export function getSoloModule(id: string): SoloGameModule<unknown, unknown, unknown> | undefined {
  return SOLO_MODULES[id];
}

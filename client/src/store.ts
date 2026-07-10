import { create } from 'zustand';
import type { ClientGameView, GameEvent, LobbyState } from '@shared/view';

export type Screen = 'home' | 'lobby' | 'game';

interface AppState {
  connected: boolean;
  lobby: LobbyState | null;
  game: ClientGameView | null;
  log: GameEvent[];
  notice: string | null;
  setConnected(connected: boolean): void;
  setLobby(lobby: LobbyState | null): void;
  setGame(game: ClientGameView | null): void;
  pushEvent(e: GameEvent): void;
  setNotice(notice: string | null): void;
  reset(): void;
}

export const useStore = create<AppState>((set) => ({
  connected: false,
  lobby: null,
  game: null,
  log: [],
  notice: null,
  setConnected: (connected) => set({ connected }),
  setLobby: (lobby) =>
    set((s) => ({
      lobby,
      game: lobby && lobby.phase === 'playing' ? s.game : null,
      log: lobby && lobby.phase === 'playing' ? s.log : [],
    })),
  setGame: (game) => set({ game }),
  pushEvent: (e) => set((s) => ({ log: [...s.log.slice(-59), e] })),
  setNotice: (notice) => set({ notice }),
  reset: () => set({ lobby: null, game: null, log: [], notice: null }),
}));

export function currentScreen(lobby: LobbyState | null, game: ClientGameView | null): Screen {
  if (lobby && lobby.phase === 'playing' && game) return 'game';
  if (lobby) return 'lobby';
  return 'home';
}

import { create } from 'zustand';
import type { ClientGameView, GameEvent, LobbyState } from '@shared/view';
import type { ArtStroke } from '@shared/art';

export type Screen = 'home' | 'lobby' | 'game';

/** Upsert one stroke delta into a canvas's stroke list (immutably). */
function mergeStroke(
  list: ArtStroke[],
  incoming: ArtStroke,
  mode: 'append' | 'replace',
): ArtStroke[] {
  const idx = list.findIndex((s) => s.seat === incoming.seat && s.id === incoming.id);
  if (idx < 0) return [...list, { ...incoming, pts: [...incoming.pts] }];
  const prev = list[idx]!;
  const merged: ArtStroke =
    mode === 'append'
      ? { ...prev, pts: [...prev.pts, ...incoming.pts] }
      : { ...incoming, pts: [...incoming.pts] };
  return list.map((s, i) => (i === idx ? merged : s));
}

interface AppState {
  connected: boolean;
  lobby: LobbyState | null;
  game: ClientGameView | null;
  log: GameEvent[];
  notice: string | null;
  /** Catalog id of a device-local game being played (no room/server). */
  localGame: string | null;
  /**
   * Art games: vector strokes per canvas key. Fed by stroke events, local
   * echo while drawing, and authoritative view merges; keyed to `artRound`
   * so a new game starts from a blank cache.
   */
  artStrokes: Record<string, ArtStroke[]>;
  artRound: number;
  setConnected(connected: boolean): void;
  setLobby(lobby: LobbyState | null): void;
  setGame(game: ClientGameView | null): void;
  setLocalGame(id: string | null): void;
  pushEvent(e: GameEvent): void;
  setNotice(notice: string | null): void;
  artStrokeDelta(cv: string, stroke: ArtStroke, mode: 'append' | 'replace'): void;
  artStrokeUndo(cv: string, seat: number, id: number): void;
  artStrokeClear(cv: string, seat: number): void;
  /** Patch the current imposter view when a vote event arrives (delta sync). */
  artVoteCast(seat: number): void;
  reset(): void;
}

export const useStore = create<AppState>((set) => ({
  connected: false,
  lobby: null,
  game: null,
  log: [],
  notice: null,
  localGame: null,
  artStrokes: {},
  artRound: 0,
  setConnected: (connected) => set({ connected }),
  setLocalGame: (localGame) => set({ localGame }),
  setLobby: (lobby) =>
    set((s) => ({
      lobby,
      game: lobby && lobby.phase === 'playing' ? s.game : null,
      log: lobby && lobby.phase === 'playing' ? s.log : [],
    })),
  setGame: (game) =>
    set((s) => {
      if (!game || game.g !== 'art') return { game };
      let artStrokes = s.artStrokes;
      let artRound = s.artRound;
      if (game.round !== artRound) {
        artStrokes = {};
        artRound = game.round;
      }
      // My live drawing canvas is locally authoritative (unflushed points);
      // everything else takes the server's copy wholesale.
      const skipKey = game.phase === 'draw' ? game.yourCanvasKey : null;
      for (const c of game.canvases) {
        if (!c.strokes) continue;
        if (c.key === skipKey && artStrokes[c.key]) continue;
        if (artStrokes === s.artStrokes) artStrokes = { ...artStrokes };
        artStrokes[c.key] = c.strokes;
      }
      return { game, artStrokes, artRound };
    }),
  pushEvent: (e) => set((s) => ({ log: [...s.log.slice(-59), e] })),
  setNotice: (notice) => set({ notice }),
  artStrokeDelta: (cv, stroke, mode) =>
    set((s) => ({
      artStrokes: { ...s.artStrokes, [cv]: mergeStroke(s.artStrokes[cv] ?? [], stroke, mode) },
    })),
  artStrokeUndo: (cv, seat, id) =>
    set((s) => ({
      artStrokes: {
        ...s.artStrokes,
        [cv]: (s.artStrokes[cv] ?? []).filter((st) => !(st.seat === seat && st.id === id)),
      },
    })),
  artStrokeClear: (cv, seat) =>
    set((s) => ({
      artStrokes: {
        ...s.artStrokes,
        [cv]: (s.artStrokes[cv] ?? []).filter((st) => st.seat !== seat),
      },
    })),
  artVoteCast: (seat) =>
    set((s) => {
      if (s.game?.g !== 'art' || !s.game.imposter) return {};
      if (s.game.imposter.votedSeats.includes(seat)) return {};
      return {
        game: {
          ...s.game,
          imposter: { ...s.game.imposter, votedSeats: [...s.game.imposter.votedSeats, seat] },
        },
      };
    }),
  reset: () => set({ lobby: null, game: null, log: [], notice: null, artStrokes: {}, artRound: 0 }),
}));

export function currentScreen(lobby: LobbyState | null, game: ClientGameView | null): Screen {
  if (lobby && lobby.phase === 'playing' && game) return 'game';
  if (lobby) return 'lobby';
  return 'home';
}

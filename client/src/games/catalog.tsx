import type { ComponentType } from 'react';
import Lobby from '../screens/Lobby';
import GameTable from '../screens/GameTable';
import { IconTile, IconGrid } from '../components/icons';

/**
 * The dashboard catalog. Each entry describes a game for the home screen; games
 * the server can actually host set `available: true` and provide their screens.
 * Adding a game = add an entry here (and, for a real one, its server module).
 */
export interface GameEntry {
  /** Matches the server GameId when available. */
  id: string;
  name: string;
  tagline: string;
  players: string;
  Icon: ComponentType;
  available: boolean;
  screens?: { Lobby: ComponentType; Game: ComponentType };
}

export const GAMES: GameEntry[] = [
  {
    id: 'mahjong',
    name: 'Mahjong',
    tagline: 'Draw, discard, and race to claim the winning tile.',
    players: '2–4 players',
    Icon: IconTile,
    available: true,
    screens: { Lobby, Game: GameTable },
  },
  {
    id: 'uttt',
    name: 'Ultimate Tic-Tac-Toe',
    tagline: 'Nine boards inside one — win the meta-grid.',
    players: '2 players',
    Icon: IconGrid,
    available: false,
  },
];

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}

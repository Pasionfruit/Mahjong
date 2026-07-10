import type { ComponentType } from 'react';
import GameTable from '../screens/GameTable';
import MahjongSettings from './mahjong/Settings';
import UtttGame from './uttt/UtttGame';
import UtttSettingsPanel from './uttt/Settings';
import BombermanGame from './bomberman/BombermanGame';
import BombermanSettingsPanel from './bomberman/Settings';
import {
  IconTile,
  IconGrid,
  IconPalette,
  IconMask,
  IconDare,
  IconBomb,
  IconBus,
  IconTiles,
  IconQuoridor,
  IconPac,
} from '../components/icons';

/**
 * The game catalog powers the home dashboard and routes lobby/game screens.
 * Adding a game = add an entry here (and, for a hostable one, its server module).
 */
export interface GameEntry {
  /** Matches the server GameId when available. */
  id: string;
  name: string;
  tagline: string;
  players: string;
  Icon: ComponentType;
  available: boolean;
  /** Requires a keyboard: creating/joining is blocked on touch-only devices. */
  desktopOnly?: boolean;
  /** The in-game screen and the lobby settings panel for this game. */
  Game?: ComponentType;
  SettingsPanel?: ComponentType;
}

export const GAMES: GameEntry[] = [
  {
    id: 'mahjong',
    name: 'Mahjong',
    tagline: 'Draw, discard, and race to claim the winning tile.',
    players: '2–4 players',
    Icon: IconTile,
    available: true,
    Game: GameTable,
    SettingsPanel: MahjongSettings,
  },
  {
    id: 'uttt',
    name: 'Ultimate Tic-Tac-Toe',
    tagline: 'Nine boards inside one — win the meta-grid.',
    players: '2 players',
    Icon: IconGrid,
    available: true,
    Game: UtttGame,
    SettingsPanel: UtttSettingsPanel,
  },

  {
    id: 'bomberman',
    name: 'Bomberman',
    tagline: 'Drop bombs, dodge the blast.',
    players: '2–8 players · desktop',
    Icon: IconBomb,
    available: true,
    desktopOnly: true,
    Game: BombermanGame,
    SettingsPanel: BombermanSettingsPanel,
  },

  // Coming soon — placeholders for future games.
  {
    id: 'art',
    name: 'Art Games',
    tagline: 'Draw it, guess it, howl with laughter.',
    players: '3–8 players',
    Icon: IconPalette,
    available: false,
  },
  {
    id: 'mafia',
    name: 'Mafia',
    tagline: 'Find the culprits before dawn.',
    players: '5–12 players',
    Icon: IconMask,
    available: false,
  },
  {
    id: 'dare',
    name: 'I Dare You',
    tagline: 'Truths and dares, dealt at random.',
    players: '2–10 players',
    Icon: IconDare,
    available: false,
  },
  {
    id: 'ridethebus',
    name: 'Ride the Bus',
    tagline: 'Call the cards or ride again.',
    players: '2–8 players',
    Icon: IconBus,
    available: false,
  },
  {
    id: 'bananagrams',
    name: 'Bananagrams',
    tagline: 'Race to build your word grid.',
    players: '2–8 players',
    Icon: IconTiles,
    available: false,
  },
  {
    id: 'quoridor',
    name: 'Quoridor',
    tagline: 'Reach the far side; wall off your rival.',
    players: '2–4 players',
    Icon: IconQuoridor,
    available: false,
  },
  {
    id: 'pacman',
    name: 'Pac-Man',
    tagline: 'Chomp pellets, outrun the ghosts.',
    players: '1 player',
    Icon: IconPac,
    available: false,
  },
];

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}

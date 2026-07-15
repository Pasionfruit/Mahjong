import type { ComponentType } from 'react';
import GameTable from '../screens/GameTable';
import MahjongSettings from './mahjong/Settings';
import UtttGame from './uttt/UtttGame';
import UtttSettingsPanel from './uttt/Settings';
import BombermanGame from './bomberman/BombermanGame';
import BombermanSettingsPanel from './bomberman/Settings';
import ArtGame from './art/ArtGame';
import ArtSettingsPanel from './art/Settings';
import QuoridorGame from './quoridor/QuoridorGame';
import TetrisGame from './tetris/TetrisGame';
import TetrisSettingsPanel from './tetris/Settings';
import DotsGame from './dots/DotsGame';
import DotsSettingsPanel from './dots/Settings';
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
  IconTetromino,
  IconDotsBoxes,
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
  /** Played on this device only (hotseat/AI) — no room is created. */
  local?: boolean;
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

  {
    id: 'art',
    name: 'Art Games',
    tagline: 'Draw it, guess it, howl with laughter.',
    players: '2–12 players',
    Icon: IconPalette,
    available: true,
    Game: ArtGame,
    SettingsPanel: ArtSettingsPanel,
  },

  {
    id: 'quoridor',
    name: 'Quoridor',
    tagline: 'Reach the far side; wall off your rival.',
    players: '2 players · local or vs AI',
    Icon: IconQuoridor,
    available: true,
    local: true,
    Game: QuoridorGame,
  },

  {
    id: 'tetris',
    name: 'Tetris',
    tagline: 'Stack, clear, and bury your rivals in garbage.',
    players: '1–4 players',
    Icon: IconTetromino,
    available: true,
    Game: TetrisGame,
    SettingsPanel: TetrisSettingsPanel,
  },

  {
    id: 'dots',
    name: 'Dots & Boxes',
    tagline: 'Close a box, keep your turn, steal the grid.',
    players: '2–6 players · bots',
    Icon: IconDotsBoxes,
    available: true,
    Game: DotsGame,
    SettingsPanel: DotsSettingsPanel,
  },

  // Coming soon — placeholders for future games.
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

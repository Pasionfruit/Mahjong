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
import QuoridorSettingsPanel from './quoridor/Settings';
import TetrisGame from './tetris/TetrisGame';
import TetrisSettingsPanel from './tetris/Settings';
import DotsGame from './dots/DotsGame';
import DotsSettingsPanel from './dots/Settings';
import SumoGame from './sumo/SumoGame';
import SumoSettingsPanel from './sumo/Settings';
import PartyGame from './party/PartyGame';
import PartySettingsPanel from './party/Settings';
import WordGuessGame from './wordguess/WordGuessGame';
import MinesweeperGame from './minesweeper/MinesweeperGame';
import Twenty48Game from './twenty48/Twenty48Game';
import SandPlayGame from './sandplay/SandPlayGame';
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
  IconSpinTop,
  IconDie,
  IconPac,
  IconWordTiles,
  IconMine,
  IconMergeTiles,
  IconHourglass,
} from '../components/icons';

/**
 * Two wings of one catalog: `competitive` games are room-based real-time
 * multiplayer (today's entire shipped lineup); everything else is Brain
 * Arcade — solo, offline-capable, daily/endless puzzles. `category` picks
 * which section of its wing a card renders under on the home screen.
 */
export type GameCategory =
  | 'tabletop'
  | 'action'
  | 'party'
  | 'word'
  | 'logic'
  | 'sorting'
  | 'matching'
  | 'arcade'
  | 'relaxing';

/** Render order for category sections within a wing; also the section label. */
export const CATEGORY_LABELS: Record<GameCategory, string> = {
  tabletop: 'Tabletop & Strategy',
  action: 'Action & Arcade',
  party: 'Party & Social',
  word: 'Word',
  logic: 'Logic',
  sorting: 'Sorting',
  matching: 'Matching',
  arcade: 'Arcade',
  relaxing: 'Relaxing',
};

export const CATEGORY_ORDER: GameCategory[] = [
  'tabletop',
  'action',
  'party',
  'word',
  'logic',
  'sorting',
  'matching',
  'arcade',
  'relaxing',
];

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
  /** Which section this card renders under within its wing. */
  category: GameCategory;
  /** Room-based real-time multiplayer (Party Games wing) vs. solo (Brain Arcade wing). */
  competitive: boolean;
  /** Has a once-a-day challenge mode. */
  hasDaily?: boolean;
  /** Contributes to a global leaderboard. */
  hasLeaderboard?: boolean;
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
    category: 'tabletop',
    competitive: true,
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
    category: 'tabletop',
    competitive: true,
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
    category: 'action',
    competitive: true,
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
    category: 'party',
    competitive: true,
  },

  {
    id: 'quoridor',
    name: 'Quoridor',
    tagline: 'Reach the far side; wall off your rival.',
    players: '2 players · bots',
    Icon: IconQuoridor,
    available: true,
    Game: QuoridorGame,
    SettingsPanel: QuoridorSettingsPanel,
    category: 'tabletop',
    competitive: true,
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
    category: 'action',
    competitive: true,
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
    category: 'tabletop',
    competitive: true,
  },

  {
    id: 'sumo',
    name: 'Spin Sumo',
    tagline: 'Beyblade brawls — shove your rivals off the ring.',
    players: '2–8 players · bots',
    Icon: IconSpinTop,
    available: true,
    Game: SumoGame,
    SettingsPanel: SumoSettingsPanel,
    category: 'action',
    competitive: true,
  },

  {
    id: 'party',
    name: 'Party Board',
    tagline: 'Roll the die, chase the star, betray your friends.',
    players: '2–8 players · bots',
    Icon: IconDie,
    available: true,
    Game: PartyGame,
    SettingsPanel: PartySettingsPanel,
    category: 'party',
    competitive: true,
  },

  {
    id: 'wordguess',
    name: 'Word Guess',
    tagline: 'Five letters, six tries — solve today’s word.',
    players: '1 player',
    Icon: IconWordTiles,
    available: true,
    local: true,
    Game: WordGuessGame,
    category: 'word',
    competitive: false,
    hasDaily: true,
    hasLeaderboard: true,
  },

  {
    id: 'minesweeper',
    name: 'Minesweeper',
    tagline: 'Clear the board without going boom.',
    players: '1 player',
    Icon: IconMine,
    available: true,
    local: true,
    Game: MinesweeperGame,
    category: 'logic',
    competitive: false,
    hasDaily: true,
    hasLeaderboard: true,
  },

  {
    id: 'twenty48',
    name: '2048',
    tagline: 'Slide, merge, chase a new high score.',
    players: '1 player',
    Icon: IconMergeTiles,
    available: true,
    local: true,
    Game: Twenty48Game,
    category: 'arcade',
    competitive: false,
    hasDaily: true,
    hasLeaderboard: true,
  },

  {
    id: 'sandplay',
    name: 'Sand Play',
    tagline: 'Sort falling sand into the right color buckets.',
    players: '1 player',
    Icon: IconHourglass,
    available: true,
    local: true,
    Game: SandPlayGame,
    category: 'relaxing',
    competitive: false,
  },

  // Coming soon — placeholders for future games.
  {
    id: 'mafia',
    name: 'Mafia',
    tagline: 'Find the culprits before dawn.',
    players: '5–12 players',
    Icon: IconMask,
    available: false,
    category: 'party',
    competitive: true,
  },
  {
    id: 'dare',
    name: 'I Dare You',
    tagline: 'Truths and dares, dealt at random.',
    players: '2–10 players',
    Icon: IconDare,
    available: false,
    category: 'party',
    competitive: true,
  },
  {
    id: 'ridethebus',
    name: 'Ride the Bus',
    tagline: 'Call the cards or ride again.',
    players: '2–8 players',
    Icon: IconBus,
    available: false,
    category: 'party',
    competitive: true,
  },
  {
    id: 'bananagrams',
    name: 'Bananagrams',
    tagline: 'Race to build your word grid.',
    players: '2–8 players',
    Icon: IconTiles,
    available: false,
    category: 'tabletop',
    competitive: true,
  },
  {
    id: 'pacman',
    name: 'Pac-Man',
    tagline: 'Chomp pellets, outrun the ghosts.',
    players: '1 player',
    Icon: IconPac,
    available: false,
    category: 'action',
    competitive: true,
  },
];

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}

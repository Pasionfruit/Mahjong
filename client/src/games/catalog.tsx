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
import FlappyGame from './flappy/FlappyGame';
import DoodleJumpGame from './doodlejump/DoodleJumpGame';
import BrickBreakerGame from './brickbreaker/BrickBreakerGame';
import PeggleGame from './peggle/PeggleGame';
import PogoCatGame from './pogocat/PogoCatGame';
import MagicSortGame from './magicsort/MagicSortGame';
import UntangleGame from './untangle/UntangleGame';
import PaintByNumberGame from './paintbynumber/PaintByNumberGame';
import SudokuGame from './sudoku/SudokuGame';
import ParkingJamGame from './parkingjam/ParkingJamGame';
import CrosswordGame from './crossword/CrosswordGame';
import WordSearchGame from './wordsearch/WordSearchGame';
import BananagramsGame from './bananagrams/BananagramsGame';
import BananagramsSettingsPanel from './bananagrams/Settings';
import MinefieldGame from './minefield/MinefieldGame';
import MinefieldSettingsPanel from './minefield/Settings';
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
  IconWordTiles,
  IconMine,
  IconMergeTiles,
  IconHourglass,
  IconFlappy,
  IconSpring,
  IconPaddle,
  IconPegs,
  IconPogoCat,
  IconFlasks,
  IconKnot,
  IconPaintGrid,
  IconSudoku,
  IconCar,
  IconCrossword,
  IconWordSearch,
  IconMinefield,
} from '../components/icons';

/**
 * Two wings of one catalog: `competitive` games are room-based real-time
 * multiplayer (Party Games), everything else is Zen Endless — solo,
 * offline-capable puzzles with a shared leaderboard. The Daily wing is
 * derived: every entry with `hasDaily` appears there with a per-profile
 * done-today check. `category` picks which section of its wing a card
 * renders under on the home screen.
 */
export type GameCategory =
  | 'tabletop'
  | 'action'
  | 'party'
  | 'arcade'
  | 'relaxing'
  | 'sorting'
  | 'matching'
  | 'logic'
  | 'word';

/** Render order for category sections within a wing; also the section label. */
export const CATEGORY_LABELS: Record<GameCategory, string> = {
  tabletop: 'Tabletop & Strategy',
  action: 'Action & Arcade',
  party: 'Party & Social',
  arcade: 'Arcade',
  relaxing: 'Relaxing',
  sorting: 'Sorting',
  matching: 'Matching',
  logic: 'Logic',
  word: 'Word',
};

export const CATEGORY_ORDER: GameCategory[] = [
  'tabletop',
  'action',
  'party',
  'arcade',
  'relaxing',
  'sorting',
  'matching',
  'logic',
  'word',
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
  /** Room-based real-time multiplayer (Party Games wing) vs. solo (Zen Endless wing). */
  competitive: boolean;
  /** Has a once-a-day challenge mode — the game also appears in the Daily wing. */
  hasDaily?: boolean;
  /** What the Daily wing calls this game's daily challenge (e.g. "Peggle Map"). */
  dailyLabel?: string;
  /** Contributes to a global leaderboard. */
  hasLeaderboard?: boolean;
}

export const GAMES: GameEntry[] = [
  // ── Party Games: room-based real-time multiplayer ────────────────────────
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
    id: 'bananagrams',
    name: 'Bananagrams',
    tagline: 'Race to build your word grid — peel, dump, bananas!',
    players: '2–8 players',
    Icon: IconTiles,
    available: true,
    Game: BananagramsGame,
    SettingsPanel: BananagramsSettingsPanel,
    category: 'tabletop',
    competitive: true,
  },
  {
    id: 'minefield',
    name: 'Minesweeper',
    tagline: 'Everyone races an identical board — first clean clear wins.',
    players: '2–8 players',
    Icon: IconMinefield,
    available: true,
    Game: MinefieldGame,
    SettingsPanel: MinefieldSettingsPanel,
    category: 'action',
    competitive: true,
  },

  // ── Zen Endless: solo, offline-capable, shared leaderboards ──────────────
  {
    id: 'flappy',
    name: 'Flappy Bird',
    tagline: 'Tap to flap — thread the endless pipes.',
    players: '1 player',
    Icon: IconFlappy,
    available: true,
    local: true,
    Game: FlappyGame,
    category: 'arcade',
    competitive: false,
    hasLeaderboard: true,
  },
  {
    id: 'doodlejump',
    name: 'Doodle Jump',
    tagline: 'Bounce ever higher — never look down.',
    players: '1 player',
    Icon: IconSpring,
    available: true,
    local: true,
    Game: DoodleJumpGame,
    category: 'arcade',
    competitive: false,
    hasLeaderboard: true,
  },
  {
    id: 'brickbreaker',
    name: 'Brick Breaker',
    tagline: 'Smash every brick, keep the ball alive.',
    players: '1 player',
    Icon: IconPaddle,
    available: true,
    local: true,
    Game: BrickBreakerGame,
    category: 'arcade',
    competitive: false,
    hasLeaderboard: true,
  },
  {
    id: 'peggle',
    name: 'Peggle',
    tagline: 'Bank wild shots off pegs — clear the orange ones.',
    players: '1 player',
    Icon: IconPegs,
    available: true,
    local: true,
    Game: PeggleGame,
    category: 'arcade',
    competitive: false,
    hasDaily: true,
    dailyLabel: 'Peggle Map',
    hasLeaderboard: true,
  },
  {
    id: 'pogocat',
    name: 'Pogo Cat',
    tagline: 'Charge the spring, time the bounce, stick the landing.',
    players: '1 player',
    Icon: IconPogoCat,
    available: true,
    local: true,
    Game: PogoCatGame,
    category: 'arcade',
    competitive: false,
    hasLeaderboard: true,
  },
  {
    id: 'untangle',
    name: 'Rope Untangle',
    tagline: 'Drag the pins until no ropes cross.',
    players: '1 player',
    Icon: IconKnot,
    available: true,
    local: true,
    Game: UntangleGame,
    category: 'relaxing',
    competitive: false,
    hasDaily: true,
    dailyLabel: 'Rope Untangle',
    hasLeaderboard: true,
  },
  {
    id: 'paintbynumber',
    name: 'Paint by Number',
    tagline: 'Fill the numbered cells, reveal the picture.',
    players: '1 player',
    Icon: IconPaintGrid,
    available: true,
    local: true,
    Game: PaintByNumberGame,
    category: 'relaxing',
    competitive: false,
    hasDaily: true,
    dailyLabel: 'Coloring Page',
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
    category: 'sorting',
    competitive: false,
    hasDaily: true,
    dailyLabel: 'Sand Level',
    hasLeaderboard: true,
  },
  {
    id: 'magicsort',
    name: 'Magic Sort',
    tagline: 'Pour the potions until every flask runs pure.',
    players: '1 player',
    Icon: IconFlasks,
    available: true,
    local: true,
    Game: MagicSortGame,
    category: 'sorting',
    competitive: false,
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
    category: 'matching',
    competitive: false,
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
    dailyLabel: 'Minefield',
    hasLeaderboard: true,
  },
  {
    id: 'sudoku',
    name: 'Sudoku',
    tagline: 'Nine rows, nine columns, no repeats.',
    players: '1 player',
    Icon: IconSudoku,
    available: true,
    local: true,
    Game: SudokuGame,
    category: 'logic',
    competitive: false,
    hasLeaderboard: true,
  },
  {
    id: 'parkingjam',
    name: 'Parking Jam',
    tagline: 'Slide the cars free of the gridlock.',
    players: '1 player',
    Icon: IconCar,
    available: true,
    local: true,
    Game: ParkingJamGame,
    category: 'logic',
    competitive: false,
    hasLeaderboard: true,
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
    dailyLabel: 'Word',
    hasLeaderboard: true,
  },
  {
    id: 'crossword',
    name: 'Crossword Mini',
    tagline: 'A bite-size crossword, five by five.',
    players: '1 player',
    Icon: IconCrossword,
    available: true,
    local: true,
    Game: CrosswordGame,
    category: 'word',
    competitive: false,
    hasDaily: true,
    dailyLabel: 'Mini Crossword',
    hasLeaderboard: true,
  },
  {
    id: 'wordsearch',
    name: 'Word Search',
    tagline: 'Find every word hiding in the grid.',
    players: '1 player',
    Icon: IconWordSearch,
    available: true,
    local: true,
    Game: WordSearchGame,
    category: 'word',
    competitive: false,
    hasDaily: true,
    dailyLabel: 'Word Search',
    hasLeaderboard: true,
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
];

export function gameById(id: string): GameEntry | undefined {
  return GAMES.find((g) => g.id === id);
}

/** Every launchable game with a once-a-day challenge — the Daily wing. */
export function dailyGames(): GameEntry[] {
  return GAMES.filter((g) => g.available && g.hasDaily);
}

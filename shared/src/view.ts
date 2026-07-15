import type { Tile, TileKind } from './tiles';
import type { GameSettings } from './settings';
import type { GameId } from './games';
import type { Cell, Mark, SmallResult, UtttPlayer, UtttResult, UtttSettings } from './uttt';
import type { BomberPlayerView, BombView, BombermanSettings } from './bomberman';
import type { ArtSettings, ArtView } from './art';
import type { TetrisSettings, TetrisView } from './tetris';
import type { DotsSettings, DotsView } from './dots';
import type { SumoSettings, SumoView } from './sumo';

export type MeldType = 'pong' | 'chow' | 'kongExposed' | 'kongConcealed' | 'kongAdded';

export interface Meld {
  type: MeldType;
  tiles: Tile[];
  /** Seat the claimed tile came from (pong/chow/kongExposed). */
  claimedFromSeat?: number;
}

/** A meld as another player sees it: concealed-kong tiles are masked (null = face-down). */
export interface MeldView {
  type: MeldType;
  tiles: (Tile | null)[];
  claimedFromSeat?: number;
}

export interface PublicPlayer {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  isDealer: boolean;
  handCount: number;
  /** Present only in open-hands mode (your own hand is in ClientGameView.hand). */
  hand?: Tile[];
  melds: MeldView[];
  flowers: Tile[];
  discards: Tile[];
  wins: number;
}

export type GamePhase = 'awaitingDiscard' | 'claimWindow' | 'roundOver';

export interface YourOptions {
  canDiscard: boolean;
  canWinSelfDraw: boolean;
  /** Kinds you hold 4 of (concealed kong available on your turn). */
  concealedKongKinds: TileKind[];
  /** Tile ids in your hand that would upgrade one of your pongs to a kong. */
  addedKongTileIds: number[];
  /** Non-null while a claim window is open and you have at least one claim. */
  claim: {
    win: boolean;
    pong: boolean;
    kong: boolean;
    /** Each entry is the two hand tiles that complete a run with the discard. */
    chows: [Tile, Tile][];
    /** You reserved a chow (clicked first) and must now pick which run to complete. */
    mustPickChow: boolean;
  } | null;
}

export interface RoundResult {
  type: 'win' | 'wallExhausted';
  winnerSeat?: number;
  /** Winner's full concealed hand including the winning tile. */
  winningHand?: Tile[];
  winningTile?: Tile;
  by?: 'discard' | 'selfDraw';
  /** Discarder's seat when won by discard. */
  fromSeat?: number;
}

export interface MahjongView {
  g: 'mahjong';
  yourSeat: number;
  hand: Tile[];
  drawnTileId: number | null;
  players: PublicPlayer[];
  wallCount: number;
  turnSeat: number;
  phase: GamePhase;
  /** Epoch ms; null when no deadline is armed. */
  deadline: number | null;
  lastDiscard: { seat: number; tile: Tile } | null;
  /** Every live discard this round, oldest first; claimed tiles are removed. */
  discardPile: { seat: number; tile: Tile }[];
  paused: boolean;
  yourOptions: YourOptions;
  settings: GameSettings;
  /** Resolved N for this game (settings.setsToWin may be null = auto). */
  setsToWin: number;
  round: number;
  result: RoundResult | null;
}

export interface UtttView {
  g: 'uttt';
  yourSeat: number;
  turnSeat: number;
  /** Your mark, or null if you're only spectating. */
  yourMark: Mark | null;
  /** Nine small boards, each an array of nine cells. */
  boards: Cell[][];
  /** Winner (or draw/open) of each of the nine small boards. */
  boardResults: SmallResult[];
  /** The board the next move is forced into, or null to play anywhere open. */
  activeBoard: number | null;
  lastMove: { board: number; cell: number } | null;
  deadline: number | null;
  paused: boolean;
  players: UtttPlayer[];
  settings: UtttSettings;
  round: number;
  result: UtttResult | null;
}

export interface BombermanView {
  g: 'bomberman';
  yourSeat: number;
  /** Grid rows as strings of BomberCellChar; hidden powerups are not sent. */
  grid: string[];
  bombs: BombView[];
  /** Cell indices (y * width + x) currently on fire. */
  explosions: number[];
  players: BomberPlayerView[];
  /** Seconds until the arena starts closing, or null when sudden death is off. */
  suddenDeathSecondsLeft: number | null;
  /** True once the walls have started closing in. */
  shrinking: boolean;
  paused: boolean;
  settings: BombermanSettings;
  round: number;
  /** winnerTeam set on a team victory; both null on a draw. */
  result: { winnerSeat: number | null; winnerTeam: number | null } | null;
}

/** The redacted per-seat snapshot, discriminated by which game is running. */
export type ClientGameView =
  | MahjongView
  | UtttView
  | BombermanView
  | ArtView
  | TetrisView
  | DotsView
  | SumoView;

export interface LobbyPlayer {
  seat: number;
  nickname: string;
  connected: boolean;
  isHost: boolean;
  isBot?: boolean;
  /** Chosen player color (games that support it), else unset. */
  color?: string;
  /** Chosen team index (games with team mode), else unset. */
  team?: number;
  wins: number;
}

export interface LobbyState {
  roomCode: string;
  /** Which game this room is hosting. */
  gameId: GameId;
  phase: 'lobby' | 'playing';
  players: LobbyPlayer[];
  settings:
    | GameSettings
    | UtttSettings
    | BombermanSettings
    | ArtSettings
    | TetrisSettings
    | DotsSettings
    | SumoSettings;
  /** Player-count bounds for this game, so the lobby can render them. */
  minPlayers: number;
  maxPlayers: number;
  /** False for games with no bot support (hides/blocks the add-bot flow). */
  botsSupported: boolean;
  round: number;
  /**
   * The seat of the player this state was sent to, or -1 for a late joiner
   * waiting for the current game to finish.
   */
  yourSeat: number;
  /** Late joiners who will be seated when the game returns to the lobby. */
  waiting: { nickname: string; connected: boolean }[];
}

export type GameEvent =
  | { t: 'roundStart'; round: number; dealerSeat: number }
  | { t: 'draw'; seat: number }
  | { t: 'discard'; seat: number; tile: Tile }
  | { t: 'claim'; seat: number; claim: 'pong' | 'chow' | 'kong'; tiles: Tile[] }
  | { t: 'concealedKong'; seat: number }
  | { t: 'addedKong'; seat: number; tile: Tile }
  | { t: 'flower'; seat: number; tile: Tile }
  | { t: 'win'; seat: number; by: 'discard' | 'selfDraw' | 'lastStanding' }
  | { t: 'timeout'; seat: number }
  | { t: 'wallExhausted' }
  // Ultimate Tic-Tac-Toe
  | { t: 'place'; seat: number }
  // Bomberman
  | { t: 'bomb'; seat: number }
  | { t: 'boom' }
  | { t: 'powerup'; seat: number }
  /** fatal: out of the game (vs. losing a spare life). */
  | { t: 'death'; seat: number; fatal: boolean }
  /** The game ended with no winner (mutual knockout). */
  | { t: 'gameOver' }
  // Art games — stroke deltas append into the client-side canvas cache.
  | {
      t: 'stroke';
      cv: string;
      seat: number;
      id: number;
      color: string;
      size: number;
      erase?: boolean;
      pts: number[];
      /** Complete stroke (resync replay): replace instead of append. */
      full?: boolean;
    }
  | { t: 'strokeUndo'; cv: string; seat: number; id: number }
  | { t: 'strokeClear'; cv: string; seat: number }
  | { t: 'artGuess'; seat: number; correct: boolean }
  | { t: 'artVote'; seat: number }
  | { t: 'artPhase'; phase: string }
  // Tetris
  | { t: 'lines'; seat: number; count: number }
  | { t: 'garbage'; seat: number; rows: number }
  // Dots and Boxes
  | { t: 'edge'; seat: number }
  | { t: 'box'; seat: number; count: number }
  // Spin Sumo
  | { t: 'ko'; seat: number; by: number | null }
  | { t: 'clash' };
